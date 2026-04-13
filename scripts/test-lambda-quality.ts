#!/usr/bin/env bun
/**
 * Quick test: render same composition with different quality settings.
 * Runs from local Mac, bypasses worker entirely.
 */
// Must run from packages/remotion dir for module resolution
const { renderMediaOnLambda, getRenderProgress } = await import('@remotion/lambda/client');
type AwsRegion = string;
import fs from 'fs';

const region = (process.env.AWS_REGION ?? 'eu-central-1') as AwsRegion;
const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME!;
const serveUrl = process.env.REMOTION_LAMBDA_SERVE_URL!;

// Use a public high-res image as test screenshot
const TEST_SCREENSHOT =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/1200px-PNG_transparency_demonstration_1.png';

const testProps = {
  screenshotUrl: TEST_SCREENSHOT,
  sections: [
    {
      text: 'Test section.',
      startTime: 0,
      endTime: 3,
      boardType: 'bird-eye',
      kenBurns: {
        startScale: 1.0,
        endScale: 1.1,
        startPosition: { x: 48, y: 48 },
        endPosition: { x: 52, y: 52 },
      },
    },
  ],
  cues: [{ id: '1', text: 'Test quality render.', startTime: 0, endTime: 3 }],
  voiceoverUrl: '',
  durationSeconds: 3,
  backgroundColor: '#1a1a2e',
};

async function renderTest(label: string, extra: Record<string, unknown> = {}) {
  console.log(`\n=== ${label} ===`);
  const start = performance.now();

  const { renderId, bucketName } = await renderMediaOnLambda({
    region,
    functionName,
    serveUrl,
    composition: 'ScreenExplainer',
    codec: 'h264',
    inputProps: testProps,
    ...extra,
  });

  while (true) {
    const p = await getRenderProgress({ renderId, bucketName, functionName, region });
    if (p.fatalErrorEncountered) {
      console.error('FAILED:', p.errors);
      return;
    }
    if (p.done && p.outputFile) {
      const resp = await fetch(p.outputFile);
      const buf = Buffer.from(await resp.arrayBuffer());
      const path = `/tmp/quality-${label}.mp4`;
      fs.writeFileSync(path, buf);
      const sec = ((performance.now() - start) / 1000).toFixed(0);
      console.log(`  ${(buf.length / 1024 / 1024).toFixed(1)}MB, ${sec}s → ${path}`);
      return path;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const a = await renderTest('default', {});
const b = await renderTest('png-crf18', { imageFormat: 'png', crf: 18 });

// Compare bitrates
for (const f of [a, b].filter(Boolean)) {
  const { execSync } = await import('child_process');
  const info = execSync(
    `ffprobe -v error -show_entries stream=bit_rate -of default=noprint_wrappers=1 "${f}"`
  )
    .toString()
    .trim();
  console.log(`${f}: ${info}`);
}
