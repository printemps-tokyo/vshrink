/**
 * Presets are convenience defaults, NOT official platform limits.
 * Upload limits change over time and differ by plan, so these are
 * conservative heuristics you can always override with --target / --max-height.
 */

export interface Preset {
  /** Target output size in bytes. Omit for quality-based (CRF) encoding. */
  targetBytes?: number;
  /** Cap the output height (width scales to keep aspect ratio). */
  maxHeight?: number;
  /** Audio bitrate in kbit/s. */
  audioKbps: number;
  /** Human description shown in --help. */
  description: string;
}

export type PresetName = "discord" | "line" | "x" | "web";

const MB = 1000 * 1000;

export const PRESETS: Record<PresetName, Preset> = {
  discord: {
    targetBytes: 8 * MB,
    audioKbps: 128,
    description: "Target 8MB (conservative default for chat attachments)",
  },
  line: {
    targetBytes: 5 * MB,
    maxHeight: 720,
    audioKbps: 96,
    description: "Target 5MB, capped at 720p",
  },
  x: {
    maxHeight: 720,
    audioKbps: 128,
    description: "Quality-based, capped at 720p (no size target)",
  },
  web: {
    maxHeight: 1080,
    audioKbps: 128,
    description: "Quality-based, capped at 1080p (no size target)",
  },
};

export const DEFAULT_PRESET: PresetName = "web";

export function isPreset(name: string): name is PresetName {
  return Object.prototype.hasOwnProperty.call(PRESETS, name);
}
