import { describe, expect, it } from "vitest";
import { defaultOutput, parsePositive, parseTrack } from "../src/options.js";

describe("defaultOutput", () => {
  it("replaces the input extension with '<suffix>.mp4'", () => {
    expect(defaultOutput("movie.mkv", "convert")).toBe("movie.convert.mp4");
    expect(defaultOutput("clip.mov", "vshrink")).toBe("clip.vshrink.mp4");
  });

  it("never yields a doubled extension like movie.mp4.mp4", () => {
    expect(defaultOutput("movie.mp4", "convert")).toBe("movie.convert.mp4");
  });

  it("keeps the input's directory", () => {
    expect(defaultOutput("path/to/movie.mkv", "convert")).toBe(
      "path/to/movie.convert.mp4",
    );
  });

  it("handles inputs without an extension", () => {
    expect(defaultOutput("movie", "convert")).toBe("movie.convert.mp4");
  });
});

describe("parsePositive", () => {
  it("accepts positive integers and decimals", () => {
    expect(parsePositive("crf", "23")).toBe(23);
    expect(parsePositive("duration", "1.5")).toBe(1.5);
  });

  it("rejects non-numeric input instead of passing NaN to ffmpeg", () => {
    expect(() => parsePositive("max-height", "abc")).toThrow(
      '--max-height must be a positive number (got "abc")',
    );
    expect(() => parsePositive("audio", "")).toThrow(/--audio/);
  });

  it("rejects zero, negatives and infinities", () => {
    expect(() => parsePositive("crf", "0")).toThrow(/positive/);
    expect(() => parsePositive("crf", "-5")).toThrow(/positive/);
    expect(() => parsePositive("crf", "Infinity")).toThrow(/positive/);
  });
});

describe("parseTrack", () => {
  it("accepts zero and positive integers", () => {
    expect(parseTrack("audio-track", "0")).toBe(0);
    expect(parseTrack("audio-track", "2")).toBe(2);
  });

  it("rejects negatives, decimals and non-numeric input", () => {
    expect(() => parseTrack("audio-track", "-1")).toThrow(/non-negative integer/);
    expect(() => parseTrack("audio-track", "1.5")).toThrow(/non-negative integer/);
    expect(() => parseTrack("audio-track", "x")).toThrow(
      '--audio-track must be a non-negative integer (got "x")',
    );
  });
});
