/**
 * Small CLI helpers: default output naming and strict numeric option parsing.
 * Kept out of cli.ts so they can be unit-tested without running the CLI.
 */
import { basename, dirname, extname, join } from "node:path";

/**
 * Default output path next to the input: "<name>.<suffix>.mp4". The suffix
 * names the operation (e.g. "vshrink", "convert") so `movie.mkv` becomes
 * `movie.convert.mp4` rather than `movie.mp4.mp4`.
 */
export function defaultOutput(input: string, suffix: string): string {
  const ext = extname(input);
  const base = basename(input, ext);
  return join(dirname(input), `${base}.${suffix}.mp4`);
}

/** Parse a CLI value that must be a positive number, or throw a clear error. */
export function parsePositive(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--${name} must be a positive number (got "${value}")`);
  }
  return n;
}

/** Parse a CLI value that must be a non-negative integer (e.g. a track index). */
export function parseTrack(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--${name} must be a non-negative integer (got "${value}")`);
  }
  return n;
}
