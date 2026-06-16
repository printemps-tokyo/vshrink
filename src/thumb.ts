/**
 * Pure helper for the `thumb` subcommand: decide which timestamp to grab a
 * frame from. Kept side-effect-free so it is easy to unit test.
 */

/**
 * Resolve the seek timestamp (a value ffmpeg's `-ss` accepts) for a thumbnail.
 * When `at` is given it is passed through; otherwise the midpoint of the clip
 * is used (a representative, non-black frame).
 */
export function resolveThumbTime(durationSec: number, at?: string): string {
  if (at !== undefined && at.trim() !== "") {
    return at.trim();
  }
  const mid = durationSec > 0 ? durationSec / 2 : 0;
  return mid.toFixed(2);
}
