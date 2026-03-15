#!/usr/bin/env npx tsx
/**
 * Reel Demo: Full Showcase — ALL reel building blocks in one video
 *
 * Every Reel feature demonstrated in a 30-second clip:
 * - Text card intro + mid-section
 * - B-roll with all transition types
 * - Lower third
 * - CTA (button + pill)
 * - Karaoke captions
 * - Progress bar
 *
 * Usage: npx tsx scripts/demo-reel-showcase.ts
 */
import path from 'path';
import { createRenderer } from '../src/render';
import type { ReelProps } from '../src/schemas/reel-props';

import { fileURLToPath } from 'url';
const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const REMOTION_PKG_DIR = path.resolve(__dirname, '..');

/**
 * Generates word-level timestamps for karaoke animation.
 * Evenly distributes time across words in each cue.
 */
function buildKaraokeCues(
  cues: Array<{ id: string; text: string; startTime: number; endTime: number }>,
) {
  return cues.map((cue) => {
    const words = cue.text.split(' ');
    const duration = cue.endTime - cue.startTime;
    const wordDuration = duration / words.length;
    return {
      ...cue,
      animationStyle: 'karaoke' as const,
      words: words.map((word, i) => ({
        text: word,
        startTime: cue.startTime + i * wordDuration,
        endTime: cue.startTime + (i + 1) * wordDuration,
      })),
    };
  });
}

async function main() {
  console.log('ReelStack — Reel FULL SHOWCASE');
  console.log('═'.repeat(50));
  console.log('Every reel building block in 30 seconds');
  console.log('═'.repeat(50));

  const props: ReelProps = {
    layout: 'fullscreen',

    bRollSegments: [
      // 0-3.5s: Text card intro
      {
        startTime: 0,
        endTime: 3.5,
        media: {
          url: '',
          type: 'text-card',
          textCard: {
            headline: 'ReelStack',
            subtitle: 'Programmatic Video Pipeline',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 64,
          },
        },
        transition: { type: 'crossfade', durationMs: 600 },
      },
      // 7-10s: Color B-roll (slide-left)
      {
        startTime: 7,
        endTime: 10,
        media: { url: '#0D2137', type: 'color', label: '💻 Code Demo' },
        animation: 'spring-scale',
        transition: { type: 'slide-left', durationMs: 300 },
      },
      // 13-16s: Text card mid-section (zoom-in)
      {
        startTime: 13,
        endTime: 16,
        media: {
          url: '',
          type: 'text-card',
          textCard: {
            headline: 'Automated',
            subtitle: 'Captions, B-roll, transitions',
            background: 'linear-gradient(135deg, #2D1A2E 0%, #1A0F2E 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 64,
          },
        },
        transition: { type: 'zoom-in', durationMs: 500 },
      },
      // 19-22s: Color B-roll (wipe)
      {
        startTime: 19,
        endTime: 22,
        media: { url: '#1A2E1A', type: 'color', label: '📊 Output Preview' },
        animation: 'fade',
        transition: { type: 'wipe', durationMs: 400 },
      },
      // 25-27s: Color B-roll (slide-right)
      {
        startTime: 25,
        endTime: 27,
        media: { url: '#2E2D1A', type: 'color', label: '🚀 Deploy' },
        animation: 'spring-scale',
        transition: { type: 'slide-right', durationMs: 300 },
      },
    ],

    pipSegments: [],

    zoomSegments: [
      // Punch-in zoom on "B-roll cutaways" (7.5-9.5s)
      { startTime: 7.5, endTime: 10, scale: 1.4, focusPoint: { x: 50, y: 40 }, easing: 'spring' },
      // Smooth zoom during counter (18-22s)
      { startTime: 15.5, endTime: 18, scale: 1.25, focusPoint: { x: 50, y: 50 }, easing: 'smooth' },
    ],

    highlights: [
      // Red glow highlight during text cards section (23-25s)
      {
        startTime: 23,
        endTime: 25.5,
        x: 10,
        y: 20,
        width: 80,
        height: 45,
        color: '#F59E0B',
        borderWidth: 3,
        borderRadius: 12,
        label: 'TEXT CARD',
        glow: true,
      },
    ],

    lowerThirds: [
      // Speaker name at start
      {
        startTime: 3.5,
        endTime: 7,
        title: 'ReelStack Pipeline',
        subtitle: 'Open Source Video Automation',
        accentColor: '#3B82F6',
      },
      // Lower third visible when captions talk about it (10.5-13.5s)
      {
        startTime: 10.5,
        endTime: 14,
        title: 'Lower Third Demo',
        subtitle: 'Animated name tag overlay',
        accentColor: '#10B981',
      },
    ],

    counters: [
      // Animated counter — synced with "ten thousand renders" caption (18-22s)
      {
        startTime: 18,
        endTime: 22,
        value: 10000,
        suffix: ' renders',
        format: 'abbreviated',
        textColor: '#FFFFFF',
        fontSize: 80,
        position: 'top',
      },
    ],

    ctaSegments: [
      // CTA button — visible when captions mention CTA (27-32s)
      {
        startTime: 27,
        endTime: 32,
        text: 'Star on GitHub',
        style: 'button',
        backgroundColor: '#3B82F6',
        position: 'center',
      },
      // CTA pill
      {
        startTime: 29,
        endTime: 32,
        text: 'Follow for more',
        style: 'pill',
        backgroundColor: '#DC2626',
        position: 'bottom',
      },
    ],

    cues: buildKaraokeCues([
      { id: '1', text: 'ReelStack', startTime: 0.5, endTime: 2 },
      { id: '2', text: 'Programmatic video pipeline', startTime: 2, endTime: 3.5 },
      { id: '3', text: 'Create reels with code', startTime: 3.5, endTime: 5.5 },
      { id: '4', text: 'No manual editing needed', startTime: 5.5, endTime: 7.5 },
      { id: '5', text: 'B-roll cutaways', startTime: 7.5, endTime: 9.5 },
      { id: '6', text: 'with smooth transitions', startTime: 9.5, endTime: 11 },
      { id: '7', text: 'Lower thirds for context', startTime: 11, endTime: 13 },
      { id: '8', text: 'Everything automated', startTime: 13.5, endTime: 15.5 },
      { id: '9', text: 'Captions overlays progress', startTime: 15.5, endTime: 18 },
      { id: '10', text: 'Ten thousand renders', startTime: 18, endTime: 20.5 },
      { id: '11', text: 'and counting', startTime: 20.5, endTime: 23 },
      { id: '12', text: 'Text cards for emphasis', startTime: 23, endTime: 25 },
      { id: '13', text: 'CTA buttons to convert', startTime: 25, endTime: 27.5 },
      { id: '14', text: 'Star us on GitHub!', startTime: 27.5, endTime: 32 },
    ]),

    captionStyle: {
      fontFamily: 'Outfit, sans-serif',
      fontSize: 48,
      fontColor: '#F5F5F0',
      fontWeight: 'bold',
      fontStyle: 'normal',
      backgroundColor: '#0E0E12',
      backgroundOpacity: 0.85,
      outlineColor: '#0E0E12',
      outlineWidth: 3,
      shadowColor: '#000000',
      shadowBlur: 12,
      position: 78,
      alignment: 'center',
      lineHeight: 1.3,
      padding: 14,
      highlightColor: '#F59E0B',
      upcomingColor: '#8888A0',
    },

    musicVolume: 0,
    showProgressBar: true,
    backgroundColor: '#0E0E12',
  };

  const outputPath = path.join(REMOTION_PKG_DIR, 'out', 'demo-reel-showcase.mp4');
  console.log('Rendering...');

  const renderer = createRenderer();
  const result = await renderer.render(props as any, {
    outputPath,
    compositionId: 'Reel',
  });

  const sec = (result.durationMs / 1000).toFixed(1);
  const mb = (result.sizeBytes / 1024 / 1024).toFixed(1);

  console.log('');
  console.log('═'.repeat(50));
  console.log('ALL REEL BUILDING BLOCKS DEMONSTRATED:');
  console.log('  ✓ Text card intros (gradient backgrounds)');
  console.log('  ✓ B-roll cutaways (slide-left, slide-right, zoom-in, wipe)');
  console.log('  ✓ Punch-in zoom effects (spring + smooth)');
  console.log('  ✓ Highlight box (amber glow)');
  console.log('  ✓ Lower third (title + subtitle)');
  console.log('  ✓ Animated counter (10K renders)');
  console.log('  ✓ CTA button + pill');
  console.log('  ✓ Karaoke captions (Outfit font)');
  console.log('  ✓ Progress bar');
  console.log('═'.repeat(50));
  console.log(`Output: ${outputPath}`);
  console.log(`Size: ${mb} MB | Render: ${sec}s`);
}

main().catch((err) => {
  console.error('Demo failed:', err.message ?? err);
  process.exit(1);
});
