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

- Node.js >= 22
- `ffmpeg` and `ffprobe` on your `PATH` (macOS: `brew install ffmpeg`)

## Install

Not published to npm yet — install from source:

```bash
git clone https://github.com/printemps-tokyo/vshrink
cd vshrink
npm install && npm run build
npm link   # optional: puts the `vshrink` command on your PATH
```

Then run `vshrink …` (after `npm link`), or `node dist/cli.js …` from the clone.

## Commands

```bash
vshrink [shrink] [options] <input...>   # shrink toward a target file size
vshrink convert [options] <input...>    # transcode to mp4, pick tracks, burn subs
vshrink concat -o out.mp4 <input...>    # merge files into one mp4
vshrink gif [options] <input>           # high-quality GIF (palette method)
vshrink extract-subs -o out.srt <input> # extract a subtitle track to a file
vshrink audio [options] <input>         # extract audio (mp3/aac/wav/opus/flac)
vshrink thumb [options] <input>         # grab one frame as an image
vshrink probe [--json] <input>          # list streams (tracks) in a file
```

Run `vshrink <command> --help` for command-specific options.

### shrink (default)

```bash
vshrink clip.mov                 # 1080p quality-based compression
vshrink -p discord clip.mov      # aim for 8MB
vshrink -t 6MB -o out.mp4 clip.mov
vshrink --dry-run -t 6MB clip.mov  # show the plan, no encoding
vshrink --print-cmd -t 6MB clip.mov  # print the exact ffmpeg command(s)
vshrink *.mov                    # batch
vshrink -c av1 -p discord clip.mov  # AV1 (or hevc) instead of H.264
```

| Option | Description |
| --- | --- |
| `-p, --preset <name>` | `discord`, `line`, `x`, `web` (default: `web`) |
| `-t, --target <size>` | Target size: `8MB`, `500k`, `1.5GiB` (overrides preset) |
| `-o, --output <path>` | Output path (single input only) |
| `--max-height <n>` | Cap output height in pixels |
| `--audio <kbps>` | Audio bitrate in kbit/s |
| `-c, --codec <name>` | Video codec: `h264` (default), `hevc`, `av1` |
| `--crf <n>` | Quality for size-less presets (lower = better; default 23 for h264, 28 for hevc, 35 for av1; 0 = lossless with h264) |
| `--start <ts>` | Trim: start at this timestamp (`00:00:05` or `5`) |
| `--duration <sec>` | Trim: keep this many seconds |
| `--dry-run` | Print the plan without encoding |
| `--print-cmd` | Print the exact ffmpeg command(s) without encoding |
| `--no-progress` | No live progress bar on a terminal |

`--print-cmd` writes the shell-quoted ffmpeg command line(s) it would run (two
lines for a two-pass target-size encode) and exits without touching any file, so
you can inspect, tweak, or learn from the command, or paste it into a script.

Presets are conservative convenience defaults, not official platform limits.

| Preset | Behavior |
| --- | --- |
| `discord` | Target 8MB |
| `line` | Target 5MB, capped at 720p |
| `x` | Quality-based, capped at 720p |
| `web` | Quality-based, capped at 1080p (default) |

### convert

Transcode to H.264/AAC mp4 and select specific tracks. By default subtitles are
dropped, but you can burn them into the picture (hardsub) instead. Use
`vshrink probe` first to find the track numbers.

```bash
vshrink convert movie.mkv                      # -> movie.convert.mp4
vshrink convert --audio-track 1 movie.mkv      # pick the 2nd audio track
vshrink convert --video-track 0 --audio-track 1 -o out.mp4 movie.mkv
vshrink convert --burn-subs subs.srt movie.mkv # hardsub an external file
vshrink convert --burn-track 0 movie.mkv       # hardsub an embedded track
vshrink convert --timecode --tc-position br movie.mp4   # burn a running timecode
```

| Option | Description |
| --- | --- |
| `--video-track <n>` | Video track index (default 0) |
| `--audio-track <n>` | Audio track index (default 0) |
| `--crf <n>` | Quality (lower = better, 0 = lossless, default 23) |
| `--audio <kbps>` | Audio bitrate in kbit/s (default 192) |
| `--max-height <n>` | Cap output height in pixels |
| `--burn-subs <file>` | Burn an external subtitle file (.srt/.ass) into the video |
| `--burn-track <n>` | Burn an embedded subtitle track (by subtitle index) |
| `--timecode` | Burn a running timecode overlay (needs libfreetype) |
| `--tc-position <pos>` | Timecode corner: `tl`/`tr`/`bl`/`br` (default `br`) |
| `--tc-size <px>` | Timecode font size (default 24) |
| `--font <path>` | Font file for the timecode overlay |
| `-o, --output <path>` | Output path (default `<name>.convert.mp4`; single input only) |

`--burn-subs` and `--burn-track` are mutually exclusive. Burn-in uses ffmpeg's
`subtitles` filter and requires an ffmpeg build with **libass**. `--timecode`
overlays the running playback time via the `drawtext` filter and requires an
ffmpeg build with **libfreetype**; without it the command reports a clear error.

### concat

Join multiple files into one mp4. Inputs are re-encoded, so files with
different codecs or resolutions still concatenate cleanly.

```bash
vshrink concat -o full.mp4 part1.mkv part2.mkv part3.mkv
```

| Option | Description |
| --- | --- |
| `-o, --output <path>` | Output path (required) |
| `--crf <n>` | Quality (lower = better, 0 = lossless, default 23) |
| `--audio <kbps>` | Audio bitrate in kbit/s (default 192) |
| `--max-height <n>` | Cap output height in pixels |

### gif

Render a high-quality GIF using the two-pass palette method (`palettegen` +
`paletteuse`) for sharp colors and minimal banding. Trim with `--start` /
`--duration` for fast input seeking.

```bash
vshrink gif clip.mov                          # 12fps, 480px wide -> clip.gif
vshrink gif --fps 15 --width 600 clip.mov
vshrink gif --start 00:00:05 --duration 3 -o out.gif clip.mov
```

| Option | Description |
| --- | --- |
| `--fps <n>` | Frame rate (default 12) |
| `--width <px>` | Output width; height keeps aspect ratio (default 480) |
| `--start <ts>` | Start timestamp, e.g. `00:00:05` or `5` (maps to `-ss`) |
| `--duration <sec>` | Clip length in seconds (maps to `-t`) |
| `-o, --output <path>` | Output path (default `<name>.gif` next to input) |

### extract-subs

Extract a subtitle stream to a standalone file. The output extension picks the
format (`.srt`, `.ass`, `.vtt`). Use `vshrink probe` to find subtitle tracks.

```bash
vshrink extract-subs -o out.srt movie.mkv     # first subtitle track
vshrink extract-subs --track 1 -o eng.srt movie.mkv
```

| Option | Description |
| --- | --- |
| `--track <n>` | Subtitle track index (default 0) |
| `-o, --output <path>` | Output path (required) |

### audio

Extract an audio track to a standalone file. The format picks the codec
(`mp3`/`aac`/`m4a` lossy, `wav`/`flac` lossless, `opus`).

```bash
vshrink audio talk.mp4                       # -> talk.mp3 (192k)
vshrink audio --format wav -o out.wav talk.mp4
vshrink audio --format flac --audio-track 1 movie.mkv
```

| Option | Description |
| --- | --- |
| `--format <fmt>` | `mp3`, `aac`, `m4a`, `wav`, `opus`, `flac` (default `mp3`) |
| `--audio-track <n>` | Audio track index (default 0) |
| `--bitrate <kbps>` | Bitrate for lossy formats (default 192; ignored for wav/flac) |
| `-o, --output <path>` | Output path (default `<name>.<format>` next to input) |

### thumb

Grab one representative frame as an image. The output extension picks the
format (`.jpg`/`.png`/`.webp`); by default the frame is taken from the clip
midpoint.

```bash
vshrink thumb clip.mov                        # -> clip.jpg (midpoint)
vshrink thumb --at 00:00:05 -o cover.png clip.mov
vshrink thumb --at 5 --width 320 clip.mov
```

| Option | Description |
| --- | --- |
| `--at <ts>` | Timestamp to grab, e.g. `00:00:05` or `5` (default: midpoint) |
| `--width <px>` | Scale the output width; height keeps aspect ratio |
| `-o, --output <path>` | Output path (default `<name>.jpg`; ext sets the format) |

### probe

```bash
vshrink probe movie.mkv
#  #0 video track 0  h264 1920x1080
#  #1 audio track 0  aac 2ch [jpn]
#  #2 audio track 1  aac 2ch [eng]

vshrink probe --json movie.mkv   # same data as JSON, for scripts / jq
# [
#   { "index": 0, "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
#   { "index": 1, "type": "audio", "codec": "aac", "lang": "jpn", "channels": 2 },
#   ...
# ]
```

| Option | Description |
| --- | --- |
| `--json` | Print the stream list as JSON instead of a table |

## How shrink works

With a target size, `vshrink` computes the video bitrate from the budget:

```
total_kbps = target_bytes * 8 / 1000 / duration_seconds
video_kbps = total_kbps * 0.97 - audio_kbps
```

It then runs a two-pass encode at that bitrate (`+faststart` for web
playback). Without a target, it uses CRF quality-based encoding instead.

| Codec | Encoder | Default CRF | Notes |
| --- | --- | --- | --- |
| `h264` | `libx264` (`-preset medium`) | 23 | Plays everywhere |
| `hevc` | `libx265` (`-preset medium`) | 28 | Tagged `hvc1` so QuickTime and Apple devices play it |
| `av1` | `libsvtav1` (its default preset) | 35 | Smallest at the same quality, slowest to encode; CRF 1-63 |

How a size target is reached differs by codec, so that it works with the
ffmpeg most systems ship (8.0 and earlier do not pass `-pass` on to libx265 or
libsvtav1):

- `h264`: ffmpeg's two passes (`-pass`, `-passlogfile`).
- `hevc`: x265's own two passes (`-x265-params pass=1`, then `pass=2`). x265
  keeps its stats in the working directory, so vshrink runs the passes in a
  scratch directory; a command from `--print-cmd` leaves `x265_2pass.log`
  where you run it.
- `av1`: one pass at the planned bitrate. SVT-AV1 can overshoot, so when the
  result is over the target it is encoded again at a corrected bitrate, at
  most twice more.

The default CRFs are each encoder's own default. HEVC and AV1 need an ffmpeg
built with libx265 and libsvtav1 (`ffmpeg -encoders` lists them). With
several inputs, each one is encoded in turn and a failure does not stop the
rest. On a terminal, a progress bar shows how far each pass has got (from
ffmpeg's `-progress` output); elsewhere, one line per pass is printed.

## Programmatic API

```ts
import {
  shrink,
  convert,
  concat,
  gif,
  extractSubs,
  extractAudio,
  extractThumbnail,
  listStreams,
  parseSize,
} from "@printemps-tokyo/vshrink";

await shrink({ input: "clip.mov", targetBytes: parseSize("8MB") });
await convert({ input: "movie.mkv", output: "out.mp4", audioTrack: 1 });
await convert({ input: "movie.mkv", output: "subbed.mp4", burnSubsPath: "subs.srt" });
await concat({ inputs: ["p1.mkv", "p2.mkv"], output: "full.mp4" });
await gif({ input: "clip.mov", output: "clip.gif", fps: 15, width: 600 });
await extractSubs({ input: "movie.mkv", output: "out.srt", track: 0 });
await extractAudio({ input: "talk.mp4", output: "talk.mp3", format: "mp3" });
await extractThumbnail({ input: "clip.mov", output: "clip.jpg", at: "5" });
const streams = await listStreams("movie.mkv");
```

## License

[MIT](./LICENSE) (c) printemps.tokyo
