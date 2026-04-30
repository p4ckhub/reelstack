#!/usr/bin/env bun
/**
 * Visual regression check — Remotion vs Hyperframes outputs.
 *
 * Uses ffmpeg's built-in SSIM filter (no extra deps) to compute a single
 * "all-frames-merged" similarity score (0..1, higher = more similar).
 *
 * Usage:
 *   bun run scripts/visual-regression.ts <reference.mp4> <candidate.mp4> [--threshold 0.92]
 *
 * Exit codes:
 *   0 — score >= threshold (pass)
 *   1 — score < threshold (fail / regression)
 *   2 — invocation / ffmpeg error
 *
 * Caveats:
 *   - Both videos must share resolution + framerate. Mismatch → ffmpeg errors.
 *   - SSIM is structural; small color shifts pass, but large motion/timing
 *     differences fail. Tune threshold per composition.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

interface CliArgs {
  reference: string;
  candidate: string;
  threshold: number;
}

const DEFAULT_THRESHOLD = 0.92;

export interface VisualRegressionResult {
  /** Frame-merged SSIM mean across Y/U/V planes (0..1). */
  score: number;
  /** Per-channel SSIM, as ffmpeg reports it. */
  channels: { y?: number; u?: number; v?: number; all?: number };
  passed: boolean;
}

/** Parse the last `SSIM Y:... U:... V:... All:...` line ffmpeg prints. */
export function parseSsim(stderr: string): VisualRegressionResult['channels'] {
  // Match the summary line: `[Parsed_ssim_0 @ 0x…] SSIM Y:0.99 ... All:0.98 (17.234)`
  const match = stderr.match(/SSIM\s+Y:([\d.]+).*?U:([\d.]+).*?V:([\d.]+).*?All:([\d.]+)/);
  if (!match) return {};
  return {
    y: Number(match[1]),
    u: Number(match[2]),
    v: Number(match[3]),
    all: Number(match[4]),
  };
}

export async function runVisualRegression(
  reference: string,
  candidate: string,
  threshold = DEFAULT_THRESHOLD
): Promise<VisualRegressionResult> {
  if (!existsSync(reference)) throw new Error(`Reference not found: ${reference}`);
  if (!existsSync(candidate)) throw new Error(`Candidate not found: ${candidate}`);

  const stderr = await runFfmpegSsim(reference, candidate);
  const channels = parseSsim(stderr);
  const score = channels.all ?? 0;
  return { score, channels, passed: score >= threshold };
}

function runFfmpegSsim(reference: string, candidate: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-i',
      reference,
      '-i',
      candidate,
      '-lavfi',
      'ssim',
      '-f',
      'null',
      '-',
    ];
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.resume();
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited ${code}. stderr tail: ${stderr.slice(-400)}`));
        return;
      }
      resolve(stderr);
    });
  });
}

function parseArgs(argv: string[]): CliArgs {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const reference = positional[0];
  const candidate = positional[1];
  if (!reference || !candidate) {
    throw new Error(
      'Usage: bun run scripts/visual-regression.ts <reference.mp4> <candidate.mp4> [--threshold 0.92]'
    );
  }
  const thresholdIdx = argv.indexOf('--threshold');
  const threshold =
    thresholdIdx >= 0 && argv[thresholdIdx + 1]
      ? Number(argv[thresholdIdx + 1])
      : DEFAULT_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error(`Invalid --threshold ${argv[thresholdIdx + 1]} (expected 0..1)`);
  }
  return { reference, candidate, threshold };
}

// CLI entry — only run when executed directly, not when imported by tests.
const isMain =
  typeof Bun !== 'undefined'
    ? Bun.main === import.meta.path
    : import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await runVisualRegression(args.reference, args.candidate, args.threshold);
    const verdict = result.passed ? 'PASS' : 'FAIL';
    console.log(
      `[visual-regression] ${verdict} score=${result.score.toFixed(4)} threshold=${args.threshold} channels=${JSON.stringify(result.channels)}`
    );
    process.exit(result.passed ? 0 : 1);
  } catch (err) {
    console.error(`[visual-regression] ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }
}
