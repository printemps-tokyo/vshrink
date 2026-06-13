import { describe, expect, it } from "vitest";
import { planBitrate, parseSize, formatSize } from "../src/bitrate.js";

describe("parseSize", () => {
  it("parses decimal units (1000-based)", () => {
    expect(parseSize("8MB")).toBe(8_000_000);
    expect(parseSize("500k")).toBe(500_000);
    expect(parseSize("2GB")).toBe(2_000_000_000);
  });

  it("parses binary units (1024-based)", () => {
    expect(parseSize("1MiB")).toBe(1_048_576);
    expect(parseSize("1.5GiB")).toBe(Math.floor(1.5 * 1024 ** 3));
  });

  it("treats a bare number as bytes", () => {
    expect(parseSize("1048576")).toBe(1_048_576);
  });

  it("is case-insensitive and tolerates spaces", () => {
    expect(parseSize("  8 mb ")).toBe(8_000_000);
  });

  it("rejects invalid input", () => {
    expect(() => parseSize("abc")).toThrow();
    expect(() => parseSize("8ZB")).toThrow();
    expect(() => parseSize("0MB")).toThrow();
  });
});

describe("planBitrate", () => {
  it("computes video bitrate from target size and duration", () => {
    // 8MB over 60s = 8,000,000*8/1000/60 = 1066.6 kbps total budget.
    const plan = planBitrate({
      targetBytes: 8_000_000,
      durationSec: 60,
      audioKbps: 128,
      safety: 1, // disable overhead margin for exact math
    });
    expect(plan.totalKbps).toBe(1066);
    // video = floor(1066.66 - 128) = 938
    expect(plan.videoKbps).toBe(938);
    expect(plan.audioKbps).toBe(128);
    expect(plan.belowFloor).toBe(false);
  });

  it("applies the safety margin", () => {
    const exact = planBitrate({ targetBytes: 8_000_000, durationSec: 60, safety: 1 });
    const safe = planBitrate({ targetBytes: 8_000_000, durationSec: 60, safety: 0.97 });
    expect(safe.videoKbps).toBeLessThan(exact.videoKbps);
  });

  it("flags bitrates below the floor", () => {
    const plan = planBitrate({
      targetBytes: 1_000_000,
      durationSec: 600,
      audioKbps: 0,
      floorKbps: 100,
    });
    expect(plan.belowFloor).toBe(true);
  });

  it("never returns a non-positive video bitrate", () => {
    const plan = planBitrate({ targetBytes: 100_000, durationSec: 600, audioKbps: 128 });
    expect(plan.videoKbps).toBeGreaterThanOrEqual(1);
  });

  it("rejects invalid input", () => {
    expect(() => planBitrate({ targetBytes: 0, durationSec: 60 })).toThrow();
    expect(() => planBitrate({ targetBytes: 1000, durationSec: 0 })).toThrow();
  });
});

describe("formatSize", () => {
  it("formats bytes into human units", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(7_600_000)).toBe("7.6 MB");
    expect(formatSize(2_000_000_000)).toBe("2.0 GB");
  });
});
