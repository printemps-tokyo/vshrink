#!/usr/bin/env node
import { parseArgs } from "node:util";
import { basename, dirname, extname, join } from "node:path";
import {
  shrink,
  convert,
  concat,
  gif,
  extractSubs,
  listStreams,
  formatSize,
  parseSize,
  PRESETS,
  DEFAULT_PRESET,
} from "./index.js";

const HELP = `vshrink - ffmpeg helpers for shrinking and converting videos

Usage:
  vshrink [shrink] [options] <input...>   Shrink toward a target file size
  vshrink convert [options] <input...>    Transcode to mp4, pick tracks, burn subs
  vshrink concat -o out.mp4 <input...>     Merge files into one mp4
  vshrink gif [options] <input>            High-quality GIF (palette method)
  vshrink extract-subs -o out.srt <input>  Extract a subtitle track to a file
  vshrink probe <input>                    List streams (tracks) in a file

Run "vshrink <command> --help" for command-specific options.

Commands:
  shrink        (default) two-pass H.264 to hit a target size, CRF fallback
  convert       mkv/mov -> mp4 with --video-track / --audio-track selection
  concat        concatenate multiple inputs (re-encode) into one mp4
  gif           render a high-quality GIF via the two-pass palette method
  extract-subs  pull a subtitle stream out to a .srt/.ass/.vtt file
  probe         print the stream table to help choose track numbers

Examples:
  vshrink clip.mov                       # shrink (1080p quality-based)
  vshrink -p discord clip.mov            # shrink toward 8MB
  vshrink convert --audio-track 1 movie.mkv
  vshrink convert --burn-subs subs.srt movie.mkv
  vshrink concat -o full.mp4 part1.mkv part2.mkv
  vshrink gif --fps 15 --width 600 clip.mov
  vshrink extract-subs -o out.srt movie.mkv
  vshrink probe movie.mkv
`;

const SHRINK_HELP = `vshrink shrink - shrink a video toward a target file size

Usage:
  vshrink shrink [options] <input...>

Options:
  -p, --preset <name>   ${Object.keys(PRESETS).join(", ")} (default: ${DEFAULT_PRESET})
  -t, --target <size>   Target size, e.g. 8MB, 500k, 1.5GiB (overrides preset)
  -o, --output <path>   Output path (single input only)
      --max-height <n>  Cap output height in pixels
      --audio <kbps>    Audio bitrate in kbit/s
      --crf <n>         Quality for size-less presets (lower = better, default 23)
      --dry-run         Print the plan without encoding
`;

const CONVERT_HELP = `vshrink convert - transcode to H.264/AAC mp4 with track selection

Usage:
  vshrink convert [options] <input...>

Options:
  --video-track <n>    Video track index (default 0)
  --audio-track <n>    Audio track index (default 0)
  --crf <n>            Quality (lower = better, default 23)
  --audio <kbps>       Audio bitrate in kbit/s (default 192)
  --max-height <n>     Cap output height in pixels
  --burn-subs <file>   Burn an external subtitle file (.srt/.ass) into the video
  --burn-track <n>     Burn an embedded subtitle track (by subtitle index)
  -o, --output <path>  Output path (single input only)

By default subtitles are dropped. --burn-subs and --burn-track hardsub the
subtitles into the picture and are mutually exclusive; both require an ffmpeg
build with libass. Use "vshrink probe <input>" to find track numbers.
`;

const GIF_HELP = `vshrink gif - render a high-quality GIF via the palette method

Usage:
  vshrink gif [options] <input>

Options:
  --fps <n>            Frame rate (default 12)
  --width <px>         Output width; height keeps aspect (default 480)
  --start <ts>         Start timestamp, e.g. 00:00:05 or 5 (maps to -ss)
  --duration <sec>     Clip length in seconds (maps to -t)
  -o, --output <path>  Output path (default "<name>.gif" next to input)

Uses a two-pass palettegen/paletteuse encode for sharp, low-banding GIFs.
`;

const EXTRACT_SUBS_HELP = `vshrink extract-subs - extract a subtitle stream to a file

Usage:
  vshrink extract-subs [--track <n>] -o <output> <input>

Options:
  --track <n>          Subtitle track index (default 0)
  -o, --output <path>  Output path (required)

The output extension determines the format (.srt / .ass / .vtt). Use
"vshrink probe <input>" to find subtitle track numbers.
`;

const CONCAT_HELP = `vshrink concat - concatenate multiple files into one mp4

Usage:
  vshrink concat -o <output> [options] <input...>

Options:
  -o, --output <path>  Output path (required)
  --crf <n>            Quality (lower = better, default 23)
  --audio <kbps>       Audio bitrate in kbit/s (default 192)
  --max-height <n>     Cap output height in pixels

Inputs are re-encoded so files with different codecs/resolutions still join.
`;

function defaultOutput(input: string, suffix: string): string {
  const ext = extname(input);
  const base = basename(input, ext);
  return join(dirname(input), `${base}.${suffix}.mp4`);
}

/** Parse a CLI value that must be a positive number, or throw a clear error. */
function parsePositive(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--${name} must be a positive number (got "${value}")`);
  }
  return n;
}

/** Parse a CLI value that must be a non-negative integer (e.g. a track index). */
function parseTrack(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--${name} must be a non-negative integer (got "${value}")`);
  }
  return n;
}

const COMMANDS = new Set([
  "shrink",
  "convert",
  "concat",
  "gif",
  "extract-subs",
  "probe",
]);

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  if (argv[0] === "-h" || argv[0] === "--help" || argv.length === 0) {
    process.stdout.write(argv.length === 0 ? "error: no input\n\n" + HELP : HELP);
    return argv.length === 0 ? 1 : 0;
  }
  if (argv[0] === "-v" || argv[0] === "--version") {
    process.stdout.write((await readVersion()) + "\n");
    return 0;
  }

  const head = argv[0] as string;
  const command = COMMANDS.has(head) ? head : "shrink";
  const rest = COMMANDS.has(head) ? argv.slice(1) : argv;

  switch (command) {
    case "convert":
      return runConvert(rest);
    case "concat":
      return runConcat(rest);
    case "gif":
      return runGif(rest);
    case "extract-subs":
      return runExtractSubs(rest);
    case "probe":
      return runProbe(rest);
    default:
      return runShrink(rest);
  }
}

async function runShrink(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      preset: { type: "string", short: "p" },
      target: { type: "string", short: "t" },
      output: { type: "string", short: "o" },
      "max-height": { type: "string" },
      audio: { type: "string" },
      crf: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(SHRINK_HELP);
    return 0;
  }
  if (positionals.length === 0) {
    process.stderr.write("error: no input files\n\n" + SHRINK_HELP);
    return 1;
  }
  if (values.output && positionals.length > 1) {
    process.stderr.write("error: --output cannot be used with multiple inputs\n");
    return 1;
  }

  const targetBytes = values.target ? parseSize(values.target) : undefined;
  const maxHeight = values["max-height"] ? Number(values["max-height"]) : undefined;
  const audioKbps = values.audio ? Number(values.audio) : undefined;
  const crf = values.crf ? Number(values.crf) : undefined;

  let failed = 0;
  for (const input of positionals) {
    try {
      const res = await shrink({
        input,
        output: values.output,
        preset: values.preset,
        targetBytes,
        maxHeight,
        audioKbps,
        crf,
        dryRun: values["dry-run"],
        onProgress: (pass) =>
          process.stderr.write(
            `  ${input}: ${pass === "crf" ? "encoding" : `pass ${pass}/2`}...\n`,
          ),
      });

      if (res.dryRun) {
        const plan = res.plan
          ? `video ${res.plan.videoKbps}k + audio ${res.plan.audioKbps}k`
          : `crf ${crf ?? 23}`;
        process.stdout.write(
          `[dry-run] ${input} (${formatSize(res.inputBytes)}, ` +
            `${res.probe.durationSec.toFixed(1)}s) -> ${res.output}\n` +
            `          mode=${res.mode} ${plan}` +
            (res.plan?.belowFloor ? " [warning: very low bitrate]" : "") +
            "\n",
        );
      } else {
        const pct =
          res.outputBytes !== undefined
            ? ` (${((res.outputBytes / res.inputBytes) * 100).toFixed(0)}% of original)`
            : "";
        process.stdout.write(
          `${input} ${formatSize(res.inputBytes)} -> ` +
            `${res.output} ${formatSize(res.outputBytes ?? 0)}${pct}\n`,
        );
      }
    } catch (err) {
      failed++;
      process.stderr.write(`error: ${input}: ${(err as Error).message}\n`);
    }
  }
  return failed > 0 ? 1 : 0;
}

async function runConvert(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "video-track": { type: "string" },
      "audio-track": { type: "string" },
      crf: { type: "string" },
      audio: { type: "string" },
      "max-height": { type: "string" },
      "burn-subs": { type: "string" },
      "burn-track": { type: "string" },
      output: { type: "string", short: "o" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(CONVERT_HELP);
    return 0;
  }
  if (positionals.length === 0) {
    process.stderr.write("error: no input files\n\n" + CONVERT_HELP);
    return 1;
  }
  if (values.output && positionals.length > 1) {
    process.stderr.write("error: --output cannot be used with multiple inputs\n");
    return 1;
  }
  if (values["burn-subs"] && values["burn-track"]) {
    process.stderr.write(
      "error: --burn-subs and --burn-track are mutually exclusive\n",
    );
    return 1;
  }

  let failed = 0;
  for (const input of positionals) {
    const output = values.output ?? defaultOutput(input, "mp4");
    try {
      process.stderr.write(`  ${input}: converting...\n`);
      await convert({
        input,
        output,
        videoTrack: values["video-track"] ? parseTrack("video-track", values["video-track"]) : undefined,
        audioTrack: values["audio-track"] ? parseTrack("audio-track", values["audio-track"]) : undefined,
        crf: values.crf ? parsePositive("crf", values.crf) : undefined,
        audioKbps: values.audio ? parsePositive("audio", values.audio) : undefined,
        maxHeight: values["max-height"] ? parsePositive("max-height", values["max-height"]) : undefined,
        burnSubsPath: values["burn-subs"],
        burnTrack: values["burn-track"] ? parseTrack("burn-track", values["burn-track"]) : undefined,
      });
      const { stat } = await import("node:fs/promises");
      process.stdout.write(`${input} -> ${output} ${formatSize((await stat(output)).size)}\n`);
    } catch (err) {
      failed++;
      process.stderr.write(`error: ${input}: ${(err as Error).message}\n`);
    }
  }
  return failed > 0 ? 1 : 0;
}

async function runConcat(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      crf: { type: "string" },
      audio: { type: "string" },
      "max-height": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(CONCAT_HELP);
    return 0;
  }
  if (!values.output) {
    process.stderr.write("error: concat requires -o/--output\n\n" + CONCAT_HELP);
    return 1;
  }
  if (positionals.length < 2) {
    process.stderr.write("error: concat needs at least two inputs\n");
    return 1;
  }

  try {
    process.stderr.write(`  concatenating ${positionals.length} files...\n`);
    await concat({
      inputs: positionals,
      output: values.output,
      crf: values.crf ? Number(values.crf) : undefined,
      audioKbps: values.audio ? Number(values.audio) : undefined,
      maxHeight: values["max-height"] ? Number(values["max-height"]) : undefined,
    });
    const { stat } = await import("node:fs/promises");
    process.stdout.write(
      `${positionals.length} files -> ${values.output} ${formatSize((await stat(values.output)).size)}\n`,
    );
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
}

function gifOutput(input: string): string {
  const ext = extname(input);
  const base = basename(input, ext);
  return join(dirname(input), `${base}.gif`);
}

async function runGif(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      fps: { type: "string" },
      width: { type: "string" },
      start: { type: "string" },
      duration: { type: "string" },
      output: { type: "string", short: "o" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(GIF_HELP);
    return 0;
  }
  if (positionals.length === 0) {
    process.stderr.write("error: gif needs an input file\n\n" + GIF_HELP);
    return 1;
  }
  if (positionals.length > 1) {
    process.stderr.write("error: gif takes a single input\n");
    return 1;
  }

  const input = positionals[0] as string;
  const output = values.output ?? gifOutput(input);
  try {
    process.stderr.write(`  ${input}: rendering gif...\n`);
    await gif({
      input,
      output,
      fps: values.fps ? parsePositive("fps", values.fps) : undefined,
      width: values.width ? parsePositive("width", values.width) : undefined,
      start: values.start,
      durationSec: values.duration ? parsePositive("duration", values.duration) : undefined,
    });
    const { stat } = await import("node:fs/promises");
    process.stdout.write(`${input} -> ${output} ${formatSize((await stat(output)).size)}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${input}: ${(err as Error).message}\n`);
    return 1;
  }
}

async function runExtractSubs(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      track: { type: "string" },
      output: { type: "string", short: "o" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(EXTRACT_SUBS_HELP);
    return 0;
  }
  if (positionals.length === 0) {
    process.stderr.write("error: extract-subs needs an input file\n\n" + EXTRACT_SUBS_HELP);
    return 1;
  }
  if (positionals.length > 1) {
    process.stderr.write("error: extract-subs takes a single input\n");
    return 1;
  }
  if (!values.output) {
    process.stderr.write("error: extract-subs requires -o/--output\n\n" + EXTRACT_SUBS_HELP);
    return 1;
  }

  const input = positionals[0] as string;
  try {
    process.stderr.write(`  ${input}: extracting subtitles...\n`);
    await extractSubs({
      input,
      output: values.output,
      track: values.track ? parseTrack("track", values.track) : undefined,
    });
    const { stat } = await import("node:fs/promises");
    process.stdout.write(
      `${input} -> ${values.output} ${formatSize((await stat(values.output)).size)}\n`,
    );
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${input}: ${(err as Error).message}\n`);
    return 1;
  }
}

async function runProbe(argv: string[]): Promise<number> {
  const input = argv.find((a) => !a.startsWith("-"));
  if (!input) {
    process.stderr.write("error: probe needs an input file\n");
    return 1;
  }
  try {
    const streams = await listStreams(input);
    const byType: Record<string, number> = {};
    process.stdout.write(`${input}\n`);
    for (const s of streams) {
      const typeIndex = byType[s.type] ?? 0;
      byType[s.type] = typeIndex + 1;
      const dims = s.width && s.height ? ` ${s.width}x${s.height}` : "";
      const ch = s.channels ? ` ${s.channels}ch` : "";
      const lang = s.lang ? ` [${s.lang}]` : "";
      const track =
        s.type === "video" || s.type === "audio" || s.type === "subtitle"
          ? ` track ${typeIndex}`
          : "";
      process.stdout.write(
        `  #${s.index} ${s.type}${track}  ${s.codec ?? "?"}${dims}${ch}${lang}\n`,
      );
    }
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${input}: ${(err as Error).message}\n`);
    return 1;
  }
}

async function readVersion(): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { join: pjoin, dirname: pdirname } = await import("node:path");
  const here = pdirname(fileURLToPath(import.meta.url));
  try {
    const raw = await readFile(pjoin(here, "..", "package.json"), "utf8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    process.exit(1);
  });
