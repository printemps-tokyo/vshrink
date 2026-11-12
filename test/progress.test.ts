import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { formatBar, ProgressLine } from "../src/progress.js";
import { progressSeconds, runFfmpeg } from "../src/ffmpeg.js";

describe("progressSeconds", () => {
  it("reads out_time_us and out_time_ms (both microseconds)", () => {
    expect(progressSeconds("out_time_us=1500000")).toBe(1.5);
    expect(progressSeconds("out_time_ms=2000000\r")).toBe(2);
  });

  it("ignores other keys and the N/A ffmpeg prints before the first frame", () => {
    expect(progressSeconds("out_time=00:00:01.500000")).toBeUndefined();
    expect(progressSeconds("out_time_us=N/A")).toBeUndefined();
    expect(progressSeconds("progress=continue")).toBeUndefined();
  });
});

describe("formatBar", () => {
  it("fills in proportion and clamps", () => {
    expect(formatBar(0, 4)).toBe("[....]   0%");
    expect(formatBar(0.5, 4)).toBe("[##..]  50%");
    expect(formatBar(1, 4)).toBe("[####] 100%");
    expect(formatBar(2, 4)).toBe("[####] 100%");
    expect(formatBar(Number.NaN, 4)).toBe("[....]   0%");
  });
});

describe("ProgressLine", () => {
  const sink = () => {
    const out: string[] = [];
    return { out, write: (t: string) => out.push(t) };
  };

  it("prints one plain line per stage when not on a terminal", () => {
    const s = sink();
    const p = new ProgressLine(false, s);
    p.update("pass 1/2");
    p.update("pass 1/2", 0.5);
    p.update("pass 2/2");
    p.done();
    expect(s.out).toEqual(["pass 1/2...\n", "pass 2/2...\n"]);
  });

  it("rewrites one line on a terminal, throttled, and ends it", () => {
    const s = sink();
    let t = 0;
    const p = new ProgressLine(true, s, () => t);
    p.update("enc");
    t = 300;
    p.update("enc", 0.25);
    t = 350;
    p.update("enc", 0.3); // within 200 ms: skipped
    t = 600;
    p.update("enc", 1);
    p.done();
    expect(s.out[0]).toBe("\renc...");
    expect(s.out[1]).toMatch(/^\renc \[#{6}\.{18}\] {2}25%$/);
    expect(s.out).toHaveLength(4);
    expect(s.out[2]).toMatch(/100%$/);
    expect(s.out[3]).toBe("\n");
  });
});

describe.skipIf(process.platform === "win32")("runFfmpeg", () => {
  let dir: string;
  let savedPath: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vshrink-fake-"));
    savedPath = process.env.PATH;
    process.env.PATH = `${dir}${delimiter}${savedPath ?? ""}`;
  });

  afterEach(async () => {
    process.env.PATH = savedPath;
    await rm(dir, { recursive: true, force: true });
  });

  async function fakeFfmpeg(script: string): Promise<void> {
    const file = join(dir, "ffmpeg");
    await writeFile(file, `#!/bin/sh\n${script}\n`);
    await chmod(file, 0o755);
  }

  it("passes -progress pipe:1 first and reports the output time", async () => {
    await fakeFfmpeg(
      '[ "$1" = "-progress" ] && [ "$2" = "pipe:1" ] || exit 9\n' +
        'printf "frame=1\\nout_time_us=N/A\\nout_time_us=500000\\nprogress=continue\\nout_time_us=1000000\\nprogress=end\\n"',
    );
    const seen: number[] = [];
    await runFfmpeg(["-i", "x"], (sec) => seen.push(sec));
    expect(seen).toEqual([0.5, 1]);
  });

  it("rejects with the end of stderr on failure", async () => {
    await fakeFfmpeg('echo "Unknown encoder libsvtav1" >&2\nexit 1');
    await expect(runFfmpeg(["-i", "x"])).rejects.toThrow(/exit code 1\)\nUnknown encoder libsvtav1/);
  });
});
