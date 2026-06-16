import { describe, expect, it } from "vitest";
import { parseTimestampSec } from "../src/timestamp.js";

describe("parseTimestampSec", () => {
  it("parses plain seconds", () => {
    expect(parseTimestampSec("5")).toBe(5);
    expect(parseTimestampSec("5.5")).toBe(5.5);
  });

  it("parses MM:SS and HH:MM:SS", () => {
    expect(parseTimestampSec("01:30")).toBe(90);
    expect(parseTimestampSec("00:01:30")).toBe(90);
    expect(parseTimestampSec("01:00:00")).toBe(3600);
    expect(parseTimestampSec("00:00:05.250")).toBe(5.25);
  });

  it("rejects invalid input", () => {
    expect(() => parseTimestampSec("a:b")).toThrow();
    expect(() => parseTimestampSec("1:2:3:4")).toThrow();
    expect(() => parseTimestampSec("-5")).toThrow();
  });
});
