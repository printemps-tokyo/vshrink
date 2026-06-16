import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { audioFormatSpec, type AudioFormat } from "./audio.js";
import { buildConcatList } from "./concat.js";
import { buildPaletteGenFilter, buildPaletteUseFilter } from "./gif.js";
import { escapeSubtitlesPath } from "./subtitles.js";

const pexecFile = promisify(execFile);

export interface ProbeResult {
  /** Duration in seconds. */
  durationSec: number;
  /** Source audio bitrate in kbit/s, if detectable. */
  audioKbps?: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
}

/** Throw a friendly error if ffmpeg/ffprobe are not on PATH. */
export async function assertFfmpeg(): Promise<void> {
  try {
    await pexecFile("ffmpeg", ["-version"]);
    await pexecFile("ffprobe", ["-version"]);
  } catch {
    throw new Error(
      "ffmpeg / ffprobe not found. Install from https://ffmpeg.org " +
        "(macOS: brew install ffmpeg).",
    );
  }
}

/** Inspect a media file with ffprobe. */
export async function probe(input: string): Promise<ProbeResult> {
  const { stdout } = await pexecFile("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    input,
  ]);

  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      bit_rate?: string;
      width?: number;
      height?: number;
    }>;
  };

  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const durationSec = Number(data.format?.duration);

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error(`could not determine media duration: ${input}`);
  }

  const audioBitRate = audio?.bit_rate ? Number(audio.bit_rate) : undefined;

  return {
    durationSec,
    audioKbps:
      audioBitRate && Number.isFinite(audioBitRate)
        ? Math.round(audioBitRate / 1000)
        : undefined,
    width: video?.width,
    height: video?.height,
    hasAudio: Boolean(audio),
  };
}

export interface EncodeOptions {
  input: string;
  output: string;
  videoKbps: number;
  audioKbps: number;
  hasAudio: boolean;
  maxHeight?: number;
  /** CRF value for quality-based mode (when no target size). */
  crf?: number;
  onProgress?: (pass: 1 | 2 | "crf") => void;
}

function scaleFilter(maxHeight?: number): string[] {
  if (!maxHeight) return [];
  // Downscale only if taller than maxHeight; keep even dimensions for libx264.
  return ["-vf", `scale=-2:'min(${maxHeight},ih)'`];
}

/** Two-pass H.264 encode targeting a specific video bitrate. */
export async function encodeTwoPass(opts: EncodeOptions): Promise<void> {
  const { input, output, videoKbps, audioKbps, hasAudio, maxHeight } = opts;
  const scale = scaleFilter(maxHeight);
  const passLogPrefix = `${output}.vshrink-pass`;

  const common = [
    "-y",
    "-i",
    input,
    "-c:v",
    "libx264",
    "-b:v",
    `${videoKbps}k`,
    "-preset",
    "medium",
    ...scale,
    "-passlogfile",
    passLogPrefix,
  ];

  opts.onProgress?.(1);
  await pexecFile("ffmpeg", [
    ...common,
    "-pass",
    "1",
    "-an",
    "-f",
    "null",
    process.platform === "win32" ? "NUL" : "/dev/null",
  ]);

  opts.onProgress?.(2);
  const audioArgs = hasAudio
    ? ["-c:a", "aac", "-b:a", `${audioKbps}k`]
    : ["-an"];
  await pexecFile("ffmpeg", [
    ...common,
    "-pass",
    "2",
    ...audioArgs,
    "-movflags",
    "+faststart",
    output,
  ]);

  await cleanupPassLogs(passLogPrefix);
}

/** Quality-based (CRF) encode when no target size is given. */
export async function encodeCrf(opts: EncodeOptions): Promise<void> {
  const { input, output, audioKbps, hasAudio, maxHeight, crf = 23 } = opts;
  opts.onProgress?.("crf");
  const audioArgs = hasAudio
    ? ["-c:a", "aac", "-b:a", `${audioKbps}k`]
    : ["-an"];
  await pexecFile("ffmpeg", [
    "-y",
    "-i",
    input,
    "-c:v",
    "libx264",
    "-crf",
    String(crf),
    "-preset",
    "medium",
    ...scaleFilter(maxHeight),
    ...audioArgs,
    "-movflags",
    "+faststart",
    output,
  ]);
}

export interface StreamInfo {
  index: number;
  type: string;
  codec?: string;
  lang?: string;
  width?: number;
  height?: number;
  channels?: number;
}

/** List all streams in a file (video / audio / subtitle), in order. */
export async function listStreams(input: string): Promise<StreamInfo[]> {
  const { stdout } = await pexecFile("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    input,
  ]);
  const data = JSON.parse(stdout) as {
    streams?: Array<{
      index: number;
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      channels?: number;
      tags?: { language?: string };
    }>;
  };
  return (data.streams ?? []).map((s) => ({
    index: s.index,
    type: s.codec_type ?? "unknown",
    codec: s.codec_name,
    lang: s.tags?.language,
    width: s.width,
    height: s.height,
    channels: s.channels,
  }));
}

export interface ConvertOptions {
  input: string;
  output: string;
  /** Video stream index within its type (0 = first video track). */
  videoTrack?: number;
  /** Audio stream index within its type (0 = first audio track). */
  audioTrack?: number;
  crf?: number;
  audioKbps?: number;
  maxHeight?: number;
  /** Burn an external subtitle file (.srt/.ass) into the video. Needs libass. */
  burnSubsPath?: string;
  /** Burn an embedded subtitle stream (by subtitle index) into the video. Needs libass. */
  burnTrack?: number;
}

/**
 * Build the scale expression (without the -vf flag) used by the convert filter
 * chain, or undefined when no height cap is requested.
 */
function scaleExpr(maxHeight?: number): string | undefined {
  if (!maxHeight) return undefined;
  return `scale=-2:'min(${maxHeight},ih)'`;
}

/**
 * Build the "subtitles" video filter for burn-in (hardsub). An external file
 * is referenced by its escaped path; an embedded track is selected with si=<n>
 * against the (escaped) input path.
 */
function subtitlesFilter(
  input: string,
  burnSubsPath?: string,
  burnTrack?: number,
): string | undefined {
  if (burnSubsPath !== undefined) {
    return `subtitles='${escapeSubtitlesPath(burnSubsPath)}'`;
  }
  if (burnTrack !== undefined) {
    return `subtitles='${escapeSubtitlesPath(input)}':si=${burnTrack}`;
  }
  return undefined;
}

/** Transcode to H.264/AAC mp4, selecting specific tracks and dropping subs. */
export async function convert(opts: ConvertOptions): Promise<void> {
  const {
    input,
    output,
    videoTrack = 0,
    audioTrack = 0,
    crf = 23,
    audioKbps = 192,
    maxHeight,
    burnSubsPath,
    burnTrack,
  } = opts;

  if (burnSubsPath !== undefined && burnTrack !== undefined) {
    throw new Error("--burn-subs and --burn-track are mutually exclusive");
  }

  // Compose -vf from the optional scale and subtitles filters. Scale runs first
  // so the subtitles are rendered at the final output resolution.
  const filters = [
    scaleExpr(maxHeight),
    subtitlesFilter(input, burnSubsPath, burnTrack),
  ].filter((f): f is string => f !== undefined);
  const vf = filters.length > 0 ? ["-vf", filters.join(",")] : [];

  try {
    await pexecFile("ffmpeg", [
      "-y",
      "-i",
      input,
      "-map",
      `0:v:${videoTrack}`,
      "-map",
      `0:a:${audioTrack}?`,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      String(crf),
      ...vf,
      "-c:a",
      "aac",
      "-b:a",
      `${audioKbps}k`,
      "-sn",
      "-movflags",
      "+faststart",
      output,
    ]);
  } catch (err) {
    const message = (err as Error).message;
    // Only the genuine "filter not built in" signature should be reported as a
    // libass problem. Other burn-in failures (bad path, wrong si= index, etc.)
    // must surface their real ffmpeg error instead of a misleading message.
    const burningSubs = burnSubsPath !== undefined || burnTrack !== undefined;
    if (burningSubs && /(No such filter|Unknown filter):?\s*'?subtitles/i.test(message)) {
      throw new Error(
        "subtitle burn-in failed: this ffmpeg build lacks the 'subtitles' filter " +
          "(libass). Install an ffmpeg built with --enable-libass.\n" +
          message,
      );
    }
    throw err;
  }
}

export interface ConcatOptions {
  inputs: string[];
  output: string;
  crf?: number;
  audioKbps?: number;
  maxHeight?: number;
}

/** Concatenate multiple files into one mp4 via the concat demuxer (re-encode). */
export async function concat(opts: ConcatOptions): Promise<void> {
  const { inputs, output, crf = 23, audioKbps = 192, maxHeight } = opts;
  const { writeFile, rm, mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");

  const dir = await mkdtemp(join(tmpdir(), "vshrink-"));
  const listPath = join(dir, "concat.txt");
  await writeFile(listPath, buildConcatList(inputs.map((p) => resolve(p))), "utf8");

  try {
    await pexecFile("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      String(crf),
      ...scaleFilter(maxHeight),
      "-c:a",
      "aac",
      "-b:a",
      `${audioKbps}k`,
      "-sn",
      "-movflags",
      "+faststart",
      output,
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface GifOptions {
  input: string;
  output: string;
  /** Output frame rate (default 12). */
  fps?: number;
  /** Target width in pixels; height keeps aspect ratio (default 480). */
  width?: number;
  /** Start timestamp (maps to -ss), e.g. "00:00:05" or "5". */
  start?: string;
  /** Duration in seconds (maps to -t). */
  durationSec?: number;
}

/**
 * Render a high-quality GIF using the two-pass palette method: pass 1 generates
 * an optimal palette, pass 2 applies it. The palette is written to a temp dir
 * and cleaned up afterwards.
 */
export async function gif(opts: GifOptions): Promise<void> {
  const { input, output, fps = 12, width = 480, start, durationSec } = opts;
  const { rm, mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  // -ss / -t go before -i for fast input seeking.
  const seek = [
    ...(start !== undefined ? ["-ss", start] : []),
    ...(durationSec !== undefined ? ["-t", String(durationSec)] : []),
  ];

  const dir = await mkdtemp(join(tmpdir(), "vshrink-"));
  const palette = join(dir, "palette.png");

  try {
    await pexecFile("ffmpeg", [
      ...seek,
      "-i",
      input,
      "-vf",
      buildPaletteGenFilter({ fps, width }),
      "-y",
      palette,
    ]);
    await pexecFile("ffmpeg", [
      ...seek,
      "-i",
      input,
      "-i",
      palette,
      "-lavfi",
      buildPaletteUseFilter({ fps, width }),
      "-y",
      output,
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface ExtractSubsOptions {
  input: string;
  output: string;
  /** Subtitle stream index within its type (0 = first subtitle track). */
  track?: number;
}

/**
 * Extract a subtitle stream to a file. The output extension determines the
 * format (.srt / .ass / .vtt).
 */
export async function extractSubs(opts: ExtractSubsOptions): Promise<void> {
  const { input, output, track = 0 } = opts;
  await pexecFile("ffmpeg", [
    "-y",
    "-i",
    input,
    "-map",
    `0:s:${track}`,
    output,
  ]);
}

export interface AudioOptions {
  input: string;
  output: string;
  /** Output format (mp3 | aac | m4a | wav | opus | flac). */
  format: AudioFormat;
  /** Audio stream index within its type (0 = first audio track). */
  track?: number;
  /** Bitrate in kbit/s for lossy formats (default 192). */
  bitrateKbps?: number;
}

/** Extract (and re-encode) an audio track to a standalone audio file. */
export async function extractAudio(opts: AudioOptions): Promise<void> {
  const { input, output, format, track = 0, bitrateKbps = 192 } = opts;
  const spec = audioFormatSpec(format);
  const args = [
    "-y",
    "-i",
    input,
    "-map",
    `0:a:${track}`,
    "-vn",
    "-c:a",
    spec.codec,
  ];
  if (spec.lossy) {
    args.push("-b:a", `${bitrateKbps}k`);
  }
  args.push(output);
  await pexecFile("ffmpeg", args);
}

async function cleanupPassLogs(prefix: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await Promise.allSettled([
    rm(`${prefix}-0.log`, { force: true }),
    rm(`${prefix}-0.log.mbtree`, { force: true }),
  ]);
}
