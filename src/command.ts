/**
 * Pure builders for the ffmpeg argument vectors used by the shrink encode
 * modes, plus a shell-quoting formatter. These let `--print-cmd` show the exact
 * command vshrink would run, and keep the executor and the preview in sync from
 * a single source of truth (no risk of the printed command drifting from the
 * real one).
 */

/** Video codecs the shrink command can encode to. */
export type Codec = "h264" | "hevc" | "av1";

export interface CodecSpec {
  /** The ffmpeg encoder. */
  encoder: string;
  /** CRF used without --crf: each encoder's own default. */
  defaultCrf: number;
  /** CRF range the encoder accepts through ffmpeg. */
  minCrf: number;
  maxCrf: number;
  /** Speed/quality preset arguments. */
  preset: string[];
  /** Container hints for the MP4 output. */
  extra: string[];
  /** Where a two-pass encode keeps its first-pass stats. */
  stats: (prefix: string) => string[];
}

const passLogFile = (prefix: string): string[] => ["-passlogfile", prefix];

export const CODECS: Record<Codec, CodecSpec> = {
  h264: {
    encoder: "libx264",
    defaultCrf: 23,
    minCrf: 0,
    maxCrf: 51,
    preset: ["-preset", "medium"],
    extra: [],
    stats: passLogFile,
  },
  hevc: {
    encoder: "libx265",
    // x265's documented default rate factor.
    defaultCrf: 28,
    minCrf: 0,
    maxCrf: 51,
    preset: ["-preset", "medium"],
    // hvc1 instead of hev1, so QuickTime and Apple devices play the file.
    extra: ["-tag:v", "hvc1"],
    // libx265 ignores -passlogfile: its stats file is set with -x265-stats
    // (without it, x265_2pass.log lands in the working directory).
    stats: (prefix) => ["-x265-stats", `${prefix}.x265.log`],
  },
  av1: {
    encoder: "libsvtav1",
    // SVT-AV1's documented default CRF.
    defaultCrf: 35,
    // ffmpeg's libsvtav1 takes crf 0 as "not set".
    minCrf: 1,
    maxCrf: 63,
    // SVT-AV1's own default preset.
    preset: [],
    extra: [],
    // libsvtav1 hands its stats to ffmpeg, which writes them to -passlogfile.
    stats: passLogFile,
  },
};

export function isCodec(name: string): name is Codec {
  return Object.prototype.hasOwnProperty.call(CODECS, name);
}

/** The files a two-pass encode (any codec) may leave behind for `prefix`. */
export function passLogFiles(prefix: string): string[] {
  return [
    `${prefix}-0.log`,
    `${prefix}-0.log.mbtree`,
    `${prefix}.x265.log`,
    `${prefix}.x265.log.cutree`,
  ];
}

function scaleFilter(maxHeight?: number): string[] {
  if (!maxHeight) return [];
  // Downscale only if taller than maxHeight; keep even dimensions, which
  // every encoder here needs for 4:2:0 video.
  return ["-vf", `scale=-2:'min(${maxHeight},ih)'`];
}

function seekArgs(start?: string): string[] {
  return start !== undefined ? ["-ss", start] : [];
}

function durationArgs(durationSec?: number): string[] {
  return durationSec !== undefined ? ["-t", String(durationSec)] : [];
}

function audioArgs(hasAudio: boolean, audioKbps: number): string[] {
  return hasAudio ? ["-c:a", "aac", "-b:a", `${audioKbps}k`] : ["-an"];
}

/** Inputs needed to build a shrink encode command (a subset of EncodeOptions). */
export interface EncodeArgsInput {
  input: string;
  output: string;
  videoKbps: number;
  audioKbps: number;
  hasAudio: boolean;
  maxHeight?: number;
  crf?: number;
  start?: string;
  durationSec?: number;
  /** Video codec (default h264). */
  codec?: Codec;
}

/** The -passlogfile prefix used by the two-pass encode for this output. */
export function twoPassLogPrefix(output: string): string {
  return `${output}.vshrink-pass`;
}

/** The platform's null sink for the discard pass. */
export function nullDevice(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "NUL" : "/dev/null";
}

/** The two ffmpeg argument vectors (pass 1 then pass 2) for a target-size encode. */
export function buildTwoPassArgs(
  o: EncodeArgsInput,
  platform: NodeJS.Platform = process.platform,
): [string[], string[]] {
  const spec = CODECS[o.codec ?? "h264"];
  const prefix = twoPassLogPrefix(o.output);
  // -nostats stops ffmpeg from streaming per-frame progress lines to stderr,
  // which would overflow execFile's buffered stderr on long encodes.
  const common = [
    "-y",
    "-nostats",
    ...seekArgs(o.start),
    "-i",
    o.input,
    ...durationArgs(o.durationSec),
    "-c:v",
    spec.encoder,
    "-b:v",
    `${o.videoKbps}k`,
    ...spec.preset,
    ...scaleFilter(o.maxHeight),
    ...spec.stats(prefix),
  ];
  const pass1 = [...common, "-pass", "1", "-an", "-f", "null", nullDevice(platform)];
  const pass2 = [
    ...common,
    "-pass",
    "2",
    ...audioArgs(o.hasAudio, o.audioKbps),
    ...spec.extra,
    "-movflags",
    "+faststart",
    o.output,
  ];
  return [pass1, pass2];
}

/** The single ffmpeg argument vector for a quality-based (CRF) encode. */
export function buildCrfArgs(o: EncodeArgsInput): string[] {
  const spec = CODECS[o.codec ?? "h264"];
  return [
    "-y",
    "-nostats",
    ...seekArgs(o.start),
    "-i",
    o.input,
    ...durationArgs(o.durationSec),
    "-c:v",
    spec.encoder,
    "-crf",
    String(o.crf ?? spec.defaultCrf),
    ...spec.preset,
    ...scaleFilter(o.maxHeight),
    ...audioArgs(o.hasAudio, o.audioKbps),
    ...spec.extra,
    "-movflags",
    "+faststart",
    o.output,
  ];
}

// Characters that never need quoting in a POSIX shell.
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** Quote a single argument for a copy-pasteable POSIX shell command line. */
export function quoteArg(arg: string): string {
  if (arg.length > 0 && SHELL_SAFE.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/** Render a command and its arguments as one shell-quoted line. */
export function formatCommand(bin: string, args: string[]): string {
  return [bin, ...args.map(quoteArg)].join(" ");
}
