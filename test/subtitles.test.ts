import { describe, expect, it } from "vitest";
import { escapeSubtitlesPath } from "../src/subtitles.js";

describe("escapeSubtitlesPath", () => {
  it("leaves plain paths unchanged", () => {
    expect(escapeSubtitlesPath("/subs/movie.srt")).toBe("/subs/movie.srt");
  });

  it("leaves spaces unchanged (they are safe inside the quoted value)", () => {
    expect(escapeSubtitlesPath("/subs/my movie.srt")).toBe("/subs/my movie.srt");
  });

  it("leaves a colon unchanged (literal inside single quotes)", () => {
    expect(escapeSubtitlesPath("/subs/12:30 clip.srt")).toBe("/subs/12:30 clip.srt");
  });

  it("escapes a single quote with the close-reopen idiom", () => {
    expect(escapeSubtitlesPath("/subs/it's a clip.srt")).toBe(
      "/subs/it'\\''s a clip.srt",
    );
  });

  it("leaves backslashes and colons unchanged (Windows-like path)", () => {
    expect(escapeSubtitlesPath("C:\\clips\\movie.srt")).toBe("C:\\clips\\movie.srt");
  });
});
