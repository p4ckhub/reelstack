/**
 * Renderer tests exercise the variable injection + subprocess wiring
 * using a fake CLI. The real hyperframes binary is exercised by the
 * integration smoke test (skipped by default — too slow for unit runs).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
