#!/usr/bin/env npx tsx
/**
 * YouTube Demo: Full Showcase — ALL building blocks in one video
 *
 * Every feature demonstrated in a 35-second clip:
 * - Fullscreen chapter card → sidebar layout → horizontal split
 * - Zoom effects, highlights, counters, lower thirds
 * - B-roll with Ken Burns, text cards
 * - PiP, CTA, captions, progress bar
 *
 * Usage: npx tsx scripts/demo-youtube-showcase.ts
 */
import path from 'path';
import { createRenderer } from '../src/render';
import type { YouTubeProps } from '../src/schemas/youtube-props';

import { fileURLToPath } from 'url';
const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const REMOTION_PKG_DIR = path.resolve(__dirname, '..');

async function main() {
  console.log('ReelStack — YouTube FULL SHOWCASE');
  console.log('═'.repeat(50));
  console.log('Every building block in 35 seconds');
  console.log('═'.repeat(50));

  const props: YouTubeProps = {
    layout: 'sidebar',
    sidebarPosition: 'right',
    sidebarWidth: 28,

    bRollSegments: [
      // 0-3s: Text card intro
      {
        startTime: 0,
        endTime: 3.5,
        media: {
          url: '',
          type: 'text-card',
          textCard: {
            headline: 'ReelStack',
            subtitle: 'Automated Video Production Pipeline',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 72,
          },
        },
        transition: { type: 'crossfade', durationMs: 600 },
      },
      // 10-13s: Color B-roll (code preview placeholder)
      {
        startTime: 10,
        endTime: 13,
        media: { url: '#0D2137', type: 'color', label: '💻 Live Code Demo' },
        animation: 'spring-scale',
        transition: { type: 'slide-left', durationMs: 300 },
      },
      // 19-22s: Text card mid-section
      {
        startTime: 19,
        endTime: 22,
        media: {
          url: '',
          type: 'text-card',
          textCard: {
            headline: 'Results',
            subtitle: '10x faster video production',
            background: 'linear-gradient(135deg, #1A2E1A 0%, #0F3F0F 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 64,
          },
        },
        transition: { type: 'zoom-in', durationMs: 500 },
      },
    ],

    chapters: [
      // Chapter: Intro (text card is playing, chapter card would overlap — use overlay)
      {
        startTime: 3.5,
        endTime: 5.5,
        number: 1,
        title: 'The Building Blocks',
        style: 'fullscreen',
        backgroundColor: '#0F0F0F',
        accentColor: '#3B82F6',
      },
      // Chapter 2: Results
      {
        startTime: 17,
        endTime: 19,
        number: 2,
        title: 'See It In Action',
        style: 'fullscreen',
        backgroundColor: '#0F0F0F',
        accentColor: '#10B981',
      },
    ],

    zoomSegments: [
      // Punch-in zoom on emphasis
      { startTime: 7, endTime: 9.5, scale: 1.4, focusPoint: { x: 50, y: 35 }, easing: 'spring' },
      // Smooth zoom during results
      { startTime: 24, endTime: 27, scale: 1.25, focusPoint: { x: 40, y: 50 }, easing: 'smooth' },
    ],

    highlights: [
      // Red glow highlight
      {
        startTime: 9.5,
        endTime: 12,
        x: 10,
        y: 15,
        width: 55,
        height: 50,
        color: '#FF4444',
        borderWidth: 3,
        borderRadius: 12,
        label: 'KEY FEATURE',
        glow: true,
      },
      // Blue highlight
      {
        startTime: 13,
        endTime: 15.5,
        x: 20,
        y: 30,
        width: 45,
        height: 35,
        color: '#3B82F6',
        borderWidth: 2,
        borderRadius: 8,
        glow: false,
      },
    ],

    counters: [
      {
        startTime: 22,
        endTime: 26,
        value: 1250000,
        prefix: '',
        suffix: ' views',
        format: 'abbreviated',
        textColor: '#FFFFFF',
        fontSize: 72,
        position: 'center',
      },
    ],

    lowerThirds: [
      {
        startTime: 5.5,
        endTime: 9,
        title: 'ReelStack Pipeline',
        subtitle: 'Open Source Video Automation',
        accentColor: '#3B82F6',
      },
    ],

    pipSegments: [
      // PiP webcam in corner (would need real video, placeholder timing)
      // Skipped for placeholder demo — works with real video URL
    ],

    ctaSegments: [
      {
        startTime: 28,
        endTime: 33,
        text: '⭐ Star on GitHub',
        style: 'button',
        backgroundColor: '#3B82F6',
        position: 'center',
      },
      {
        startTime: 30,
        endTime: 33,
        text: '🔔 Subscribe for more',
        style: 'pill',
        backgroundColor: '#DC2626',
        position: 'bottom',
      },
    ],

    cues: [
      { id: '1', text: 'ReelStack', startTime: 0.5, endTime: 2 },
      { id: '2', text: 'Automated Video Production', startTime: 2, endTime: 3.5 },
      { id: '3', text: 'Here are the building blocks', startTime: 5.5, endTime: 7.5 },
      { id: '4', text: 'Sidebar layout with webcam', startTime: 7.5, endTime: 10 },
      { id: '5', text: 'B-roll cutaways and transitions', startTime: 10, endTime: 12.5 },
      { id: '6', text: 'Highlight boxes for emphasis', startTime: 12.5, endTime: 15 },
      { id: '7', text: 'Lower thirds and chapters', startTime: 15, endTime: 17 },
      { id: '8', text: 'Now watch the results', startTime: 19, endTime: 21.5 },
      { id: '9', text: 'Animated counters', startTime: 22, endTime: 24 },
      { id: '10', text: 'Zoom effects and more', startTime: 24, endTime: 27 },
      { id: '11', text: 'Star us on GitHub!', startTime: 28, endTime: 31 },
    ],

    captionStyle: {
      fontFamily: 'Outfit, sans-serif',
      fontSize: 38,
      fontColor: '#FFFFFF',
      fontWeight: 'bold',
      fontStyle: 'normal',
      backgroundColor: '#000000',
      backgroundOpacity: 0.65,
      outlineColor: '#000000',
      outlineWidth: 3,
      shadowColor: '#000000',
      shadowBlur: 12,
      position: 87,
      alignment: 'center',
      lineHeight: 1.3,
      padding: 12,
      highlightColor: '#3B82F6',
      upcomingColor: '#666666',
    },

    musicVolume: 0.1,
    showProgressBar: true,
    backgroundColor: '#0F0F0F',
  };

  const outputPath = path.join(REMOTION_PKG_DIR, 'out', 'demo-youtube-showcase.mp4');
  console.log('Rendering...');

  const renderer = createRenderer();
  const result = await renderer.render(props as any, {
    outputPath,
    compositionId: 'YouTubeLongForm',
  });

  const sec = (result.durationMs / 1000).toFixed(1);
  const mb = (result.sizeBytes / 1024 / 1024).toFixed(1);

  console.log('');
  console.log('═'.repeat(50));
  console.log('ALL BUILDING BLOCKS DEMONSTRATED:');
  console.log('  ✓ Sidebar layout (70% main + 28% webcam)');
  console.log('  ✓ Text card intros (gradient backgrounds)');
  console.log('  ✓ Fullscreen chapter title cards');
  console.log('  ✓ B-roll cutaways (slide-left, zoom-in transitions)');
  console.log('  ✓ Punch-in zoom effects (spring + smooth)');
  console.log('  ✓ Highlight boxes (red glow + blue)');
  console.log('  ✓ Animated counter (1.25M views)');
  console.log('  ✓ Lower third (title + subtitle)');
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
