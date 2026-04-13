#!/usr/bin/env npx tsx
/**
 * Reel Demo: PiP + Lower Third + CTA Layers
 *
 * Showcases the overlay layer system:
 * - Lower third with speaker name
 * - CTA button overlay
 * - CTA pill overlay
 * - B-roll with transitions
 * - Karaoke captions
 *
 * Usage: npx tsx scripts/demo-reel-layers.ts
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
  console.log('ReelStack — Reel Layers Demo (PiP, Lower Third, CTA)');
  console.log('═'.repeat(50));

  const props: ReelProps = {
    layout: 'fullscreen',

    bRollSegments: [
      // Text card intro
      {
        startTime: 0,
        endTime: 3,
        media: {
          url: '',
          type: 'text-card',
          textCard: {
            headline: 'How I Automate\nEverything',
            subtitle: 'A 60-second breakdown',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 56,
          },
        },
        transition: { type: 'crossfade', durationMs: 500 },
      },
      // B-roll mid-section
      {
        startTime: 10,
        endTime: 13,
        media: { url: '#1A1A2E', type: 'color', label: '🔧 n8n Workflow' },
        animation: 'spring-scale',
        transition: { type: 'slide-left', durationMs: 300 },
      },
      // B-roll end section
      {
        startTime: 18,
        endTime: 21,
        media: { url: '#0D2137', type: 'color', label: '📈 Analytics Dashboard' },
        animation: 'fade',
        transition: { type: 'zoom-in', durationMs: 400 },
      },
    ],

    pipSegments: [],

    lowerThirds: [
      // Speaker name at start
      {
        startTime: 3,
        endTime: 7,
        title: 'Pawel Jurczyk',
        subtitle: 'TechSkills Academy',
        accentColor: '#3B82F6',
      },
      // Topic label mid-video
      {
        startTime: 14,
        endTime: 17,
        title: 'n8n + Docker',
        subtitle: 'Self-hosted automation stack',
        accentColor: '#10B981',
      },
    ],

    counters: [
      // Hours saved counter — synced with caption (16.5-20s)
      {
        startTime: 16.5,
        endTime: 20.5,
        value: 247,
        suffix: ' hours saved',
        format: 'full',
        textColor: '#FFFFFF',
        fontSize: 72,
        position: 'top',
      },
    ],

    ctaSegments: [
      // CTA button
      {
        startTime: 23,
        endTime: 27,
        text: 'Free Setup Guide',
        style: 'button',
        backgroundColor: '#3B82F6',
        position: 'center',
      },
      // CTA pill at bottom
      {
        startTime: 25,
        endTime: 27,
        text: 'Follow for more',
        style: 'pill',
        backgroundColor: '#DC2626',
        position: 'bottom',
      },
    ],

    cues: buildKaraokeCues([
      { id: '1', text: 'How I automate everything', startTime: 0.5, endTime: 2.5 },
      { id: '2', text: 'in sixty seconds', startTime: 2.5, endTime: 4 },
      { id: '3', text: 'Hi I am Pawel', startTime: 4, endTime: 5.5 },
      { id: '4', text: 'and I build self-hosted tools', startTime: 5.5, endTime: 8 },
      { id: '5', text: 'The secret is n8n', startTime: 8, endTime: 10 },
      { id: '6', text: 'a workflow automation platform', startTime: 10, endTime: 12.5 },
      { id: '7', text: 'running on my own server', startTime: 12.5, endTime: 14.5 },
      { id: '8', text: 'With Docker containers', startTime: 14.5, endTime: 16.5 },
      { id: '9', text: 'Two hundred forty seven hours saved', startTime: 16.5, endTime: 19 },
      { id: '10', text: 'and everything stays private', startTime: 19, endTime: 21 },
      { id: '11', text: 'Check the analytics', startTime: 21, endTime: 23 },
      { id: '12', text: 'Get the free setup guide', startTime: 23, endTime: 25 },
      { id: '13', text: 'Link in bio', startTime: 25, endTime: 27 },
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
      position: 75,
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

  const outputPath = path.join(REMOTION_PKG_DIR, 'out', 'demo-reel-layers.mp4');
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
  console.log('  ✓ Text card intro (gradient)');
  console.log('  ✓ 2 Lower thirds (speaker + topic)');
  console.log('  ✓ Animated counter (247 hours saved)');
  console.log('  ✓ 2 CTA overlays (button + pill)');
  console.log('  ✓ B-roll cutaways with transitions');
  console.log('  ✓ Karaoke captions');
  console.log('  ✓ Progress bar');
  console.log('═'.repeat(50));
  console.log(`Output: ${outputPath}`);
  console.log(`Size: ${mb} MB | Render: ${sec}s`);
}

main().catch((err) => {
  console.error('Demo failed:', err.message ?? err);
  process.exit(1);
});
