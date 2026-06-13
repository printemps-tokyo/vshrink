/**
 * Pure helpers for the ffmpeg "subtitles" video filter.
 * Kept side-effect-free so the escaping rules are easy to unit test.
 */

/**
 * Escape a path for use inside the ffmpeg "subtitles" filter, where the value
 * is wrapped in single quotes: subtitles='<escaped path>'.
 *
 * Inside an ffmpeg filtergraph single-quoted token, the ONLY special character
 * is the single quote itself; backslashes and colons are taken literally, so
 * they must NOT be escaped (doing so corrupts the path). A single quote is
 * emitted with the close-reopen idiom ' -> '\'' , the same approach used for
 * the concat list (see escapeConcatPath). This keeps spaces, ':' (timestamps,
 * Windows drive letters) and '\' (Windows separators) intact, while a literal
 * apostrophe in the name survives both unescaping layers.
 */
export function escapeSubtitlesPath(path: string): string {
  return path.replace(/'/g, "'\\''");
}
