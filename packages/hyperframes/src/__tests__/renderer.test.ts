/**
 * Renderer tests exercise the variable injection + subprocess wiring
 * using a fake CLI. The real hyperframes binary is exercised by the
 * integration smoke test (skipped by default — too slow for unit runs).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { HyperframesRenderer } from '../renderer';
import { compositionPath } from '../index';

function makeFakeCli(): string {
  // Tiny shell script that treats `-o OUT` and writes a non-empty file.
  // Mimics what hyperframes render does for our purposes: consumes args,
  // produces an output file.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-fake-cli-'));
  const scriptPath = path.join(tmpDir, 'fake-hyperframes.sh');
  fs.writeFileSync(
    scriptPath,
    `#!/bin/sh
OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) OUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ -z "$OUT" ]; then echo "no -o"; exit 1; fi
mkdir -p "$(dirname "$OUT")"
# Write 256 bytes of zeros so the file has a measurable size.
head -c 256 /dev/zero > "$OUT"
`
  );
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}

describe('HyperframesRenderer (with fake CLI)', () => {
  let renderer: HyperframesRenderer;

  beforeEach(() => {
    renderer = new HyperframesRenderer({ cliBin: makeFakeCli() });
  });

  it('advertises runtime = hyperframes', () => {
    expect(renderer.runtime).toBe('hyperframes');
  });

  it('renders a composition with injected variables', async () => {
    const outputPath = path.join(os.tmpdir(), `hf-test-${Date.now()}.mp4`);
    const result = await renderer.render(
      {
        composition: compositionPath('hello'),
        variables: {
          badge: 'NEW',
          headline: 'Hello Hyperframes',
          subheadline: 'First render from ReelStack',
          durationSeconds: 5,
        },
      },
      { outputPath }
    );

    expect(result.outputPath).toBe(outputPath);
    expect(result.sizeBytes).toBe(256);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    fs.unlinkSync(outputPath);
  });

  it('fails loudly when composition path is not a directory', async () => {
    await expect(
      renderer.render(
        { composition: '/nonexistent-path', variables: {} },
        { outputPath: '/tmp/wont-be-written.mp4' }
      )
    ).rejects.toThrow(/not a directory/);
  });

  it('fails loudly when a required template variable is missing', async () => {
    const outputPath = path.join(os.tmpdir(), `hf-missing-${Date.now()}.mp4`);
    await expect(
      renderer.render(
        {
          composition: compositionPath('hello'),
          // missing `badge`
          variables: { headline: 'x', subheadline: 'y', durationSeconds: 5 },
        },
        { outputPath }
      )
    ).rejects.toThrow(/variable "badge" is not defined/);
  });
});

/**
 * Regression: a CLI subprocess that writes the MP4 and then never exits
 * (real bug seen with n8n-explainer 73s renders) used to hang the worker.
 * The size-stable watchdog must SIGTERM the child and resolve.
 */
function makeHangingCli(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-hanging-cli-'));
  const scriptPath = path.join(tmpDir, 'hanging-hyperframes.sh');
  fs.writeFileSync(
    scriptPath,
    `#!/bin/sh
OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) OUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done
mkdir -p "$(dirname "$OUT")"
head -c 1024 /dev/zero > "$OUT"
# Simulate the bug: write the file, then sleep "forever". The watchdog
# must detect file-size stability and kill us.
sleep 600
`
  );
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}

describe('HyperframesRenderer watchdog (hang regression)', () => {
  it('resolves via size-stable watchdog when subprocess never exits', async () => {
    const renderer = new HyperframesRenderer({
      cliBin: makeHangingCli(),
      // Tight timings keep the test under a second.
      watchdog: { startDelayMs: 50, pollMs: 50, stableTicks: 2 },
    });
    const outputPath = path.join(os.tmpdir(), `hf-hang-${Date.now()}.mp4`);
    const start = performance.now();
    const result = await renderer.render(
      {
        composition: compositionPath('hello'),
        variables: {
          badge: 'NEW',
          headline: 'x',
          subheadline: 'y',
          durationSeconds: 5,
        },
      },
      { outputPath }
    );
    const elapsed = performance.now() - start;

    expect(result.outputPath).toBe(outputPath);
    expect(result.sizeBytes).toBe(1024);
    // Should resolve well before the 600s subprocess sleep.
    expect(elapsed).toBeLessThan(2_000);
    expect(fs.existsSync(outputPath)).toBe(true);

    fs.unlinkSync(outputPath);
  }, 5_000);
});
