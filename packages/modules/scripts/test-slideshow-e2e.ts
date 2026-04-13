#!/usr/bin/env bun
/**
 * End-to-end slideshow test — generates real MP4 reels.
 *
 * Pipeline: manual slides → image-gen PNGs → edge-tts → whisper → Remotion → MP4
 *
 * Usage: cd /Users/pavvel/workspace/projects/reelstack && bun run packages/modules/scripts/test-slideshow-e2e.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { renderToFile } from '@reelstack/image-gen';
import { runTTSPipeline, renderVideo } from '@reelstack/agent';
import { buildSlideshowProps } from '../src/slideshow/orchestrator';
import { wrapManualSlides } from '../src/slideshow/script-generator';
import type { Slide } from '../src/slideshow/types';

const outDir = path.join(os.homedir(), 'Desktop', 'reelstack-test-reels');
fs.mkdirSync(outDir, { recursive: true });

interface ReelTest {
  name: string;
  brand: string;
  template: string;
  slides: Slide[];
  narration: string;
}

const tests: ReelTest[] = [
  {
    name: 'typescript-tips',
    brand: 'example',
    template: 'tip-card',
    slides: [
      {
        title: 'Use Strict Mode',
        text: 'Enable strict in tsconfig for better type safety',
        badge: 'Tip 1',
        num: '1',
      },
      {
        title: 'Prefer const',
        text: 'Use const assertions for literal types',
        badge: 'Tip 2',
        num: '2',
      },
      {
        title: 'Avoid any',
        text: 'Use unknown instead of any for type-safe code',
        badge: 'Tip 3',
        num: '3',
      },
    ],
    narration:
      'Here are three TypeScript tips every developer should know. First, enable strict mode in your tsconfig for better type safety. Second, prefer const assertions for literal types. Third, avoid using any. Use unknown instead for type-safe code.',
  },
  {
    name: 'docker-webinar',
    brand: 'example',
    template: 'webinar-point',
    slides: [
      {
        title: 'Docker Masterclass',
        text: 'Learn containerization from scratch',
        badge: 'FREE WEBINAR',
        num: '1',
        template: 'webinar-cover',
      },
      {
        title: 'Build & Ship',
        text: 'Create production-ready Docker images',
        badge: '#1',
        num: '2',
      },
      {
        title: 'Docker Compose',
        text: 'Multi-container apps with compose files',
        badge: '#2',
        num: '3',
      },
    ],
    narration:
      'Join our free Docker Masterclass. You will learn containerization from scratch. We will cover building and shipping production-ready Docker images. And how to use Docker Compose for multi-container applications.',
  },
  {
    name: 'quotes-en',
    brand: 'example-light',
    template: 'quote-card',
    slides: [
      { title: '', text: 'The only constant in life is change.', badge: '#1', num: '1' },
      { title: '', text: 'You do not have to be great to start.', badge: '#2', num: '2' },
      { title: '', text: 'The best time is now.', badge: '#3', num: '3' },
    ],
    narration:
      'The only constant in life is change. You do not have to be great to start. You have to start to be great. The best time to plant a tree was twenty years ago. The second best time is now.',
  },
];

for (const test of tests) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Reel: ${test.name} (${test.brand} brand)`);
  console.log('═'.repeat(60));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `reelstack-e2e-${test.name}-`));

  // 1. Render slide PNGs
  console.log('  1. Rendering slide PNGs...');
  const imagePaths: string[] = [];
  for (let i = 0; i < test.slides.length; i++) {
    const slide = test.slides[i]!;
    const tmpl = slide.template ?? test.template;
    const outPath = path.join(tmpDir, `slide-${i}.png`);
    await renderToFile(
      {
        brand: test.brand,
        template: tmpl,
        size: 'story',
        title: slide.title ?? '',
        text: slide.text ?? '',
        badge: slide.badge ?? '',
        num: slide.num ?? '',
      },
      outPath
    );
    console.log(
      `     slide ${i + 1}: ${tmpl} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`
    );
    imagePaths.push(outPath);
  }

  // 2. TTS + Whisper
  console.log('  2. TTS + Whisper...');
  const language = 'en-US';
  const ttsResult = await runTTSPipeline(
    {
      script: test.narration,
      tts: { provider: 'edge-tts', language },
      whisper: {},
    },
    tmpDir,
    (msg) => console.log(`     ${msg}`)
  );

  console.log(
    `     duration: ${ttsResult.audioDuration.toFixed(1)}s, cues: ${ttsResult.cues.length}`
  );

  // 3. Build composition props (use file:// URLs — no storage needed)
  console.log('  3. Building composition props...');
  const script = wrapManualSlides(test.name, test.slides);
  const imageUrls = imagePaths.map((p) => `file://${p}`);

  const props = buildSlideshowProps({
    script,
    imageUrls,
    cues: ttsResult.cues,
    voiceoverUrl: `file://${ttsResult.voiceoverPath}`,
    durationSeconds: ttsResult.audioDuration,
  });

  // 4. Remotion render
  console.log('  4. Remotion render → MP4...');
  const mp4Path = path.join(outDir, `${test.name}.mp4`);
  const { outputPath, step } = await renderVideo(
    { ...props, compositionId: 'Slideshow' } as unknown as Record<string, unknown>,
    mp4Path,
    (msg) => console.log(`     ${msg}`)
  );

  const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0);
  console.log(
    `  ✓ Done: ${outputPath} (${sizeKB} KB, ${(step.durationMs / 1000).toFixed(1)}s render)`
  );

  // Cleanup tmp
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`ALL DONE — 3 reels in ${outDir}`);
console.log(`open ${outDir}`);
console.log('═'.repeat(60));
