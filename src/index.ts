/**
 * vshrink — public API.
 * Shrink a video toward a target file size using ffmpeg.
 */
import { stat } from "node:fs/promises";
import { planBitrate, formatSize, type BitratePlan } from "./bitrate.js";
import { defaultOutput } from "./options.js";
import {
  assertFfmpeg,
  probe,
  encodeTwoPass,
  encodeCrf,
  type ProbeResult,
} from "./ffmpeg.js";
import { PRESETS, DEFAULT_PRESET, isPreset } from "./presets.js";
import { parseTimestampSec } from "./timestamp.js";
import { buildTwoPassArgs, buildCrfArgs, formatCommand, type EncodeArgsInput } from "./command.js";

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
export { parseTimestampSec } from "./timestamp.js";
export {
  buildTimecodeFilter,
  isTimecodePosition,
  TIMECODE_POSITIONS,
  type TimecodePosition,
  type TimecodeOptions,
} from "./timecode.js";
export { buildConcatList, escapeConcatPath } from "./concat.js";
export {
  buildTwoPassArgs,
  buildCrfArgs,
  formatCommand,
  quoteArg,
  twoPassLogPrefix,
  nullDevice,
  type EncodeArgsInput,
} from "./command.js";
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
  /** Trim: start timestamp (ffmpeg -ss form, e.g. "00:00:05" or "5"). */
  start?: string;
  /** Trim: output duration in seconds. */
  durationSec?: number;
  /** Plan only; do not run ffmpeg. */
  dryRun?: boolean;
  /** Print the exact ffmpeg command(s) without encoding. */
  printCmd?: boolean;
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
  /** The ffmpeg command line(s), present only when printCmd was requested. */
  commands?: string[];
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
  const output = opts.output ?? defaultOutput(opts.input, "vshrink");

  const targetBytes = opts.targetBytes ?? preset.targetBytes;
  const maxHeight = opts.maxHeight ?? preset.maxHeight;
  const audioKbps = opts.audioKbps ?? preset.audioKbps;

  // --dry-run and --print-cmd both skip encoding (and the output stat).
  const noRun = Boolean(opts.dryRun || opts.printCmd);

  // Effective (post-trim) duration drives the target-size bitrate budget.
  const startSec = opts.start !== undefined ? parseTimestampSec(opts.start) : 0;
  const effectiveDurationSec =
    opts.durationSec !== undefined
      ? Math.min(opts.durationSec, Math.max(0, info.durationSec - startSec))
      : Math.max(0, info.durationSec - startSec);
  if ((opts.start !== undefined || opts.durationSec !== undefined) && effectiveDurationSec <= 0) {
    throw new Error("trim leaves no video (check --start / --duration)");
  }

  if (targetBytes !== undefined) {
    const plan = planBitrate({
      targetBytes,
      durationSec: effectiveDurationSec,
      audioKbps: info.hasAudio ? audioKbps : 0,
    });

    const encodeArgs: EncodeArgsInput = {
      input: opts.input,
      output,
      videoKbps: plan.videoKbps,
      audioKbps: plan.audioKbps,
      hasAudio: info.hasAudio,
      maxHeight,
      start: opts.start,
      durationSec: opts.durationSec,
    };

    if (!noRun) {
      await encodeTwoPass({ ...encodeArgs, onProgress: opts.onProgress });
    }

    return {
      input: opts.input,
      output,
      inputBytes,
      outputBytes: noRun ? undefined : (await stat(output)).size,
      probe: info,
      plan,
      mode: "two-pass",
      dryRun: Boolean(opts.dryRun),
      commands: opts.printCmd
        ? buildTwoPassArgs(encodeArgs).map((args) => formatCommand("ffmpeg", args))
        : undefined,
    };
  }

  // Quality-based mode.
  const crfArgs: EncodeArgsInput = {
    input: opts.input,
    output,
    videoKbps: 0,
    audioKbps,
    hasAudio: info.hasAudio,
    maxHeight,
    crf: opts.crf,
    start: opts.start,
    durationSec: opts.durationSec,
  };

  if (!noRun) {
    await encodeCrf({ ...crfArgs, onProgress: opts.onProgress });
  }

  return {
    input: opts.input,
    output,
    inputBytes,
    outputBytes: noRun ? undefined : (await stat(output)).size,
    probe: info,
    mode: "crf",
    dryRun: Boolean(opts.dryRun),
    commands: opts.printCmd ? [formatCommand("ffmpeg", buildCrfArgs(crfArgs))] : undefined,
  };
}

export { formatSize as humanSize };
