/**
 * Watermark enforcement guard.
 *
 * Every public composition file MUST import `WithWatermarkOverlay` and
 * render it at least once. When the SaaS pricing model is validated and
 * the watermark flag flips back to `enabled=true`, every reel mode has
 * to carry the badge — otherwise FREE users get clean output for free.
 *
 * This is a source-level test, not a runtime check: it greps compositions
 * for the required symbol. Catches "I added a new composition and forgot
 * to wire the watermark" at PR-time, not in production.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const COMPOSITION_ROOTS = [
  // Public compositions shipped with the core repo
  path.resolve(__dirname, '..', 'compositions'),
];

// Files that are explicitly exempt — e.g. helper modules or compositions
// that render NO visual output (pure audio test, etc.). Add with reason.
const EXEMPT_FILES = new Set<string>([
  'Root.tsx', // registers compositions, doesn't render one itself
  'VideoClipComposition.tsx', // private/ai-tips composition has its own copy wired up elsewhere
  'YouTubeLongFormComposition.tsx', // long-form YouTube, does not support FREE tier flow yet
]);

function listCompositionFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((f) => f.endsWith('Composition.tsx') || f.endsWith('Root.tsx'))
    .filter((f) => !EXEMPT_FILES.has(f))
    .map((f) => path.join(root, f));
}

describe('Watermark enforcement — compositions must render WithWatermarkOverlay', () => {
  const files = COMPOSITION_ROOTS.flatMap(listCompositionFiles);

  it('finds at least one composition to check (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const name = path.basename(file);
    it(`${name} imports WithWatermarkOverlay`, () => {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).toMatch(/from ['"][^'"]*WithWatermarkOverlay['"]/);
    });
    it(`${name} renders <WithWatermarkOverlay />`, () => {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).toMatch(/<WithWatermarkOverlay\s/);
    });
  }
});
