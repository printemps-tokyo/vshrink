#!/usr/bin/env node
import { parseArgs } from "node:util";
import { shrink, formatSize, parseSize, PRESETS, DEFAULT_PRESET } from "./index.js";

const HELP = `vshrink - shrink videos toward a target file size with ffmpeg

Usage:
  vshrink [options] <input...>

Options:
  -p, --preset <name>   Preset: ${Object.keys(PRESETS).join(", ")} (default: ${DEFAULT_PRESET})
  -t, --target <size>   Target size, e.g. 8MB, 500k, 1.5GiB (overrides preset)
  -o, --output <path>   Output path (single input only)
      --max-height <n>  Cap output height in pixels
      --audio <kbps>    Audio bitrate in kbit/s
      --crf <n>         Quality for size-less presets (lower = better, default 23)
      --dry-run         Print the plan without encoding
  -h, --help            Show this help
  -v, --version         Show version

Presets (conservative defaults, not official platform limits):
${Object.entries(PRESETS)
  .map(([k, v]) => `  ${k.padEnd(8)} ${v.description}`)
  .join("\n")}

Examples:
  vshrink clip.mov                  # 1080p quality-based compression
  vshrink -p discord clip.mov       # aim for 8MB
  vshrink -t 6MB -o out.mp4 clip.mov
  vshrink *.mov                     # batch
`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
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
      version: { type: "boolean", short: "v", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    const { version } = await readPkg();
    process.stdout.write(`${version}\n`);
    return 0;
  }
  if (positionals.length === 0) {
    process.stderr.write("error: no input files\n\n" + HELP);
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
        const delta =
          res.outputBytes !== undefined
            ? ` (${((res.outputBytes / res.inputBytes) * 100).toFixed(0)}% of original)`
            : "";
        process.stdout.write(
          `${input} ${formatSize(res.inputBytes)} -> ` +
            `${res.output} ${formatSize(res.outputBytes ?? 0)}${delta}\n`,
        );
      }
    } catch (err) {
      failed++;
      process.stderr.write(`error: ${input}: ${(err as Error).message}\n`);
    }
  }

  return failed > 0 ? 1 : 0;
}

async function readPkg(): Promise<{ version: string }> {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { join, dirname } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const raw = await readFile(join(here, "..", "package.json"), "utf8");
    return JSON.parse(raw) as { version: string };
  } catch {
    return { version: "0.0.0" };
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    process.exit(1);
  });
