#!/usr/bin/env npx tsx
/**
 * Reel Demo: Text Cards + B-Roll Transitions
 *
 * Showcases the text card overlay system:
 * - Gradient text card intro
 * - Color B-roll placeholders with labels
 * - Multiple transition types (crossfade, slide-left, zoom-in, wipe)
 * - Karaoke captions
 * - Progress bar
 *
 * Usage: npx tsx scripts/demo-reel-textcards.ts
 */
import path from 'path';
import { createRenderer } from '../src/render';
import type { ReelProps } from '../src/schemas/reel-props';

import { fileURLToPath } from 'url';
const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const REMOTION_PKG_DIR = path.resolve(__dirname, '..');

function buildKaraokeCues(
  cues: Array<{ id: string; text: string; startTime: number; endTime: number }>
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
  console.log('ReelStack — Reel Text Cards & Transitions Demo');
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
            headline: 'Deploy Faster',
            subtitle: 'Self-hosted workflow automation',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 64,
          },
        },
        transition: { type: 'crossfade', durationMs: 600 },
      },
      // 6-9s: Color B-roll (slide-left)
      {
        startTime: 6,
        endTime: 9,
        media: { url: '#0D2137', type: 'color', label: '⌨️ Terminal Output' },
        animation: 'spring-scale',
        transition: { type: 'slide-left', durationMs: 300 },
      },
      // 12-15s: Text card mid-section (zoom-in)
      {
        startTime: 12,
        endTime: 15,
        media: {
          url: '',
          type: 'text-card',
          textCard: {
            headline: '10x Faster',
            subtitle: 'Than manual editing',
            background: 'linear-gradient(135deg, #1A2E1A 0%, #0F3F0F 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 72,
          },
        },
        transition: { type: 'zoom-in', durationMs: 500 },
      },
      // 17-20s: Color B-roll (wipe)
      {
        startTime: 17,
        endTime: 20,
        media: { url: '#2D1A2E', type: 'color', label: '📊 Dashboard Preview' },
        animation: 'fade',
        transition: { type: 'wipe', durationMs: 400 },
      },
    ],

    pipSegments: [],
    lowerThirds: [],
    ctaSegments: [],

    cues: buildKaraokeCues([
      { id: '1', text: 'Deploy faster', startTime: 0.5, endTime: 2.5 },
      { id: '2', text: 'with self-hosted automation', startTime: 2.5, endTime: 4.5 },
      { id: '3', text: 'Set up your pipeline', startTime: 4.5, endTime: 6.5 },
      { id: '4', text: 'in just five minutes', startTime: 6.5, endTime: 8.5 },
      { id: '5', text: 'No more manual editing', startTime: 9, endTime: 11 },
      { id: '6', text: 'Everything runs automatically', startTime: 11, endTime: 13 },
      { id: '7', text: 'Ten times faster', startTime: 13, endTime: 15 },
      { id: '8', text: 'Monitor your workflow', startTime: 15.5, endTime: 17.5 },
      { id: '9', text: 'from a single dashboard', startTime: 17.5, endTime: 19.5 },
      { id: '10', text: 'Start building today', startTime: 20, endTime: 22 },
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
      position: 80,
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

  const outputPath = path.join(REMOTION_PKG_DIR, 'out', 'demo-reel-textcards.mp4');
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
  console.log('DEMO FEATURES:');
  console.log('  ✓ Gradient text card intro');
  console.log('  ✓ Text card mid-section (zoom-in transition)');
  console.log('  ✓ Color B-roll with labels');
  console.log('  ✓ 4 transition types (crossfade, slide-left, zoom-in, wipe)');
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
