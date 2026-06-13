/**
 * Pure helpers for building the ffmpeg filter strings used by the two-pass
 * palette GIF method. Kept side-effect-free so the filter strings are easy to
 * unit test.
 */

export interface PaletteFilterOptions {
  /** Output frame rate. */
  fps: number;
  /** Target width in pixels; height is derived to keep aspect ratio. */
  width: number;
}

/**
 * Build the pass-1 (palettegen) video filter.
 * Generates an optimal 256-color palette from the downscaled frames.
 */
export function buildPaletteGenFilter(opts: PaletteFilterOptions): string {
  const { fps, width } = opts;
  return `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen`;
}

/**
 * Build the pass-2 (paletteuse) lavfi filtergraph.
 * Applies the previously generated palette (second input) to the frames.
 */
export function buildPaletteUseFilter(opts: PaletteFilterOptions): string {
  const { fps, width } = opts;
  return `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse`;
}
