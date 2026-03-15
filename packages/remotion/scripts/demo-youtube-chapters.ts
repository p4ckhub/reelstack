#!/usr/bin/env npx tsx
/**
 * YouTube Demo: Chapter Cards + Sidebar Layout + Lower Thirds
 *
 * Showcases the tutorial/educational video style:
 * - Sidebar layout (main content + webcam)
 * - Fullscreen chapter title cards between sections
 * - Lower third with speaker name
 * - Karaoke captions
 *
 * Usage: npx tsx scripts/demo-youtube-chapters.ts
 */
import path from 'path';
import { createRenderer } from '../src/render';
import type { YouTubeProps } from '../src/schemas/youtube-props';

import { fileURLToPath } from 'url';
const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const REMOTION_PKG_DIR = path.resolve(__dirname, '..');

async function main() {
  console.log('ReelStack — YouTube Chapter Cards Demo');
  console.log('═'.repeat(50));

  const props: YouTubeProps = {
    layout: 'sidebar',
    sidebarPosition: 'right',
    sidebarWidth: 30,

    bRollSegments: [
      // B-roll cutaway during explanation
      {
        startTime: 8,
        endTime: 11,
        media: { url: '#1A2E1A', type: 'color', label: '💻 Code Preview' },
        animation: 'spring-scale',
        transition: { type: 'zoom-in', durationMs: 400 },
      },
      {
        startTime: 18,
        endTime: 21,
        media: { url: '#2D1A2E', type: 'color', label: '📊 Dashboard' },
        animation: 'fade',
        transition: { type: 'slide-left', durationMs: 300 },
      },
    ],

    chapters: [
      // Chapter 1: Intro
      {
        startTime: 0,
        endTime: 2.5,
        number: 1,
        title: 'Introduction',
        subtitle: 'What we are building today',
        style: 'fullscreen',
        backgroundColor: '#0F0F0F',
        accentColor: '#3B82F6',
      },
      // Chapter 2
      {
        startTime: 12,
        endTime: 14.5,
        number: 2,
        title: 'Setting Up',
        subtitle: 'Docker + Node.js environment',
        style: 'fullscreen',
        backgroundColor: '#0F0F0F',
        accentColor: '#10B981',
      },
      // Chapter 3 (overlay style)
      {
        startTime: 22,
        endTime: 24,
        number: 3,
        title: 'Deployment',
        style: 'overlay',
        accentColor: '#F59E0B',
      },
    ],

    zoomSegments: [],
    counters: [],
    highlights: [],
    pipSegments: [],

    lowerThirds: [
      {
        startTime: 2.5,
        endTime: 6,
        title: 'Pawel Jurczyk',
        subtitle: 'TechSkills Academy',
        accentColor: '#3B82F6',
      },
    ],

    ctaSegments: [
      {
        startTime: 26,
        endTime: 30,
        text: '🔔 Subscribe for more',
        style: 'pill',
        backgroundColor: '#DC2626',
        position: 'bottom',
      },
    ],

    cues: [
      { id: '1', text: 'Welcome to this tutorial', startTime: 2.5, endTime: 5 },
      { id: '2', text: 'Today we will build', startTime: 5, endTime: 7 },
      { id: '3', text: 'a self-hosted platform', startTime: 7, endTime: 9.5 },
      { id: '4', text: 'using Docker containers', startTime: 9.5, endTime: 12 },
      { id: '5', text: 'First, let us set up', startTime: 14.5, endTime: 16.5 },
      { id: '6', text: 'our development environment', startTime: 16.5, endTime: 19 },
      { id: '7', text: 'with the right tools', startTime: 19, endTime: 21.5 },
      { id: '8', text: 'Now let us deploy', startTime: 24, endTime: 26 },
      { id: '9', text: 'to production', startTime: 26, endTime: 28 },
    ],

    captionStyle: {
      fontFamily: 'Outfit, sans-serif',
      fontSize: 36,
      fontColor: '#FFFFFF',
      fontWeight: 'bold',
      fontStyle: 'normal',
      backgroundColor: '#000000',
      backgroundOpacity: 0.6,
      outlineColor: '#000000',
      outlineWidth: 2,
      shadowColor: '#000000',
      shadowBlur: 8,
      position: 85,
      alignment: 'center',
      lineHeight: 1.3,
      padding: 10,
      highlightColor: '#3B82F6',
      upcomingColor: '#888888',
    },

    musicVolume: 0.1,
    showProgressBar: false,
    backgroundColor: '#0F0F0F',
  };

  const outputPath = path.join(REMOTION_PKG_DIR, 'out', 'demo-youtube-chapters.mp4');
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
  console.log('  ✓ Sidebar layout (main + webcam 30%)');
  console.log('  ✓ 3 chapter title cards (2 fullscreen + 1 overlay)');
  console.log('  ✓ Lower third (speaker name)');
  console.log('  ✓ 2 B-roll cutaways with transitions');
  console.log('  ✓ CTA pill button');
  console.log('  ✓ Karaoke captions');
  console.log('═'.repeat(50));
  console.log(`Output: ${outputPath}`);
  console.log(`Size: ${mb} MB | Render: ${sec}s`);
}

main().catch((err) => {
  console.error('Demo failed:', err.message ?? err);
  process.exit(1);
});
