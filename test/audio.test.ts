import { describe, expect, it } from "vitest";
import { audioFormatSpec, isAudioFormat, AUDIO_FORMATS } from "../src/audio.js";

describe("audioFormatSpec", () => {
  it("maps formats to ffmpeg codecs", () => {
    expect(audioFormatSpec("mp3")).toEqual({ codec: "libmp3lame", lossy: true });
    expect(audioFormatSpec("aac")).toEqual({ codec: "aac", lossy: true });
    expect(audioFormatSpec("m4a")).toEqual({ codec: "aac", lossy: true });
    expect(audioFormatSpec("opus")).toEqual({ codec: "libopus", lossy: true });
    expect(audioFormatSpec("wav")).toEqual({ codec: "pcm_s16le", lossy: false });
    expect(audioFormatSpec("flac")).toEqual({ codec: "flac", lossy: false });
  });

  it("rejects unknown formats", () => {
    expect(() => audioFormatSpec("ogg")).toThrow();
    expect(isAudioFormat("mp3")).toBe(true);
    expect(isAudioFormat("ogg")).toBe(false);
  });

  it("exposes the supported format list", () => {
    expect(AUDIO_FORMATS).toContain("mp3");
    expect(AUDIO_FORMATS).toContain("flac");
  });
});
