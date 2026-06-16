import { describe, expect, it } from "vitest";
import { resolveThumbTime } from "../src/thumb.js";

describe("resolveThumbTime", () => {
  it("passes an explicit timestamp through", () => {
    expect(resolveThumbTime(100, "00:00:05")).toBe("00:00:05");
    expect(resolveThumbTime(100, "5")).toBe("5");
    expect(resolveThumbTime(100, "  10  ")).toBe("10");
  });

  it("uses the clip midpoint when no timestamp is given", () => {
    expect(resolveThumbTime(100)).toBe("50.00");
    expect(resolveThumbTime(7)).toBe("3.50");
  });

  it("falls back to 0 for an unknown duration", () => {
    expect(resolveThumbTime(0)).toBe("0.00");
    expect(resolveThumbTime(100, "")).toBe("50.00");
  });
});
