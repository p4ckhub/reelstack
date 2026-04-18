/**
 * Watermark enforcement guard — Fix 3 (auto-wrap via HOC in Root.tsx).
 *
 * Every `<Composition>` registered in `Root.tsx` MUST pass its component
 * through the `withWatermark` HOC. The HOC auto-injects the overlay, so
 * forgetting to do it means some compositions skip the watermark layer
 * entirely — silent security hole when the flag is flipped back on.
 *
 * This is a source-level grep, not a runtime check: it fails at PR time,
 * not in production.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT_TSX = path.resolve(__dirname, '..', 'compositions', 'Root.tsx');
const HOC_TSX = path.resolve(__dirname, '..', 'compositions', 'with-watermark.tsx');

describe('Watermark enforcement — Root.tsx auto-wraps every composition', () => {
  const src = fs.readFileSync(ROOT_TSX, 'utf8');

  it('imports the withWatermark HOC', () => {
    expect(src).toMatch(/import .*withWatermark.* from ['"]\.\/with-watermark['"]/);
  });

  it('wraps every <Composition component={…} /> through withWatermark(...)', () => {
    const componentPropMatches = [...src.matchAll(/component=\{([^}]+)\}/g)];
    expect(componentPropMatches.length).toBeGreaterThan(0);

    for (const match of componentPropMatches) {
      const value = match[1].trim();
      if (!value.startsWith('withWatermark(')) {
        throw new Error(
          `Root.tsx has a <Composition component={${value}} /> that is not wrapped in withWatermark(). ` +
            `Every composition must go through the HOC so the FREE-tier watermark cannot be forgotten.`
        );
      }
    }
  });

  it('HOC file exists and exports withWatermark', () => {
    const hocSrc = fs.readFileSync(HOC_TSX, 'utf8');
    expect(hocSrc).toMatch(/export function withWatermark/);
  });
});
