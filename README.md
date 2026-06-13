# vshrink

> Shrink videos toward a target file size with ffmpeg. Zero-dependency CLI.

[![CI](https://github.com/printemps-tokyo/vshrink/actions/workflows/ci.yml/badge.svg)](https://github.com/printemps-tokyo/vshrink/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

`vshrink` wraps ffmpeg so you do not have to remember bitrate math or long
command lines. Give it a target size (or a preset) and it computes the right
H.264 bitrate, runs a two-pass encode, and lands close to your target.

## Why

Sharing a clip on chat or email often means "make it under 8MB". Doing that by
hand means probing the duration, computing a bitrate, and typing a two-pass
ffmpeg incantation. `vshrink` does all of that in one command.

## Requirements

- Node.js >= 20
- `ffmpeg` and `ffprobe` on your `PATH` (macOS: `brew install ffmpeg`)

## Install

```bash
npm install -g @printemps-tokyo/vshrink
# or run once:
npx @printemps-tokyo/vshrink clip.mov
```

## Usage

```bash
vshrink clip.mov                 # 1080p quality-based compression
vshrink -p discord clip.mov      # aim for 8MB
vshrink -t 6MB -o out.mp4 clip.mov
vshrink --dry-run -t 6MB clip.mov  # show the plan, no encoding
vshrink *.mov                    # batch
```

### Options

| Option | Description |
| --- | --- |
| `-p, --preset <name>` | `discord`, `line`, `x`, `web` (default: `web`) |
| `-t, --target <size>` | Target size: `8MB`, `500k`, `1.5GiB` (overrides preset) |
| `-o, --output <path>` | Output path (single input only) |
| `--max-height <n>` | Cap output height in pixels |
| `--audio <kbps>` | Audio bitrate in kbit/s |
| `--crf <n>` | Quality for size-less presets (lower = better, default 23) |
| `--dry-run` | Print the plan without encoding |

### Presets

Presets are conservative convenience defaults, not official platform limits
(upload limits change over time and vary by plan). Override anything with
`--target` / `--max-height`.

| Preset | Behavior |
| --- | --- |
| `discord` | Target 8MB |
| `line` | Target 5MB, capped at 720p |
| `x` | Quality-based, capped at 720p |
| `web` | Quality-based, capped at 1080p (default) |

## How it works

With a target size, `vshrink` computes the video bitrate from the budget:

```
total_kbps = target_bytes * 8 / 1000 / duration_seconds
video_kbps = total_kbps * 0.97 - audio_kbps
```

It then runs a two-pass `libx264` encode at that bitrate (`+faststart` for web
playback). Without a target, it uses CRF quality-based encoding instead.

## Programmatic API

```ts
import { shrink, planBitrate, parseSize } from "@printemps-tokyo/vshrink";

const result = await shrink({ input: "clip.mov", targetBytes: parseSize("8MB") });
console.log(result.output, result.outputBytes);
```

## License

[MIT](./LICENSE) (c) printemps.tokyo
