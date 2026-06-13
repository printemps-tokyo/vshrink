# vshrink

> ffmpeg helpers to shrink, convert, and concatenate videos. Zero-dependency CLI.

[![CI](https://github.com/printemps-tokyo/vshrink/actions/workflows/ci.yml/badge.svg)](https://github.com/printemps-tokyo/vshrink/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

`vshrink` wraps ffmpeg so you do not have to remember bitrate math or long
command lines. It can hit a target file size, transcode to mp4 while picking
specific tracks, and join multiple files into one.

## Why

Sharing a clip on chat or email often means "make it under 8MB". Ripping a DVD
means transcoding `.mkv` to `.mp4`, choosing the right audio track, and dropping
subtitles. Joining split files means writing a concat list by hand. `vshrink`
turns each of these into a single command.

## Requirements

- Node.js >= 20
- `ffmpeg` and `ffprobe` on your `PATH` (macOS: `brew install ffmpeg`)

## Install

```bash
npm install -g @printemps-tokyo/vshrink
# or run once:
npx @printemps-tokyo/vshrink clip.mov
```

## Commands

```bash
vshrink [shrink] [options] <input...>   # shrink toward a target file size
vshrink convert [options] <input...>    # transcode to mp4, pick tracks, drop subs
vshrink concat -o out.mp4 <input...>    # merge files into one mp4
vshrink probe <input>                   # list streams (tracks) in a file
```

Run `vshrink <command> --help` for command-specific options.

### shrink (default)

```bash
vshrink clip.mov                 # 1080p quality-based compression
vshrink -p discord clip.mov      # aim for 8MB
vshrink -t 6MB -o out.mp4 clip.mov
vshrink --dry-run -t 6MB clip.mov  # show the plan, no encoding
vshrink *.mov                    # batch
```

| Option | Description |
| --- | --- |
| `-p, --preset <name>` | `discord`, `line`, `x`, `web` (default: `web`) |
| `-t, --target <size>` | Target size: `8MB`, `500k`, `1.5GiB` (overrides preset) |
| `-o, --output <path>` | Output path (single input only) |
| `--max-height <n>` | Cap output height in pixels |
| `--audio <kbps>` | Audio bitrate in kbit/s |
| `--crf <n>` | Quality for size-less presets (lower = better, default 23) |
| `--dry-run` | Print the plan without encoding |

Presets are conservative convenience defaults, not official platform limits.

| Preset | Behavior |
| --- | --- |
| `discord` | Target 8MB |
| `line` | Target 5MB, capped at 720p |
| `x` | Quality-based, capped at 720p |
| `web` | Quality-based, capped at 1080p (default) |

### convert

Transcode to H.264/AAC mp4 and select specific tracks. Subtitles are dropped.
Use `vshrink probe` first to find the track numbers.

```bash
vshrink convert movie.mkv                      # first video + first audio
vshrink convert --audio-track 1 movie.mkv      # pick the 2nd audio track
vshrink convert --video-track 0 --audio-track 1 -o out.mp4 movie.mkv
```

| Option | Description |
| --- | --- |
| `--video-track <n>` | Video track index (default 0) |
| `--audio-track <n>` | Audio track index (default 0) |
| `--crf <n>` | Quality (lower = better, default 23) |
| `--audio <kbps>` | Audio bitrate in kbit/s (default 192) |
| `--max-height <n>` | Cap output height in pixels |
| `-o, --output <path>` | Output path (single input only) |

### concat

Join multiple files into one mp4. Inputs are re-encoded, so files with
different codecs or resolutions still concatenate cleanly.

```bash
vshrink concat -o full.mp4 part1.mkv part2.mkv part3.mkv
```

| Option | Description |
| --- | --- |
| `-o, --output <path>` | Output path (required) |
| `--crf <n>` | Quality (lower = better, default 23) |
| `--audio <kbps>` | Audio bitrate in kbit/s (default 192) |
| `--max-height <n>` | Cap output height in pixels |

### probe

```bash
vshrink probe movie.mkv
#  #0 video track 0  h264 1920x1080
#  #1 audio track 0  aac 2ch [jpn]
#  #2 audio track 1  aac 2ch [eng]
```

## How shrink works

With a target size, `vshrink` computes the video bitrate from the budget:

```
total_kbps = target_bytes * 8 / 1000 / duration_seconds
video_kbps = total_kbps * 0.97 - audio_kbps
```

It then runs a two-pass `libx264` encode at that bitrate (`+faststart` for web
playback). Without a target, it uses CRF quality-based encoding instead.

## Programmatic API

```ts
import { shrink, convert, concat, listStreams, parseSize } from "@printemps-tokyo/vshrink";

await shrink({ input: "clip.mov", targetBytes: parseSize("8MB") });
await convert({ input: "movie.mkv", output: "out.mp4", audioTrack: 1 });
await concat({ inputs: ["p1.mkv", "p2.mkv"], output: "full.mp4" });
const streams = await listStreams("movie.mkv");
```

## License

[MIT](./LICENSE) (c) printemps.tokyo
