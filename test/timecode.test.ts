import { describe, expect, it } from "vitest";
import { buildTimecodeFilter, isTimecodePosition } from "../src/timecode.js";

describe("buildTimecodeFilter", () => {
  it("renders the running time in the bottom-right by default", () => {
    const f = buildTimecodeFilter();
    expect(f).toContain("drawtext=");
    expect(f).toContain("text='%{pts\\:hms}'");
    expect(f).toContain("x=w-tw-10");
    expect(f).toContain("y=h-th-10");
    expect(f).toContain("fontsize=24");
    expect(f).toContain("box=1");
  });

  it("places the timecode in the requested corner", () => {
    expect(buildTimecodeFilter({ position: "tl" })).toContain("x=10:y=10");
    const tr = buildTimecodeFilter({ position: "tr" });
    expect(tr).toContain("x=w-tw-10");
    expect(tr).toContain("y=10");
  });

  it("includes an escaped fontfile and the requested size when given", () => {
    const f = buildTimecodeFilter({ fontPath: "/fonts/it's.ttf", fontSize: 32 });
    expect(f).toContain("fontfile='/fonts/it'\\''s.ttf'");
    expect(f).toContain("fontsize=32");
  });
});

describe("isTimecodePosition", () => {
  it("accepts the four corners", () => {
    for (const p of ["tl", "tr", "bl", "br"]) expect(isTimecodePosition(p)).toBe(true);
    expect(isTimecodePosition("center")).toBe(false);
  });
});
