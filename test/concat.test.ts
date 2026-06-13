import { describe, expect, it } from "vitest";
import { buildConcatList, escapeConcatPath } from "../src/concat.js";

describe("escapeConcatPath", () => {
  it("leaves plain paths unchanged", () => {
    expect(escapeConcatPath("/videos/part1.mkv")).toBe("/videos/part1.mkv");
  });

  it("escapes single quotes", () => {
    expect(escapeConcatPath("/videos/it's a clip.mkv")).toBe(
      "/videos/it'\\''s a clip.mkv",
    );
  });
});

describe("buildConcatList", () => {
  it("wraps each path in a quoted file directive", () => {
    expect(buildConcatList(["/a/1.mkv", "/a/2.mkv"])).toBe(
      "file '/a/1.mkv'\nfile '/a/2.mkv'\n",
    );
  });

  it("handles paths with spaces and quotes", () => {
    expect(buildConcatList(["/a/b c.mkv", "/a/d's.mkv"])).toBe(
      "file '/a/b c.mkv'\nfile '/a/d'\\''s.mkv'\n",
    );
  });

  it("rejects an empty list", () => {
    expect(() => buildConcatList([])).toThrow();
  });
});
