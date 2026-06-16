/**
 * Pure helpers for the running-timecode overlay (ffmpeg "drawtext" filter).
 * Kept side-effect-free so the filter string is easy to unit test. The actual
 * burn-in requires an ffmpeg build with libfreetype (the drawtext filter).
 */
import { escapeSubtitlesPath } from "./subtitles.js";

export type TimecodePosition = "tl" | "tr" | "bl" | "br";

export const TIMECODE_POSITIONS: TimecodePosition[] = ["tl", "tr", "bl", "br"];

export function isTimecodePosition(value: string): value is TimecodePosition {
  return (TIMECODE_POSITIONS as string[]).includes(value);
}

/** x/y drawtext expressions for a corner, with a `pad`-pixel margin. */
function corner(position: TimecodePosition, pad: number): { x: string; y: string } {
  const left = `${pad}`;
  const right = `w-tw-${pad}`;
  const top = `${pad}`;
  const bottom = `h-th-${pad}`;
  switch (position) {
    case "tl":
      return { x: left, y: top };
    case "tr":
      return { x: right, y: top };
    case "bl":
      return { x: left, y: bottom };
    case "br":
      return { x: right, y: bottom };
  }
}

export interface TimecodeOptions {
  position?: TimecodePosition;
  /** Font size in pixels (default 24). */
  fontSize?: number;
  /** Path to a .ttf/.otf font file (drawtext fontfile). */
  fontPath?: string;
}

/**
 * Build the ffmpeg "drawtext" filter that overlays the running playback time
 * (HH:MM:SS) in a semi-transparent box. The font path (if any) is escaped the
 * same way as the subtitles filter.
 */
export function buildTimecodeFilter(opts: TimecodeOptions = {}): string {
  const position = opts.position ?? "br";
  const fontSize = opts.fontSize ?? 24;
  const { x, y } = corner(position, 10);
  const parts = [
    // %{pts:hms} renders the running time; the colon must be escaped.
    "text='%{pts\\:hms}'",
    `x=${x}`,
    `y=${y}`,
    `fontsize=${fontSize}`,
    "fontcolor=white",
    "box=1",
    "boxcolor=black@0.5",
    "boxborderw=6",
  ];
  if (opts.fontPath) {
    parts.unshift(`fontfile='${escapeSubtitlesPath(opts.fontPath)}'`);
  }
  return `drawtext=${parts.join(":")}`;
}
