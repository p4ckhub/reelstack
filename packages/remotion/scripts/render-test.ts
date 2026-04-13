/**
 * Test render script - renders a 5s split-screen reel with test assets.
 * Uses Remotion CLI (subprocess) which handles webpack bundling correctly.
 *
 * Usage: bun run render:test
 * Output: out/test-reel.mp4
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const OUTPUT_PATH = path.resolve(__dirname, '../out/test-reel.mp4');
const PROPS_PATH = path.resolve(__dirname, '../out/test-props.json');

// Filenames relative to public/ - resolved via staticFile() in components
const props = {
  layout: 'split-screen',
  primaryVideoUrl: 'talking-head.mp4',
  secondaryVideoUrl: 'screen-recording.mp4',
  bRollSegments: [
    {
      startTime: 2,
      endTime: 4,
      media: { url: 'broll.mp4', type: 'video' },
      animation: 'spring-scale',
      transition: { type: 'crossfade', durationMs: 400 },
    },
  ],
  cues: [
    { id: '1', text: 'To jest hook', startTime: 0, endTime: 1 },
    { id: '2', text: 'który przyciąga uwagę', startTime: 1, endTime: 2 },
    { id: '3', text: 'a tu B-roll cutaway', startTime: 2, endTime: 4 },
    { id: '4', text: 'z mocnym CTA', startTime: 4, endTime: 5 },
  ],
  musicVolume: 0,
  showProgressBar: true,
  backgroundColor: '#000000',
};

// Write props to temp file (avoids shell escaping issues)
fs.mkdirSync(path.dirname(PROPS_PATH), { recursive: true });
fs.writeFileSync(PROPS_PATH, JSON.stringify(props, null, 2));

console.log('Rendering test reel...');
console.log(`Props: ${PROPS_PATH}`);
console.log(`Output: ${OUTPUT_PATH}`);

try {
  execSync(`bunx remotion render Reel "${OUTPUT_PATH}" --props="${PROPS_PATH}"`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  console.log(`\nDone! Output: ${OUTPUT_PATH}`);

  // Print file info
  const stats = fs.statSync(OUTPUT_PATH);
  console.log(`Size: ${(stats.size / 1024).toFixed(1)} KB`);
} catch (err) {
  console.error('Render failed');
  process.exit(1);
} finally {
  // Clean up props file
  if (fs.existsSync(PROPS_PATH)) {
    fs.unlinkSync(PROPS_PATH);
  }
}
