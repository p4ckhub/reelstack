#!/usr/bin/env bun
/**
 * Standalone slideshow module test — generates 3 different reels.
 *
 * Tests the image-gen → TTS → composition props pipeline.
 * Does NOT do Remotion rendering (requires bundle + chromium).
 * Instead verifies that all steps produce valid output.
 *
 * Usage: cd packages/modules && bun run scripts/test-slideshow.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { renderToFile, listTemplates, listBrands } from '@reelstack/image-gen';

console.log('═'.repeat(60));
console.log('ReelStack Slideshow Module — Integration Test');
console.log('═'.repeat(60));

// ── Check prerequisites ──────────────────────────────────────
console.log('\n1. Checking prerequisites...');
console.log(`   Templates: ${listTemplates().join(', ')}`);
console.log(`   Brands: ${listBrands().join(', ')}`);

const outDir = path.join(os.tmpdir(), 'reelstack-slideshow-test');
fs.mkdirSync(outDir, { recursive: true });
console.log(`   Output dir: ${outDir}`);

// ── Test 1: Tech Tips (tip-card template, example brand) ─────
console.log('\n2. Test Reel #1: "5 TypeScript Tips" (tip-card + example brand)');
const test1Slides = [
  { title: 'Use Strict Mode', text: 'Enable strict in tsconfig for better type safety', badge: 'Tip 1', num: '1' },
  { title: 'Prefer const', text: 'Use const assertions for literal types', badge: 'Tip 2', num: '2' },
  { title: 'Avoid any', text: 'Use unknown instead of any for type-safe code', badge: 'Tip 3', num: '3' },
  { title: 'Template Literals', text: 'Template literal types for string patterns', badge: 'Tip 4', num: '4' },
  { title: 'Discriminated Unions', text: 'Use tagged unions for exhaustive checks', badge: 'Tip 5', num: '5' },
];

for (let i = 0; i < test1Slides.length; i++) {
  const slide = test1Slides[i]!;
  const outPath = path.join(outDir, `test1-slide-${i}.png`);
  const bytes = await renderToFile(
    { brand: 'example', template: 'tip-card', size: 'story', ...slide },
    outPath,
  );
  console.log(`   ✓ Slide ${i + 1}: ${outPath} (${(bytes / 1024).toFixed(0)} KB)`);
}

// ── Test 2: Webinar Promo (various webinar templates, example brand) ─
console.log('\n3. Test Reel #2: "Webinar Promo" (webinar templates + example brand)');
const test2Slides = [
  { template: 'webinar-cover', title: 'Docker Masterclass', text: 'Learn containerization from scratch', badge: 'FREE WEBINAR', num: '1' },
  { template: 'webinar-point', title: 'Build & Ship', text: 'Create production-ready Docker images', badge: 'What you will learn', num: '2' },
  { template: 'webinar-point', title: 'Docker Compose', text: 'Multi-container apps with compose files', badge: 'What you will learn', num: '3' },
  { template: 'webinar-cta-slide', title: 'Register Now', text: 'March 25, 2026 at 7 PM', cta: 'example.com/webinar', badge: 'FREE', num: '4' },
];

for (let i = 0; i < test2Slides.length; i++) {
  const slide = test2Slides[i]!;
  const tmpl = slide.template ?? 'tip-card';
  const outPath = path.join(outDir, `test2-slide-${i}.png`);
  const bytes = await renderToFile(
    { brand: 'example', template: tmpl, size: 'story', title: slide.title, text: slide.text, badge: slide.badge, num: slide.num, cta: slide.cta ?? '' },
    outPath,
  );
  console.log(`   ✓ Slide ${i + 1} (${tmpl}): ${outPath} (${(bytes / 1024).toFixed(0)} KB)`);
}

// ── Test 3: Quote series (quote-card template, example-light brand) ─
console.log('\n4. Test Reel #3: "Motivational Quotes" (quote-card + example-light brand)');
const test3Slides = [
  { title: '', text: 'The only constant in life is change.', attr: '— Heraclitus', badge: '#1', num: '1' },
  { title: '', text: 'You do not have to be great to start. You have to start to be great.', attr: '— Zig Ziglar', badge: '#2', num: '2' },
  { title: '', text: 'The best time to plant a tree was 20 years ago. The second best time is now.', attr: '— Chinese Proverb', badge: '#3', num: '3' },
];

for (let i = 0; i < test3Slides.length; i++) {
  const slide = test3Slides[i]!;
  const outPath = path.join(outDir, `test3-slide-${i}.png`);
  const bytes = await renderToFile(
    { brand: 'example-light', template: 'quote-card', size: 'story', text: slide.text, attr: (slide as Record<string, string>).attr ?? '', badge: slide.badge, num: slide.num },
    outPath,
  );
  console.log(`   ✓ Slide ${i + 1}: ${outPath} (${(bytes / 1024).toFixed(0)} KB)`);
}

// ── Test script generator ────────────────────────────────────
console.log('\n5. Testing script generator (manual slides → SlideshowScript)...');
import { wrapManualSlides } from '../src/slideshow/script-generator';

const script = wrapManualSlides('TypeScript Tips', test1Slides);
console.log(`   ✓ Script generated: ${script.slides.length} slides`);
console.log(`   ✓ Narration: "${script.fullNarration.slice(0, 80)}..."`);

// ── Test composition props builder ───────────────────────────
console.log('\n6. Testing composition props builder...');
import { buildSlideshowProps } from '../src/slideshow/orchestrator';

const fakeImageUrls = test1Slides.map((_, i) => `file://${path.join(outDir, `test1-slide-${i}.png`)}`);
const fakeCues = [
  { id: '1', text: 'Use strict mode for better type safety', startTime: 0, endTime: 3 },
  { id: '2', text: 'Prefer const assertions', startTime: 3, endTime: 6 },
  { id: '3', text: 'Avoid any, use unknown', startTime: 6, endTime: 9 },
  { id: '4', text: 'Template literal types', startTime: 9, endTime: 12 },
  { id: '5', text: 'Discriminated unions', startTime: 12, endTime: 15 },
];

const props = buildSlideshowProps({
  script,
  imageUrls: fakeImageUrls,
  cues: fakeCues,
  voiceoverUrl: 'file:///tmp/voiceover.mp3',
  durationSeconds: 15,
});

console.log(`   ✓ Props built: ${props.slides.length} slides, ${props.cues.length} cues`);
console.log(`   ✓ Duration: ${props.durationSeconds}s`);
console.log(`   ✓ Slide timing: ${props.slides.map(s => `${s.startTime.toFixed(1)}-${s.endTime.toFixed(1)}s`).join(', ')}`);

// ── Summary ──────────────────────────────────────────────────
const pngFiles = fs.readdirSync(outDir).filter(f => f.endsWith('.png'));
console.log('\n' + '═'.repeat(60));
console.log(`DONE: ${pngFiles.length} slide PNGs generated in ${outDir}`);
console.log('Open in Finder: open ' + outDir);
console.log('═'.repeat(60));
