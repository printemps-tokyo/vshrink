/**
 * Pure helpers for building an ffmpeg concat-demuxer list file.
 * Kept side-effect-free so the escaping rules are easy to unit test.
 */

/**
 * Escape a path for use inside a single-quoted ffmpeg concat entry.
 * A single quote is closed, escaped, and reopened: ' -> '\''
 */
export function escapeConcatPath(path: string): string {
  return path.replace(/'/g, "'\\''");
}

/** Build the body of an ffmpeg concat list file from absolute paths. */
export function buildConcatList(absPaths: string[]): string {
  if (absPaths.length === 0) {
    throw new Error("concat requires at least one input");
  }
  return absPaths.map((p) => `file '${escapeConcatPath(p)}'`).join("\n") + "\n";
}
