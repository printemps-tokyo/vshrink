/**
 * Pure timestamp parsing for trim options. Accepts plain seconds ("5",
 * "5.5"), "MM:SS", or "HH:MM:SS" (each with an optional ".mmm" fraction).
 */
export function parseTimestampSec(input: string): number {
  const s = input.trim();
  const parts = s.split(":");
  if (parts.length > 3) {
    throw new Error(`invalid timestamp: "${input}"`);
  }
  let total = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`invalid timestamp: "${input}"`);
    }
    total = total * 60 + n;
  }
  return total;
}
