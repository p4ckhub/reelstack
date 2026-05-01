/**
 * Per-mode default card slug + override resolution.
 *
 * `buildHfEndCardBlock` defaults to `shimmer`; callers can pass
 * `endCard.cardSlug` to pick any registered card. Orchestrators pass
 * `mode` so the resolver picks a mode-appropriate default
 * (presenter → neon-sign, talking-object → burst, etc.).
 *
 * This file exercises the public API. It registers a handful of
 * mock card builders so the resolver has something to look up — the
 * real card implementations live in the private modules overlay.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  resolveEndCardSlug,
  MODE_DEFAULT_CARD_SLUG,
  buildHfEndCardBlock,
  registerHfCard,
  listHfCardSlugs,
} from '../index';

const noopBuilder = () => ({ html: '', attachBody: '' });

const REQUIRED_SLUGS = [
  // Premium cards used as MODE_DEFAULT_CARD_SLUG values.
  'shimmer',
  'glitch',
  'neon-sign',
  'burst',
  'neon-circuit',
  'spotlight',
  'wave-text',
];

beforeAll(() => {
  for (const slug of REQUIRED_SLUGS) {
    registerHfCard(slug, noopBuilder);
  }
});

describe('resolveEndCardSlug', () => {
  it('explicit cardSlug from caller wins over mode default', () => {
    expect(resolveEndCardSlug('glitch', 'n8n-explainer')).toBe('glitch');
    expect(resolveEndCardSlug('neon-sign', 'slideshow')).toBe('neon-sign');
  });

  it('falls back to mode default when no cardSlug provided', () => {
    expect(resolveEndCardSlug(undefined, 'n8n-explainer')).toBe('shimmer');
    expect(resolveEndCardSlug(undefined, 'presenter-explainer')).toBe('neon-sign');
    expect(resolveEndCardSlug(undefined, 'talking-object')).toBe('burst');
    expect(resolveEndCardSlug(undefined, 'ai-tips')).toBe('neon-circuit');
  });

  it('falls back to shimmer when neither provided', () => {
    expect(resolveEndCardSlug(undefined, undefined)).toBe('shimmer');
  });

  it('falls back to shimmer when mode is unknown', () => {
    expect(resolveEndCardSlug(undefined, 'made-up-mode')).toBe('shimmer');
  });

  it('falls back to mode default when cardSlug is unknown (defensive)', () => {
    // Schema layer should reject unknown slugs upstream, but the
    // dispatcher itself stays safe — never crashes on a typo.
    expect(resolveEndCardSlug('nonexistent-card', 'n8n-explainer')).toBe('shimmer');
    expect(resolveEndCardSlug('nonexistent-card', 'presenter-explainer')).toBe('neon-sign');
  });
});

describe('MODE_DEFAULT_CARD_SLUG', () => {
  it('every default points to a registered card slug', () => {
    const registered = listHfCardSlugs();
    for (const [mode, slug] of Object.entries(MODE_DEFAULT_CARD_SLUG)) {
      expect(
        registered.includes(slug),
        `Mode "${mode}" defaults to "${slug}" which is not registered. Registered: ${registered.join(', ')}`
      ).toBe(true);
    }
  });

  it('covers every public reel mode', () => {
    // Documents the contract: if a new mode is added, MODE_DEFAULT_CARD_SLUG
    // SHOULD be updated. Missing modes silently fall back to shimmer
    // which is fine but means no curated visual for that mode.
    const expectedModes = [
      'n8n-explainer',
      'presenter-explainer',
      'talking-object',
      'ai-tips',
      'slideshow',
      'captions',
    ];
    for (const m of expectedModes) {
      expect(MODE_DEFAULT_CARD_SLUG[m], `Missing default for mode "${m}"`).toBeTruthy();
    }
  });
});

describe('buildHfEndCardBlock with cardSlug + mode', () => {
  const baseCard = { headline: 'Test', durationSeconds: 3, enabled: true };

  it('uses cardSlug when provided', () => {
    const html = buildHfEndCardBlock({ ...baseCard, cardSlug: 'glitch' }, 30);
    expect(html).toContain('hf-card--glitch');
    expect(html).not.toContain('hf-card--shimmer');
  });

  it('uses mode default when cardSlug omitted', () => {
    const html = buildHfEndCardBlock(baseCard, 30, 'presenter-explainer');
    expect(html).toContain('hf-card--neon-sign');
  });

  it('uses shimmer fallback when neither cardSlug nor known mode', () => {
    const html = buildHfEndCardBlock(baseCard, 30);
    expect(html).toContain('hf-card--shimmer');
  });

  it('returns empty string when endCard.enabled=false (regardless of slug)', () => {
    expect(
      buildHfEndCardBlock({ ...baseCard, enabled: false, cardSlug: 'glitch' }, 30, 'n8n-explainer')
    ).toBe('');
  });

  it('returns empty string when no headline (regardless of slug)', () => {
    expect(buildHfEndCardBlock({ enabled: true, cardSlug: 'glitch' }, 30, 'n8n-explainer')).toBe(
      ''
    );
  });
});
