import { describe, expect, it } from "vitest";
import { buildPaletteGenFilter, buildPaletteUseFilter } from "../src/gif.js";

describe("buildPaletteGenFilter", () => {
  it("builds the palettegen filter from fps and width", () => {
    expect(buildPaletteGenFilter({ fps: 12, width: 480 })).toBe(
      "fps=12,scale=480:-1:flags=lanczos,palettegen",
    );
  });

  it("reflects custom fps and width", () => {
    expect(buildPaletteGenFilter({ fps: 10, width: 320 })).toBe(
      "fps=10,scale=320:-1:flags=lanczos,palettegen",
    );
  });
});

describe("buildPaletteUseFilter", () => {
  it("builds the paletteuse filtergraph from fps and width", () => {
    expect(buildPaletteUseFilter({ fps: 12, width: 480 })).toBe(
      "fps=12,scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse",
    );
  });

  it("reflects custom fps and width", () => {
    expect(buildPaletteUseFilter({ fps: 10, width: 320 })).toBe(
      "fps=10,scale=320:-1:flags=lanczos[x];[x][1:v]paletteuse",
    );
  });
});
