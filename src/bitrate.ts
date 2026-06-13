/**
 * Pure bitrate math for target-size encoding.
 * Kept dependency-free and side-effect-free so it is easy to unit test.
 */

export interface BitratePlan {
  /** Target video bitrate in kbit/s (passed to ffmpeg as -b:v). */
  videoKbps: number;
  /** Audio bitrate in kbit/s. */
  audioKbps: number;
  /** Total bitrate budget in kbit/s. */
  totalKbps: number;
  /** True if the computed video bitrate fell below the safety floor. */
  belowFloor: boolean;
}

export interface PlanInput {
  /** Target output size in bytes. */
  targetBytes: number;
  /** Media duration in seconds. */
  durationSec: number;
  /** Audio bitrate to reserve, in kbit/s. */
  audioKbps?: number;
  /**
   * Fraction of the budget kept for container/muxing overhead.
   * 0.97 means we aim for 97% of the target to avoid overshooting.
   */
  safety?: number;
  /** Minimum acceptable video bitrate before we flag the result. */
  floorKbps?: number;
}

/**
 * Convert a target file size + duration into an encoder bitrate plan.
 *
 *   total_bits = targetBytes * 8
 *   total_kbps = total_bits / 1000 / duration
 *   video_kbps = total_kbps * safety - audio_kbps
 */
export function planBitrate({
  targetBytes,
  durationSec,
  audioKbps = 128,
  safety = 0.97,
  floorKbps = 100,
}: PlanInput): BitratePlan {
  if (!(targetBytes > 0)) {
    throw new Error(`targetBytes must be > 0 (got ${targetBytes})`);
  }
  if (!(durationSec > 0)) {
    throw new Error(`durationSec must be > 0 (got ${durationSec})`);
  }

  const totalKbps = (targetBytes * 8) / 1000 / durationSec;
  const videoKbps = Math.floor(totalKbps * safety - audioKbps);

  return {
    videoKbps: Math.max(videoKbps, 1),
    audioKbps,
    totalKbps: Math.floor(totalKbps),
    belowFloor: videoKbps < floorKbps,
  };
}

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  k: 1000,
  kb: 1000,
  ki: 1024,
  kib: 1024,
  m: 1000 * 1000,
  mb: 1000 * 1000,
  mi: 1024 * 1024,
  mib: 1024 * 1024,
  g: 1000 * 1000 * 1000,
  gb: 1000 * 1000 * 1000,
  gi: 1024 * 1024 * 1024,
  gib: 1024 * 1024 * 1024,
};

/**
 * Parse a human size string ("8MB", "500k", "1.5GiB", "1048576") to bytes.
 * Decimal units (MB) use 1000, binary units (MiB) use 1024.
 */
export function parseSize(input: string): number {
  const m = /^\s*([\d.]+)\s*([a-zA-Z]*)\s*$/.exec(input);
  if (!m) {
    throw new Error(`invalid size: "${input}"`);
  }
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`invalid size value: "${input}"`);
  }
  const unit = (m[2] || "b").toLowerCase();
  const mult = SIZE_UNITS[unit];
  if (mult === undefined) {
    throw new Error(`unknown size unit: "${m[2]}"`);
  }
  return Math.floor(value * mult);
}

/** Format a byte count as a short human string (e.g. "7.6 MB"). */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1000;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}
