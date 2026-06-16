/**
 * Pure helpers for the `audio` subcommand: map an output format to its ffmpeg
 * encoder. Kept side-effect-free so the mapping is easy to unit test.
 */

export type AudioFormat = "mp3" | "aac" | "m4a" | "wav" | "opus" | "flac";

export interface AudioFormatSpec {
  /** ffmpeg audio codec (-c:a). */
  codec: string;
  /** Whether the codec is lossy (so a bitrate applies). */
  lossy: boolean;
}

const SPECS: Record<AudioFormat, AudioFormatSpec> = {
  mp3: { codec: "libmp3lame", lossy: true },
  aac: { codec: "aac", lossy: true },
  m4a: { codec: "aac", lossy: true },
  wav: { codec: "pcm_s16le", lossy: false },
  opus: { codec: "libopus", lossy: true },
  flac: { codec: "flac", lossy: false },
};

export const AUDIO_FORMATS = Object.keys(SPECS) as AudioFormat[];

export function isAudioFormat(value: string): value is AudioFormat {
  return Object.prototype.hasOwnProperty.call(SPECS, value);
}

export function audioFormatSpec(format: string): AudioFormatSpec {
  if (!isAudioFormat(format)) {
    throw new Error(
      `unknown audio format "${format}" (expected: ${AUDIO_FORMATS.join(", ")})`,
    );
  }
  return SPECS[format];
}
