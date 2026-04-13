import { describe, test, expect } from 'vitest';
import {
  buildTemplatePlan,
  getTemplate,
  listTemplates,
  registerTemplate,
} from '../content/template-montage';
import type { ContentPackage } from '../content/content-package';

function makeContentPackage(sectionCount: number, durationSeconds = 30): ContentPackage {
  const sectionDur = durationSeconds / sectionCount;
  const sections = Array.from({ length: sectionCount }, (_, i) => ({
    index: i,
    text: `Section ${i + 1} about topic ${i + 1}`,
    startTime: i * sectionDur,
    endTime: (i + 1) * sectionDur,
    assetId: `asset-${i + 1}`,
  }));
  const assets = sections.map((s) => ({
    id: s.assetId!,
    url: `https://example.com/img-${s.index + 1}.jpg`,
    type: 'image' as const,
    role: 'board' as const,
    description: `Board for section ${s.index + 1}`,
    sectionIndex: s.index,
  }));

  return {
    script: sections.map((s) => s.text).join('. '),
    voiceover: {
      url: 'https://example.com/voiceover.mp3',
      durationSeconds,
      source: 'tts',
    },
    cues: [],
    sections,
    assets,
    primaryVideo: {
      url: 'https://example.com/head.mp4',
      durationSeconds,
      source: 'user-recording',
      framing: 'bottom-aligned',
      loop: false,
    },
    metadata: { language: 'en' },
  };
}

describe('template-montage', () => {
  describe('registry', () => {
    test('built-in templates are registered', () => {
      expect(getTemplate('anchor-bottom-simple')).toBeDefined();
      expect(getTemplate('fullscreen-broll')).toBeDefined();
    });

    test('listTemplates returns all registered', () => {
      const templates = listTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(2);
      const ids = templates.map((t) => t.id);
      expect(ids).toContain('anchor-bottom-simple');
      expect(ids).toContain('fullscreen-broll');
    });

    test('unknown template throws', () => {
      const content = makeContentPackage(3);
      expect(() => buildTemplatePlan(content, 'nonexistent')).toThrow('Unknown template');
    });
  });

  describe('anchor-bottom-simple', () => {
    test('generates plan with correct layout', () => {
      const plan = buildTemplatePlan(makeContentPackage(5), 'anchor-bottom-simple');
      expect(plan.layout).toBe('anchor-bottom');
      expect(plan.shots.length).toBeGreaterThan(3);
    });

    test('head time is under 40% of total duration', () => {
      const plan = buildTemplatePlan(makeContentPackage(6, 30), 'anchor-bottom-simple');
      const totalDuration = 30;
      const headTime = plan.shots
        .filter((s) => s.shotLayout === 'head')
        .reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
      expect(headTime / totalDuration).toBeLessThan(0.4);
    });

    test('has content shots consuming assets', () => {
      const plan = buildTemplatePlan(makeContentPackage(5), 'anchor-bottom-simple');
      const contentShots = plan.shots.filter((s) => s.shotLayout === 'content');
      expect(contentShots.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('fullscreen-broll', () => {
    test('generates plan with fullscreen layout', () => {
      const plan = buildTemplatePlan(makeContentPackage(5), 'fullscreen-broll');
      expect(plan.layout).toBe('fullscreen');
    });

    test('alternates head and content shots', () => {
      const plan = buildTemplatePlan(makeContentPackage(6, 40), 'fullscreen-broll');
      const headShots = plan.shots.filter((s) => s.shotLayout === 'head');
      const contentShots = plan.shots.filter((s) => s.shotLayout === 'content');
      expect(headShots.length).toBeGreaterThan(0);
      expect(contentShots.length).toBeGreaterThan(0);
    });
  });

  describe('jump-cut-dynamic', () => {
    // Register inline (mirrors premium-templates.ts) so tests don't depend on private modules
    registerTemplate({
      id: 'jump-cut-dynamic',
      name: 'Jump Cut Dynamic (Jabłoński)',
      layout: 'fullscreen',
      shotPattern: [
        { type: 'head', durationStrategy: 'fixed', fixedDurationSeconds: 1.5 },
        { type: 'content', durationStrategy: 'fill-section', maxDurationSeconds: 3 },
        { type: 'head', durationStrategy: 'fixed', fixedDurationSeconds: 1.2 },
        { type: 'content', durationStrategy: 'fill-section', maxDurationSeconds: 3 },
        { type: 'head', durationStrategy: 'fixed', fixedDurationSeconds: 1.5 },
        { type: 'content', durationStrategy: 'fill-section', maxDurationSeconds: 3.5 },
        { type: 'head', durationStrategy: 'fixed', fixedDurationSeconds: 1.2 },
        { type: 'content', durationStrategy: 'fill-section', maxDurationSeconds: 3 },
      ],
      transition: 'varied',
      transitionDurationMs: 200,
      highlightMode: 'hormozi',
      maxCtaSeconds: 2.5,
      hook: { type: 'head', minDuration: 1.5, maxDuration: 2.5 },
      zoom: { enabled: true, pattern: 'all', scale: 1.12, focusPoint: { x: 50, y: 40 } },
      captionStyleOverrides: { highlightColor: '#FFD700', fontSize: 54 },
      effectsConfig: { hookTextEmphasis: true, subscribeBanner: true },
      sfxMode: 'auto',
      scrollStopper: { preset: 'zoom-bounce', durationSeconds: 0.5 },
    });

    test('generates fullscreen layout plan', () => {
      const plan = buildTemplatePlan(makeContentPackage(6, 28), 'jump-cut-dynamic');
      expect(plan.layout).toBe('fullscreen');
    });

    test('rapid alternation: many short head shots', () => {
      const plan = buildTemplatePlan(makeContentPackage(6, 28), 'jump-cut-dynamic');
      const headShots = plan.shots.filter((s) => s.shotLayout === 'head');
      // At least 3 head shots for a 28s reel (hook + transitions + CTA)
      expect(headShots.length).toBeGreaterThanOrEqual(3);
      // All head shots should be short (< 2.5s)
      for (const h of headShots) {
        expect(h.endTime - h.startTime).toBeLessThanOrEqual(2.5);
      }
    });

    test('no content shot exceeds 3.5s', () => {
      const plan = buildTemplatePlan(makeContentPackage(6, 28), 'jump-cut-dynamic');
      const contentShots = plan.shots.filter((s) => s.shotLayout === 'content');
      for (const c of contentShots) {
        expect(c.endTime - c.startTime).toBeLessThanOrEqual(4); // 3.5 + tolerance
      }
    });

    test('zoom segments on all head shots except first', () => {
      const plan = buildTemplatePlan(makeContentPackage(6, 28), 'jump-cut-dynamic');
      const headShots = plan.shots.filter((s) => s.shotLayout === 'head');
      // pattern: 'all' skips 1st head, zooms rest
      expect(plan.zoomSegments.length).toBe(headShots.length - 1);
      for (const z of plan.zoomSegments) {
        expect(z.scale).toBeGreaterThanOrEqual(1.07); // 1.12 or 1.12*0.96
        expect(z.scale).toBeLessThanOrEqual(1.15);
      }
    });

    test('has hook text emphasis effect', () => {
      const plan = buildTemplatePlan(makeContentPackage(6, 28), 'jump-cut-dynamic');
      const emphasis = plan.effects.filter((e) => e.type === 'text-emphasis');
      expect(emphasis.length).toBe(1);
      expect(emphasis[0].startTime).toBe(0);
    });

    test('caption style has gold highlighting', () => {
      const plan = buildTemplatePlan(makeContentPackage(6, 28), 'jump-cut-dynamic');
      expect(plan.captionStyle).toMatchObject({
        highlightMode: 'hormozi',
        highlightColor: '#FFD700',
      });
    });

    test('scroll stopper is zoom-bounce', () => {
      const plan = buildTemplatePlan(makeContentPackage(6, 28), 'jump-cut-dynamic');
      expect(plan.scrollStopper).toMatchObject({ preset: 'zoom-bounce' });
    });

    test('auto SFX generated', () => {
      const plan = buildTemplatePlan(makeContentPackage(6, 28), 'jump-cut-dynamic');
      expect(plan.sfxSegments!.length).toBeGreaterThan(0);
    });

    test('no PiP segments (presenter is fullscreen)', () => {
      const plan = buildTemplatePlan(makeContentPackage(6, 28), 'jump-cut-dynamic');
      expect(plan.pipSegments?.length ?? 0).toBe(0);
    });
  });

  describe('plan structure', () => {
    test('shots cover entire duration without gaps', () => {
      const duration = 30;
      const plan = buildTemplatePlan(makeContentPackage(5, duration), 'anchor-bottom-simple');
      expect(plan.shots[0].startTime).toBeLessThanOrEqual(2.5);
      const lastShot = plan.shots[plan.shots.length - 1];
      expect(lastShot.endTime).toBe(duration);
    });

    test('no overlapping shots', () => {
      const plan = buildTemplatePlan(makeContentPackage(6, 30), 'anchor-bottom-simple');
      for (let i = 1; i < plan.shots.length; i++) {
        expect(plan.shots[i].startTime).toBeGreaterThanOrEqual(plan.shots[i - 1].endTime - 0.01);
      }
    });

    test('zoom segments are generated for head shots', () => {
      const plan = buildTemplatePlan(makeContentPackage(5), 'anchor-bottom-simple');
      expect(plan.zoomSegments.length).toBeGreaterThan(0);
    });

    test('subscribe banner effect is generated for long reels', () => {
      const plan = buildTemplatePlan(makeContentPackage(5, 25), 'anchor-bottom-simple');
      const banners = plan.effects.filter((e) => e.type === 'subscribe-banner');
      expect(banners.length).toBe(1);
    });

    test('auto SFX are generated by default', () => {
      const plan = buildTemplatePlan(makeContentPackage(5, 25), 'anchor-bottom-simple');
      expect(plan.sfxSegments!.length).toBeGreaterThan(0);
    });
  });
});
