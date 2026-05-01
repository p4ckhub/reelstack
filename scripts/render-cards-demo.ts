#!/usr/bin/env bun
/**
 * Cards demo renderer — assembles a single HF composition that plays
 * every registered HF card back-to-back (3 s each + 0.3 s gap), with a
 * title label per segment, and renders it to MP4 via the local
 * hyperframes CLI.
 *
 *   bun run scripts/render-cards-demo.ts
 *
 * Output: /tmp/cards-demo.mp4. Frames also extracted at the midpoint
 * of each card's window to /tmp/cards-demo-frames/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildHfCardBlock, listHfCardSlugs } from '@reelstack/agent';
// Side-effect import: registers all premium cards from the private overlay.
import '@reelstack/modules';
import type { CardPalette, CardData } from '@reelstack/agent';

const CARD_DURATION = 3.0;
const GAP = 0.3;
const FRAME_W = 1080;
const FRAME_H = 1920;

// Sample palette — purple-on-near-black, matches existing shimmer defaults.
const PALETTE: CardPalette = {
  slug: 'demo',
  accent: '#7c3aed',
  background: '#09090f',
  text: '#ffffff',
  textMuted: 'rgba(255,255,255,0.78)',
  glow: '#a78bfa',
};

// Per-slug data. Keep headlines short so they fit even in monospace cards.
const CARD_DATA: Record<string, CardData> = {
  shimmer: {
    headline: 'Shimmer',
    subheadline: 'Gradient mesh + spring + sweep',
    action: '↓ End-card outro',
  },
  glitch: { headline: 'Glitch' },
  typewriter: { headline: 'echo "typewriter"', subheadline: 'char-by-char terminal reveal' },
  burst: { headline: 'Burst' },
  liquid: { headline: 'Liquid' },
  flip: { headline: 'After', subheadline: 'reveal happened', label: 'BEFORE' },
  'glitch-blast': { headline: 'Blast', subheadline: 'chromatic shatter' },
  'slot-machine': { headline: 'Jackpot', subheadline: 'Reels lock in' },
  'split-reveal': { headline: 'Open', subheadline: 'Big reveal' },
  spotlight: { headline: 'Spotlight', subheadline: 'beam sweep' },
  'warp-speed': { headline: 'Warp', subheadline: 'hyperspace jump' },
  'retro-vhs': { headline: 'VHS', subheadline: '80s playback' },
  '3d-frame': { headline: '3D Frame', subheadline: 'rotating slab' },
  'subscribe-bell': { headline: 'SUBSCRIBE', subheadline: '+ notify bell' },
  portal: { headline: 'Portal', subheadline: 'open the gate' },
  'wave-text': { headline: 'WAVE', subheadline: 'letter ripple' },
  'chromatic-pulse': { headline: 'Pulse', subheadline: 'heartbeat' },
  'neon-sign': { headline: 'OPEN', subheadline: '24/7 vegas neon', action: 'visit.now' },
  'ink-splash': { headline: 'INK', subheadline: 'splash drop' },
  'stamp-slam': { headline: 'APPROVED', subheadline: 'sealed' },
  'neon-circuit': { headline: 'CIRCUIT', subheadline: 'electric trace' },
  'stat-card': { headline: '10×', subheadline: 'Faster delivery', action: 'RESULT' },
  hologram: { headline: 'HOLO', subheadline: 'projection live', action: 'engage' },
  'beat-pulse': { headline: 'BEAT', subheadline: 'reactive ring' },
  'quote-card': {
    headline: 'Code is the new clay.',
    subheadline: 'Linus T.',
    action: 'IN THEIR WORDS',
  },
  'countdown-punch': { headline: 'GO', subheadline: '3 2 1 launch', action: 'tap.it' },
  'emoji-burst': { headline: 'CELEBRATE', subheadline: 'milestone unlocked' },
};

function safeId(slug: string, i: number): string {
  return `card-${slug.replace(/[^a-zA-Z0-9]/g, '-')}-${i}`;
}

function main() {
  const slugs = listHfCardSlugs();
  const slotDuration = CARD_DURATION + GAP;
  const totalDuration = slugs.length * slotDuration;

  // Build one card block per slug at its slot. cardStart = i * slotDuration.
  // Each card's instanceId is unique so selectors don't collide.
  const cardBlocks: string[] = [];
  const labelBlocks: string[] = [];

  slugs.forEach((slug, i) => {
    const cardStart = i * slotDuration;
    const data = CARD_DATA[slug] ?? { headline: slug };
    const block = buildHfCardBlock({
      slug,
      cardStart,
      cardDuration: CARD_DURATION,
      totalDuration,
      mode: 'cutaway',
      palette: PALETTE,
      data,
      instanceId: safeId(slug, i),
    });
    cardBlocks.push(block);

    // Label at top — slug + index, fades in for the full slot.
    labelBlocks.push(
      `<div class="demo-label" id="demo-label-${i}" data-start="${cardStart}" data-duration="${CARD_DURATION}" data-track-index="40" style="position:absolute;top:48px;left:50%;transform:translateX(-50%);padding:12px 28px;font-family:'JetBrains Mono','Menlo',monospace;font-size:24px;font-weight:600;color:#ffffff;background:rgba(0,0,0,0.65);border:1px solid rgba(255,255,255,0.18);border-radius:999px;letter-spacing:0.06em;text-transform:uppercase;opacity:0;z-index:50;">${i + 1}/${slugs.length} · ${slug}</div>`
    );
  });

  // Master HTML with stage + cards + labels + main script that splices
  // every registered card-instance attach onto the stage timeline.
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${FRAME_W}, height=${FRAME_H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${FRAME_W}px; height: ${FRAME_H}px; overflow: hidden; background: #000; }
    </style>
  </head>
  <body>
    <div
      id="stage"
      data-composition-id="cards-demo"
      data-start="0"
      data-duration="${totalDuration.toFixed(3)}"
      data-width="${FRAME_W}"
      data-height="${FRAME_H}"
      style="position:relative;width:${FRAME_W}px;height:${FRAME_H}px;background:#000;"
    >
      ${cardBlocks.join('\n')}
      ${labelBlocks.join('\n')}
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });

      // Fade each label in/out around its slot.
      ${slugs
        .map((_, i) => {
          const start = i * slotDuration;
          return `tl.fromTo('#demo-label-${i}', { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power1.out' }, ${start.toFixed(3)});\ntl.to('#demo-label-${i}', { opacity: 0, duration: 0.2, ease: 'power1.in' }, ${(start + CARD_DURATION - 0.2).toFixed(3)});`;
        })
        .join('\n      ')}

      // Splice every registered card instance onto this timeline.
      Object.values(window.__hfAttachCardInstances || {}).forEach(function (fn) { fn(tl); });

      window.__timelines['cards-demo'] = tl;
    </script>
  </body>
</html>
`;

  const workDir = '/tmp/cards-demo';
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(path.join(workDir, 'index.html'), html);
  fs.writeFileSync(
    path.join(workDir, 'hyperframes.json'),
    JSON.stringify({ name: 'cards-demo', width: FRAME_W, height: FRAME_H, fps: 30 }, null, 2)
  );

  console.log(`Composition prepared: ${workDir}`);
  console.log(`  cards: ${slugs.length}`);
  console.log(`  total duration: ${totalDuration.toFixed(2)} s`);
  console.log(`  slugs: ${slugs.join(', ')}`);

  // Spawn hyperframes render.
  const outputPath = '/tmp/cards-demo.mp4';
  console.log(`\nRendering → ${outputPath} ...`);
  const child = spawn('bunx', ['hyperframes', 'render', workDir, '-o', outputPath, '--quiet'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Render exited ${code}`);
      process.exit(1);
    }
    const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`\n✓ Rendered ${outputPath} (${sizeMB} MB)`);

    // Frame snapshots — middle of each card window.
    const framesDir = '/tmp/cards-demo-frames';
    fs.rmSync(framesDir, { recursive: true, force: true });
    fs.mkdirSync(framesDir, { recursive: true });
    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i];
      const t = i * slotDuration + CARD_DURATION / 2;
      const ff = spawn('ffmpeg', [
        '-y',
        '-i',
        outputPath,
        '-ss',
        String(t),
        '-frames:v',
        '1',
        '-loglevel',
        'error',
        `${framesDir}/${String(i + 1).padStart(2, '0')}-${slug}.png`,
      ]);
      ff.on('exit', () => {});
    }
    console.log(`Frames extracted → ${framesDir}/`);
  });
}

main();
