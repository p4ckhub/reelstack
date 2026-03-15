#!/usr/bin/env npx tsx
/**
 * YouTube Demo: Zoom Effects + Highlight Boxes + Animated Counters
 *
 * Showcases the dynamic emphasis style:
 * - Punch-in zoom on key moments
 * - Highlight boxes framing important areas
 * - Animated counter (subscriber count)
 * - Text card B-roll
 *
 * Usage: npx tsx scripts/demo-youtube-zoom.ts
 */
import path from 'path';
import { createRenderer } from '../src/render';
import type { YouTubeProps } from '../src/schemas/youtube-props';

import { fileURLToPath } from 'url';
const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const REMOTION_PKG_DIR = path.resolve(__dirname, '..');

async function main() {
  console.log('ReelStack — YouTube Zoom & Highlights Demo');
  console.log('═'.repeat(50));

  const props: YouTubeProps = {
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
            headline: '5 Things You Need\nTo Know',
            subtitle: 'Before deploying to production',
            background: 'linear-gradient(135deg, #1e3a5f 0%, #0f1f33 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 56,
          },
        },
        transition: { type: 'crossfade', durationMs: 500 },
      },
      // Color B-roll for demo
      {
        startTime: 12,
        endTime: 15,
        media: { url: '#1A1A2E', type: 'color', label: '🔧 Terminal Output' },
        animation: 'spring-scale',
        transition: { type: 'zoom-in', durationMs: 400 },
      },
    ],

    zoomSegments: [
      // Punch-in zoom during emphasis
      { startTime: 5, endTime: 7.5, scale: 1.5, focusPoint: { x: 50, y: 40 }, easing: 'spring' },
      // Smooth zoom during explanation
      { startTime: 17, endTime: 20, scale: 1.3, focusPoint: { x: 30, y: 50 }, easing: 'smooth' },
    ],

    highlights: [
      // Highlight box on "code"
      {
        startTime: 7.5,
        endTime: 10,
        x: 15,
        y: 20,
        width: 70,
        height: 40,
        color: '#FF4444',
        borderWidth: 3,
        borderRadius: 12,
        label: 'IMPORTANT',
        glow: true,
      },
      // Second highlight
      {
        startTime: 15,
        endTime: 17,
        x: 25,
        y: 35,
        width: 50,
        height: 30,
        color: '#3B82F6',
        borderWidth: 2,
        borderRadius: 8,
        label: 'Configuration',
        glow: false,
      },
    ],

    counters: [
      // Subscriber count animation
      {
        startTime: 22,
        endTime: 26,
        value: 500000,
        suffix: ' subscribers',
        format: 'abbreviated',
        textColor: '#FFFFFF',
        fontSize: 64,
        position: 'center',
      },
    ],

    pipSegments: [],
    lowerThirds: [],
    chapters: [],

    ctaSegments: [
      {
        startTime: 22,
        endTime: 26,
        text: 'Join the community',
        style: 'banner',
        backgroundColor: '#DC2626',
        position: 'bottom',
      },
    ],

    cues: [
      { id: '1', text: 'Five things you need to know', startTime: 0.5, endTime: 3 },
      { id: '2', text: 'before deploying to production', startTime: 3, endTime: 5 },
      { id: '3', text: 'Number one: always check', startTime: 5, endTime: 7.5 },
      { id: '4', text: 'your environment variables', startTime: 7.5, endTime: 10 },
      { id: '5', text: 'This is critical', startTime: 10, endTime: 12 },
      { id: '6', text: 'Number two: configure your', startTime: 12, endTime: 14.5 },
      { id: '7', text: 'logging and monitoring', startTime: 14.5, endTime: 17 },
      { id: '8', text: 'so you can debug issues', startTime: 17, endTime: 19.5 },
      { id: '9', text: 'in real time', startTime: 19.5, endTime: 22 },
      { id: '10', text: 'Thanks for watching!', startTime: 22, endTime: 24 },
    ],

    captionStyle: {
      fontFamily: 'Outfit, sans-serif',
      fontSize: 36,
      fontColor: '#FFFFFF',
      fontWeight: 'bold',
      fontStyle: 'normal',
      backgroundColor: '#000000',
      backgroundOpacity: 0.5,
      outlineColor: '#000000',
      outlineWidth: 3,
      shadowColor: '#000000',
      shadowBlur: 12,
      position: 85,
      alignment: 'center',
      lineHeight: 1.3,
      padding: 10,
      highlightColor: '#F59E0B',
      upcomingColor: '#888888',
    },

    musicVolume: 0.1,
    showProgressBar: false,
    backgroundColor: '#0F0F0F',
  };

  const outputPath = path.join(REMOTION_PKG_DIR, 'out', 'demo-youtube-zoom.mp4');
  console.log('Rendering...');
  const start = performance.now();

  const renderer = createRenderer();
  const result = await renderer.render(props as any, {
    outputPath,
    compositionId: 'YouTubeLongForm',
  });

  const sec = (result.durationMs / 1000).toFixed(1);
  const mb = (result.sizeBytes / 1024 / 1024).toFixed(1);

  console.log('');
  console.log('═'.repeat(50));
  console.log('DEMO FEATURES:');
  console.log('  ✓ Text card intro (gradient background)');
  console.log('  ✓ 2 punch-in zoom effects (spring + smooth)');
  console.log('  ✓ 2 highlight boxes (red glow + blue)');
  console.log('  ✓ Animated counter (500K subscribers)');
  console.log('  ✓ CTA banner');
  console.log('  ✓ Karaoke captions');
  console.log('═'.repeat(50));
  console.log(`Output: ${outputPath}`);
  console.log(`Size: ${mb} MB | Render: ${sec}s`);
}

main().catch((err) => {
  console.error('Demo failed:', err.message ?? err);
  process.exit(1);
});
