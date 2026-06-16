/**
 * vshrink — public API.
 * Shrink a video toward a target file size using ffmpeg.
 */
import { stat } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { planBitrate, formatSize, type BitratePlan } from "./bitrate.js";
import {
  assertFfmpeg,
  probe,
  encodeTwoPass,
  encodeCrf,
  type ProbeResult,
} from "./ffmpeg.js";
import { PRESETS, DEFAULT_PRESET, isPreset } from "./presets.js";

export { planBitrate, parseSize, formatSize } from "./bitrate.js";
export { PRESETS, DEFAULT_PRESET, isPreset, type Preset } from "./presets.js";
export {
  probe,
  listStreams,
  convert,
  concat,
  gif,
  extractSubs,
  extractAudio,
  extractThumbnail,
  type ProbeResult,
  type StreamInfo,
  type ConvertOptions,
  type ConcatOptions,
  type GifOptions,
  type ExtractSubsOptions,
  type AudioOptions,
  type ThumbOptions,
} from "./ffmpeg.js";
export { resolveThumbTime } from "./thumb.js";
export {
  buildTimecodeFilter,
  isTimecodePosition,
  TIMECODE_POSITIONS,
  type TimecodePosition,
  type TimecodeOptions,
} from "./timecode.js";
export { buildConcatList, escapeConcatPath } from "./concat.js";
export {
  audioFormatSpec,
  isAudioFormat,
  AUDIO_FORMATS,
  type AudioFormat,
  type AudioFormatSpec,
} from "./audio.js";
export {
  buildPaletteGenFilter,
  buildPaletteUseFilter,
  type PaletteFilterOptions,
} from "./gif.js";
export { escapeSubtitlesPath } from "./subtitles.js";

export interface ShrinkOptions {
  input: string;
  /** Output path. Defaults to "<name>.vshrink.mp4" next to the input. */
  output?: string;
  /** Preset name (discord | line | x | web). */
  preset?: string;
  /** Explicit target size in bytes. Overrides the preset's target. */
  targetBytes?: number;
  /** Cap output height. Overrides the preset's maxHeight. */
  maxHeight?: number;
  /** Audio bitrate in kbit/s. Overrides the preset default. */
  audioKbps?: number;
  /** CRF used when there is no target size. Lower = higher quality. */
  crf?: number;
  /** Plan only; do not run ffmpeg. */
  dryRun?: boolean;
  onProgress?: (pass: 1 | 2 | "crf") => void;
}

export interface ShrinkResult {
  input: string;
  output: string;
  inputBytes: number;
  outputBytes?: number;
  probe: ProbeResult;
  /** Present only when a target-size (two-pass) encode was planned. */
  plan?: BitratePlan;
  mode: "two-pass" | "crf";
  dryRun: boolean;
}

function defaultOutput(input: string): string {
  const ext = extname(input);
  const base = basename(input, ext);
  return join(dirname(input), `${base}.vshrink.mp4`);
}

/**
 * Shrink a single video. With a target size, uses two-pass H.264 to hit it;
 * otherwise falls back to quality-based (CRF) encoding.
 */
export async function shrink(opts: ShrinkOptions): Promise<ShrinkResult> {
  await assertFfmpeg();

  const presetName = opts.preset ?? DEFAULT_PRESET;
  if (!isPreset(presetName)) {
    throw new Error(
      `unknown preset "${presetName}" (expected: ${Object.keys(PRESETS).join(", ")})`,
    );
  }
  const preset = PRESETS[presetName];

  const inputBytes = (await stat(opts.input)).size;
  const info = await probe(opts.input);
  const output = opts.output ?? defaultOutput(opts.input);

  const targetBytes = opts.targetBytes ?? preset.targetBytes;
  const maxHeight = opts.maxHeight ?? preset.maxHeight;
  const audioKbps = opts.audioKbps ?? preset.audioKbps;

  if (targetBytes !== undefined) {
    const plan = planBitrate({
      targetBytes,
      durationSec: info.durationSec,
      audioKbps: info.hasAudio ? audioKbps : 0,
    });

    if (!opts.dryRun) {
      await encodeTwoPass({
        input: opts.input,
        output,
        videoKbps: plan.videoKbps,
        audioKbps: plan.audioKbps,
        hasAudio: info.hasAudio,
        maxHeight,
        onProgress: opts.onProgress,
      });
    }

    return {
      input: opts.input,
      output,
      inputBytes,
      outputBytes: opts.dryRun ? undefined : (await stat(output)).size,
      probe: info,
      plan,
      mode: "two-pass",
      dryRun: Boolean(opts.dryRun),
    };
  }

  // Quality-based mode.
  if (!opts.dryRun) {
    await encodeCrf({
      input: opts.input,
      output,
      videoKbps: 0,
      audioKbps,
      hasAudio: info.hasAudio,
      maxHeight,
      crf: opts.crf,
      onProgress: opts.onProgress,
    });
  }

  return {
    input: opts.input,
    output,
    inputBytes,
    outputBytes: opts.dryRun ? undefined : (await stat(output)).size,
    probe: info,
    mode: "crf",
    dryRun: Boolean(opts.dryRun),
  };
}

export { formatSize as humanSize };
