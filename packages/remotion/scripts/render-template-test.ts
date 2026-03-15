/**
 * Test render for template montage fixes.
 *
 * Creates a mock ContentPackage with public assets, runs buildTemplatePlan() +
 * assembleComposition(), then renders locally via Remotion CLI.
 *
 * Tests: split shots, zoom on presenter, no hook text-emphasis,
 *        objectFit:contain for splits, caption highlight mode.
 *
 * Usage: bun run packages/remotion/scripts/render-template-test.ts
 * Output: packages/remotion/out/template-test.mp4
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { buildTemplatePlan } from '../../agent/src/content/template-montage';
import { assembleComposition } from '../../agent/src/orchestrator/composition-assembler';
import type { ContentPackage } from '../../agent/src/content/content-package';

const OUTPUT_PATH = path.resolve(__dirname, '../out/template-test.mp4');
const PROPS_PATH = path.resolve(__dirname, '../out/template-test-props.json');
const PUBLIC_DIR = path.resolve(__dirname, '../public');

/** Resolve a public asset filename to absolute path (needed for assembler URL validation) */
const pub = (name: string) => path.join(PUBLIC_DIR, name);

// ── Mock ContentPackage ─────────────────────────────────────────────────────
// Simulates a 15s presenter reel with 6 sections and board assets.
// Uses public/ assets as boards (images/videos).

const DURATION = 15;

const mockContent: ContentPackage = {
  script:
    'Docker to najlepszy sposób na konteneryzację. ' +
    'Zacznijmy od instalacji na Linuxie. ' +
    'Tworzymy pierwszy Dockerfile. ' +
    'Build i push do registry. ' +
    'Docker Compose do wielu kontenerów. ' +
    'Obserwuj po więcej tipów!',
  voiceover: {
    url: 'voiceover-02b41deb.mp3', // existing public asset
    durationSeconds: DURATION,
    source: 'tts',
  },
  cues: [
    {
      id: '1',
      text: 'Docker to najlepszy',
      startTime: 0,
      endTime: 1.5,
      words: [
        { text: 'Docker', startTime: 0, endTime: 0.4 },
        { text: 'to', startTime: 0.4, endTime: 0.6 },
        { text: 'najlepszy', startTime: 0.6, endTime: 1.5 },
      ],
    },
    {
      id: '2',
      text: 'sposób na konteneryzację',
      startTime: 1.5,
      endTime: 3,
      words: [
        { text: 'sposób', startTime: 1.5, endTime: 1.9 },
        { text: 'na', startTime: 1.9, endTime: 2.1 },
        { text: 'konteneryzację', startTime: 2.1, endTime: 3 },
      ],
    },
    { id: '3', text: 'Zacznijmy od instalacji', startTime: 3, endTime: 5 },
    { id: '4', text: 'Tworzymy pierwszy Dockerfile', startTime: 5, endTime: 7 },
    { id: '5', text: 'Build i push do registry', startTime: 7, endTime: 9 },
    { id: '6', text: 'Docker Compose do wielu', startTime: 9, endTime: 11.5 },
    { id: '7', text: 'kontenerów', startTime: 11.5, endTime: 12.5 },
    { id: '8', text: 'Obserwuj po więcej tipów', startTime: 12.5, endTime: DURATION },
  ],
  sections: [
    {
      index: 0,
      text: 'Zacznijmy od instalacji na Linuxie',
      startTime: 2.5,
      endTime: 5,
      assetId: 'board-0',
    },
    {
      index: 1,
      text: 'Tworzymy pierwszy Dockerfile',
      startTime: 5,
      endTime: 7,
      assetId: 'board-1',
    },
    { index: 2, text: 'Build i push do registry', startTime: 7, endTime: 9, assetId: 'board-2' },
    {
      index: 3,
      text: 'Docker Compose do wielu kontenerów',
      startTime: 9,
      endTime: 11.5,
      assetId: 'board-3',
    },
    {
      index: 4,
      text: 'Obserwuj po więcej tipów',
      startTime: 11.5,
      endTime: 13,
      assetId: 'board-4',
    },
  ],
  assets: [
    {
      id: 'board-0',
      url: pub('board-1.png'),
      type: 'image',
      role: 'board',
      description: 'Linux terminal',
      sectionIndex: 0,
    },
    {
      id: 'board-1',
      url: pub('board-2.png'),
      type: 'image',
      role: 'board',
      description: 'Dockerfile',
      sectionIndex: 1,
    },
    {
      id: 'board-2',
      url: pub('board-3.png'),
      type: 'image',
      role: 'board',
      description: 'Docker push',
      sectionIndex: 2,
    },
    {
      id: 'board-3',
      url: pub('board-4.png'),
      type: 'image',
      role: 'board',
      description: 'Compose YAML',
      sectionIndex: 3,
    },
    {
      id: 'board-4',
      url: pub('board-5.png'),
      type: 'image',
      role: 'board',
      description: 'Dashboard',
      sectionIndex: 4,
    },
  ],
  primaryVideo: {
    url: pub('presenter-loop.mp4'),
    durationSeconds: 8,
    framing: 'bottom-aligned',
    loop: true,
    source: 'ai-avatar-loop',
  },
  metadata: {
    language: 'pl',
    style: 'dynamic',
  },
};

// ── Build plan ──────────────────────────────────────────────────────────────

const templateId = 'hybrid-dynamic';
console.log(`\n=== Building template plan: ${templateId} ===\n`);
const plan = buildTemplatePlan(mockContent, templateId);

// ── Verify fixes ────────────────────────────────────────────────────────────

console.log('Plan summary:');
console.log(`  Layout: ${plan.layout}`);
console.log(`  Shots: ${plan.shots.length}`);
console.log(`  Effects: ${plan.effects.length}`);
console.log(`  Zooms: ${plan.zoomSegments.length}`);
console.log(`  CaptionStyle: ${JSON.stringify(plan.captionStyle)}`);
console.log('');

// Fix 1: Verify split shots exist
const splitShots = plan.shots.filter((s) => s.shotLayout === 'split');
const contentShots = plan.shots.filter((s) => s.shotLayout === 'content');
const headShots = plan.shots.filter((s) => s.shotLayout === 'head');
console.log(
  `Shot types: ${headShots.length} head, ${splitShots.length} split, ${contentShots.length} content`
);
if (splitShots.length === 0) {
  console.error('❌ FIX 1 FAILED: No split shots!');
} else {
  console.log(`✅ FIX 1: ${splitShots.length} split shots`);
}

// Fix 2: No hook text-emphasis
const hookEmphasis = plan.effects.filter((e) => e.type === 'text-emphasis');
if (hookEmphasis.length > 0) {
  console.error('❌ FIX 2 FAILED: Hook text-emphasis still present!');
} else {
  console.log('✅ FIX 2: No hook text-emphasis (no caption duplication)');
}

// Fix 4: Zoom on presenter head shots
if (plan.zoomSegments.length === 0) {
  console.error('❌ FIX 4 FAILED: No zoom segments!');
} else {
  console.log(`✅ FIX 4: ${plan.zoomSegments.length} zoom segments on head shots`);
}

// Fix 6: Caption highlight mode
if (plan.captionStyle && (plan.captionStyle as Record<string, unknown>).highlightMode === 'text') {
  console.log(
    `✅ FIX 6: captionStyle.highlightMode = 'text', highlightColor = ${(plan.captionStyle as Record<string, unknown>).highlightColor}`
  );
} else {
  console.error('❌ FIX 6 FAILED: No highlightMode in captionStyle!');
}

console.log('\nShot timeline:');
for (const shot of plan.shots) {
  const vis =
    shot.visual.type === 'primary'
      ? 'presenter'
      : `b-roll(${(shot.visual as Record<string, unknown>).searchQuery})`;
  console.log(
    `  ${shot.id}: ${shot.startTime.toFixed(1)}s-${shot.endTime.toFixed(1)}s [${shot.shotLayout}] ${vis} — ${shot.reason}`
  );
}

// ── Assemble composition ────────────────────────────────────────────────────

console.log('\n=== Assembling composition ===\n');

const assets = plan.shots
  .filter((s) => s.visual.type !== 'primary')
  .map((shot) => {
    const sq = (shot.visual as Record<string, unknown>).searchQuery as string;
    const contentAsset = mockContent.assets.find((a) => a.id === sq);
    return {
      toolId: 'user-upload',
      shotId: shot.id,
      url: contentAsset?.url ?? '',
      type: (contentAsset?.type === 'video' ? 'stock-video' : 'stock-image') as
        | 'stock-video'
        | 'stock-image',
      durationSeconds: contentAsset?.durationSeconds,
    };
  })
  .filter((a) => a.url);

const assembled = assembleComposition({
  plan,
  assets,
  cues: mockContent.cues.map((c) => ({
    id: c.id,
    text: c.text,
    startTime: c.startTime,
    endTime: c.endTime,
    words: c.words ? [...c.words.map((w) => ({ ...w }))] : undefined,
  })),
  voiceoverFilename: mockContent.voiceover.url,
  primaryVideoDurationSeconds: mockContent.primaryVideo?.loop
    ? mockContent.primaryVideo.durationSeconds
    : undefined,
  primaryVideoObjectPosition: 'center 85%',
});

// Fix 5: Verify objectFit on split segments
const splitSegments = assembled.bRollSegments.filter(
  (s: Record<string, unknown>) => s.shotLayout === 'split'
);
const containSegments = splitSegments.filter(
  (s: Record<string, unknown>) => s.objectFit === 'contain'
);
if (splitSegments.length > 0 && containSegments.length === splitSegments.length) {
  console.log(`✅ FIX 5: All ${containSegments.length} split segments have objectFit=contain`);
} else if (splitSegments.length === 0) {
  console.error('❌ FIX 5: No split segments in assembled props!');
} else {
  console.error(
    `❌ FIX 5: ${containSegments.length}/${splitSegments.length} split segments have objectFit=contain`
  );
}

console.log(`\nAssembled props:`);
console.log(`  Layout: ${assembled.layout}`);
console.log(`  B-roll segments: ${assembled.bRollSegments.length}`);
console.log(`  Zoom segments: ${assembled.zoomSegments.length}`);
console.log(`  Primary video: ${assembled.primaryVideoUrl}`);
console.log(`  Primary loop: ${assembled.primaryVideoDurationSeconds}s`);
console.log(`  Caption highlightMode: ${assembled.captionStyle?.highlightMode}`);
console.log(`  Caption highlightColor: ${assembled.captionStyle?.highlightColor}`);

for (const seg of assembled.bRollSegments) {
  const s = seg as Record<string, unknown>;
  console.log(
    `  B-roll: ${(seg.startTime as number).toFixed(1)}s-${(seg.endTime as number).toFixed(1)}s [${s.shotLayout}] objectFit=${s.objectFit ?? 'cover'} media=${(seg.media as Record<string, unknown>).type}:${((seg.media as Record<string, unknown>).url as string).substring(0, 40)}`
  );
}

// ── Render ──────────────────────────────────────────────────────────────────

console.log('\n=== Rendering via Remotion CLI ===\n');

fs.mkdirSync(path.dirname(PROPS_PATH), { recursive: true });
fs.writeFileSync(PROPS_PATH, JSON.stringify(assembled, null, 2));

console.log(`Props written: ${PROPS_PATH}`);
console.log(`Output: ${OUTPUT_PATH}`);

try {
  execSync(`bunx remotion render Reel "${OUTPUT_PATH}" --props="${PROPS_PATH}"`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  console.log(`\n✅ Render complete: ${OUTPUT_PATH}`);
  const stats = fs.statSync(OUTPUT_PATH);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
} catch (err) {
  console.error('❌ Render failed');
  process.exit(1);
} finally {
  // Keep props for inspection
  console.log(`Props kept at: ${PROPS_PATH}`);
}
