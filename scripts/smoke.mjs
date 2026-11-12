/* global process, console */
// Real-ffmpeg smoke test of the built CLI: every codec, in target-size and
// quality modes, on a short generated clip. Checks the output's codec, that
// a size target is met within 10%, and that no pass logs are left behind.
// Run after `npm run build`: node scripts/smoke.mjs (needs ffmpeg/ffprobe
// with libx264, libx265 and libsvtav1).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve(import.meta.dirname, "..", "dist", "cli.js");
const dir = mkdtempSync(join(tmpdir(), "vshrink-smoke-"));
const src = join(dir, "src.mp4");
const run = (bin, args) => execFileSync(bin, args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let failed = 0;
try {
  run("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=10",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=10",
    "-c:v", "libx264", "-crf", "10", "-c:a", "aac", "-shortest", src,
  ]);
  for (const codec of ["h264", "hevc", "av1"]) {
    for (const mode of ["target", "crf"]) {
      const out = join(dir, `${codec}-${mode}.mp4`);
      const args = [cli, "-c", codec, "-o", out, ...(mode === "target" ? ["-t", "600k"] : []), src];
      const name = `${codec} ${mode}`;
      try {
        run(process.execPath, args);
        const probed = JSON.parse(
          run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", out]),
        ).streams;
        const video = probed.find((s) => s.codec_type === "video");
        const want = { h264: "h264", hevc: "hevc", av1: "av1" }[codec];
        if (video?.codec_name !== want) throw new Error(`codec ${video?.codec_name}, want ${want}`);
        if (codec === "hevc" && video.codec_tag_string !== "hvc1") {
          throw new Error(`tag ${video.codec_tag_string}, want hvc1`);
        }
        if (!probed.some((s) => s.codec_type === "audio")) throw new Error("no audio");
        const bytes = statSync(out).size;
        // Within 10% of a 600 kB target.
        if (mode === "target" && bytes > 600_000 * 1.1) throw new Error(`${bytes} bytes for a 600k target`);
        console.log(`ok   ${name}: ${bytes} bytes`);
      } catch (err) {
        failed++;
        console.error(`FAIL ${name}: ${err.stderr || err.message}`);
      }
    }
  }
  const left = readdirSync(dir).filter((f) => f.includes("vshrink-pass") || f.startsWith("x265_2pass"));
  if (left.length > 0) {
    failed++;
    console.error(`FAIL pass logs left behind: ${left.join(", ")}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
