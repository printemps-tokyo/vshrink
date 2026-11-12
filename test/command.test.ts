import { describe, expect, it } from "vitest";
import {
  quoteArg,
  formatCommand,
  buildTwoPassArgs,
  buildCrfArgs,
  nullDevice,
  passLogFiles,
  isCodec,
  CODECS,
} from "../src/command.js";

describe("quoteArg", () => {
  it("leaves shell-safe tokens unquoted", () => {
    expect(quoteArg("-c:v")).toBe("-c:v");
    expect(quoteArg("libx264")).toBe("libx264");
    expect(quoteArg("clip.mp4")).toBe("clip.mp4");
    expect(quoteArg("scale=-2:480")).toBe("scale=-2:480");
  });

  it("quotes tokens with spaces or shell metacharacters", () => {
    expect(quoteArg("my clip.mov")).toBe("'my clip.mov'");
    expect(quoteArg("scale=-2:'min(480,ih)'")).toBe("'scale=-2:'\\''min(480,ih)'\\'''");
    expect(quoteArg("")).toBe("''");
  });
});

describe("formatCommand", () => {
  it("joins the binary and quoted args into one line", () => {
    expect(formatCommand("ffmpeg", ["-i", "a b.mp4", "-y", "out.mp4"])).toBe(
      "ffmpeg -i 'a b.mp4' -y out.mp4",
    );
  });
});

describe("nullDevice", () => {
  it("is /dev/null off Windows and NUL on Windows", () => {
    expect(nullDevice("linux")).toBe("/dev/null");
    expect(nullDevice("darwin")).toBe("/dev/null");
    expect(nullDevice("win32")).toBe("NUL");
  });
});

const base = {
  input: "in.mov",
  output: "out.mp4",
  videoKbps: 1200,
  audioKbps: 128,
  hasAudio: true,
};

describe("buildTwoPassArgs", () => {
  it("builds two passes that share the common args and target the bitrate", () => {
    const [pass1, pass2] = buildTwoPassArgs(base, "linux");
    expect(pass1).toContain("-b:v");
    expect(pass1[pass1.indexOf("-b:v") + 1]).toBe("1200k");
    // Pass 1 discards video to the null sink with no audio.
    expect(pass1.slice(-6)).toEqual(["-pass", "1", "-an", "-f", "null", "/dev/null"]);
    // Pass 2 writes the output with AAC audio.
    expect(pass2[pass2.indexOf("-pass") + 1]).toBe("2");
    expect(pass2[pass2.length - 1]).toBe("out.mp4");
    expect(pass2).toContain("aac");
    expect(pass2).toContain("128k");
  });

  it("drops audio in pass 2 when the source has none", () => {
    const [, pass2] = buildTwoPassArgs({ ...base, hasAudio: false }, "linux");
    expect(pass2).toContain("-an");
    expect(pass2).not.toContain("aac");
  });

  it("includes scale and trim args when requested", () => {
    const [, pass2] = buildTwoPassArgs(
      { ...base, maxHeight: 720, start: "5", durationSec: 10 },
      "linux",
    );
    expect(pass2).toContain("-vf");
    expect(pass2).toContain("scale=-2:'min(720,ih)'");
    expect(pass2.slice(0, 4)).toEqual(["-y", "-nostats", "-ss", "5"]);
    expect(pass2).toContain("-t");
  });

  it("disables per-frame stats in both passes (stderr stays bounded)", () => {
    const [pass1, pass2] = buildTwoPassArgs(base, "linux");
    expect(pass1).toContain("-nostats");
    expect(pass2).toContain("-nostats");
  });
});

describe("buildCrfArgs", () => {
  it("uses -crf with the given quality and defaults to 23", () => {
    const args = buildCrfArgs({ ...base, videoKbps: 0, crf: 20 });
    expect(args[args.indexOf("-crf") + 1]).toBe("20");
    const def = buildCrfArgs({ ...base, videoKbps: 0 });
    expect(def[def.indexOf("-crf") + 1]).toBe("23");
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("passes crf 0 (lossless) through as -crf 0", () => {
    const args = buildCrfArgs({ ...base, videoKbps: 0, crf: 0 });
    expect(args[args.indexOf("-crf") + 1]).toBe("0");
  });

  it("disables per-frame stats (stderr stays bounded)", () => {
    expect(buildCrfArgs({ ...base, videoKbps: 0 })).toContain("-nostats");
  });
});

describe("codecs", () => {
  it("keeps h264 the default, with libx264 and its passlogfile", () => {
    const [pass1] = buildTwoPassArgs(base, "linux");
    expect(pass1[pass1.indexOf("-c:v") + 1]).toBe("libx264");
    expect(pass1[pass1.indexOf("-passlogfile") + 1]).toBe("out.mp4.vshrink-pass");
    expect(buildTwoPassArgs({ ...base, codec: "h264" }, "linux")).toEqual(buildTwoPassArgs(base, "linux"));
  });

  it("hevc uses libx265, its own stats file and the hvc1 tag", () => {
    const [pass1, pass2] = buildTwoPassArgs({ ...base, codec: "hevc" }, "linux");
    expect(pass1[pass1.indexOf("-c:v") + 1]).toBe("libx265");
    expect(pass1).not.toContain("-passlogfile");
    expect(pass1[pass1.indexOf("-x265-stats") + 1]).toBe("out.mp4.vshrink-pass.x265.log");
    expect(pass2[pass2.indexOf("-x265-stats") + 1]).toBe("out.mp4.vshrink-pass.x265.log");
    expect(pass2[pass2.indexOf("-tag:v") + 1]).toBe("hvc1");
    expect(pass1).not.toContain("-tag:v");
    const crf = buildCrfArgs({ ...base, videoKbps: 0, codec: "hevc" });
    expect(crf[crf.indexOf("-crf") + 1]).toBe("28");
  });

  it("av1 uses libsvtav1 with its own preset and CRF defaults", () => {
    const [pass1, pass2] = buildTwoPassArgs({ ...base, codec: "av1" }, "linux");
    expect(pass1[pass1.indexOf("-c:v") + 1]).toBe("libsvtav1");
    expect(pass1).not.toContain("-preset");
    expect(pass1).toContain("-passlogfile");
    expect(pass2[pass2.indexOf("-pass") + 1]).toBe("2");
    const crf = buildCrfArgs({ ...base, videoKbps: 0, codec: "av1" });
    expect(crf[crf.indexOf("-crf") + 1]).toBe("35");
  });

  it("lists every pass log a codec may leave", () => {
    expect(passLogFiles("p")).toEqual(["p-0.log", "p-0.log.mbtree", "p.x265.log", "p.x265.log.cutree"]);
  });

  it("knows its codecs", () => {
    expect(isCodec("av1")).toBe(true);
    expect(isCodec("vp9")).toBe(false);
    expect(Object.keys(CODECS)).toEqual(["h264", "hevc", "av1"]);
  });
});
