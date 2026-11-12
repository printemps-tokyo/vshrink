/**
 * The progress line the CLI shows while ffmpeg runs: one line rewritten in
 * place on a terminal, and a plain line per pass elsewhere (logs, CI), where
 * carriage returns would only add noise.
 */

/** A text bar and percentage for `fraction` (0..1), e.g. "[#####.....]  50%". */
export function formatBar(fraction: number, width = 24): string {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const filled = Math.round(f * width);
  return `[${"#".repeat(filled)}${".".repeat(width - filled)}] ${String(Math.floor(f * 100)).padStart(3)}%`;
}

export interface Sink {
  write(text: string): unknown;
}

export class ProgressLine {
  private label: string | undefined;
  private shown = "";
  private lastDraw = 0;

  constructor(
    private readonly live: boolean,
    private readonly out: Sink = process.stderr,
    private readonly now: () => number = Date.now,
  ) {}

  /** A stage starts (`fraction` undefined) or advances. */
  update(label: string, fraction?: number): void {
    const newStage = label !== this.label;
    this.label = label;
    if (!this.live) {
      if (newStage) this.out.write(`${label}...\n`);
      return;
    }
    // Redraw at most a few times a second, but always for a new stage.
    const t = this.now();
    if (!newStage && fraction !== undefined && fraction < 1 && t - this.lastDraw < 200) return;
    this.lastDraw = t;
    const text = fraction === undefined ? `${label}...` : `${label} ${formatBar(fraction)}`;
    if (text === this.shown) return;
    // Pad over a longer previous line instead of relying on terminal codes.
    const pad = " ".repeat(Math.max(0, this.shown.length - text.length));
    this.out.write(`\r${text}${pad}`);
    this.shown = text;
  }

  /** End the live line so the next output starts on a fresh one. */
  done(): void {
    if (this.live && this.shown !== "") this.out.write("\n");
    this.shown = "";
    this.label = undefined;
  }
}
