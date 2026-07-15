/**
 * Pure builders for the ffmpeg argument vectors used by the shrink encode
 * modes, plus a shell-quoting formatter. These let `--print-cmd` show the exact
 * command vshrink would run, and keep the executor and the preview in sync from
 * a single source of truth (no risk of the printed command drifting from the
 * real one).
 */

function scaleFilter(maxHeight?: number): string[] {
  if (!maxHeight) return [];
  // Downscale only if taller than maxHeight; keep even dimensions for libx264.
  return ["-vf", `scale=-2:'min(${maxHeight},ih)'`];
}

function seekArgs(start?: string): string[] {
  return start !== undefined ? ["-ss", start] : [];
}

function durationArgs(durationSec?: number): string[] {
  return durationSec !== undefined ? ["-t", String(durationSec)] : [];
}

function audioArgs(hasAudio: boolean, audioKbps: number): string[] {
  return hasAudio ? ["-c:a", "aac", "-b:a", `${audioKbps}k`] : ["-an"];
}

/** Inputs needed to build a shrink encode command (a subset of EncodeOptions). */
export interface EncodeArgsInput {
  input: string;
  output: string;
  videoKbps: number;
  audioKbps: number;
  hasAudio: boolean;
  maxHeight?: number;
  crf?: number;
  start?: string;
  durationSec?: number;
}

/** The -passlogfile prefix used by the two-pass encode for this output. */
export function twoPassLogPrefix(output: string): string {
  return `${output}.vshrink-pass`;
}

/** The platform's null sink for the discard pass. */
export function nullDevice(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "NUL" : "/dev/null";
}

/** The two ffmpeg argument vectors (pass 1 then pass 2) for a target-size encode. */
export function buildTwoPassArgs(
  o: EncodeArgsInput,
  platform: NodeJS.Platform = process.platform,
): [string[], string[]] {
  // -nostats stops ffmpeg from streaming per-frame progress lines to stderr,
  // which would overflow execFile's buffered stderr on long encodes.
  const common = [
    "-y",
    "-nostats",
    ...seekArgs(o.start),
    "-i",
    o.input,
    ...durationArgs(o.durationSec),
    "-c:v",
    "libx264",
    "-b:v",
    `${o.videoKbps}k`,
    "-preset",
    "medium",
    ...scaleFilter(o.maxHeight),
    "-passlogfile",
    twoPassLogPrefix(o.output),
  ];
  const pass1 = [...common, "-pass", "1", "-an", "-f", "null", nullDevice(platform)];
  const pass2 = [
    ...common,
    "-pass",
    "2",
    ...audioArgs(o.hasAudio, o.audioKbps),
    "-movflags",
    "+faststart",
    o.output,
  ];
  return [pass1, pass2];
}

/** The single ffmpeg argument vector for a quality-based (CRF) encode. */
export function buildCrfArgs(o: EncodeArgsInput): string[] {
  return [
    "-y",
    "-nostats",
    ...seekArgs(o.start),
    "-i",
    o.input,
    ...durationArgs(o.durationSec),
    "-c:v",
    "libx264",
    "-crf",
    String(o.crf ?? 23),
    "-preset",
    "medium",
    ...scaleFilter(o.maxHeight),
    ...audioArgs(o.hasAudio, o.audioKbps),
    "-movflags",
    "+faststart",
    o.output,
  ];
}

// Characters that never need quoting in a POSIX shell.
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** Quote a single argument for a copy-pasteable POSIX shell command line. */
export function quoteArg(arg: string): string {
  if (arg.length > 0 && SHELL_SAFE.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/** Render a command and its arguments as one shell-quoted line. */
export function formatCommand(bin: string, args: string[]): string {
  return [bin, ...args.map(quoteArg)].join(" ");
}
