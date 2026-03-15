import { describe, it, expect } from 'vitest';
import { assembleComposition } from '../orchestrator/composition-assembler';
import type { ProductionPlan, GeneratedAsset, ShotPlan, EffectPlan } from '../types';

/**
 * Integration tests for the full pipeline flow:
 * Plan → Generated Assets → Composition Assembly → Final ReelProps
 *
 * Verifies that generated asset URLs actually end up in the final
 * bRollSegments that Remotion renders. This catches the bug where
 * piapi generated videos but they were never used in the reel.
 */

function makePlan(overrides: Partial<ProductionPlan> = {}): ProductionPlan {
  return {
    primarySource: { type: 'none' },
    shots: [],
    effects: [],
    zoomSegments: [],
    lowerThirds: [],
    counters: [],
    highlights: [],
    ctaSegments: [],
    layout: 'fullscreen',
    reasoning: 'test',
    ...overrides,
  };
}

function makeShot(id: string, visual: ShotPlan['visual'], startTime = 0, endTime = 5): ShotPlan {
  return {
    id,
    startTime,
    endTime,
    scriptSegment: `Script for ${id}`,
    visual,
    transition: { type: 'crossfade', durationMs: 400 },
    reason: `Reason for ${id}`,
  };
}

function makeAsset(shotId: string, url: string, type: GeneratedAsset['type'] = 'ai-video'): GeneratedAsset {
  return { toolId: 'seedance2-piapi', shotId, url, type };
}

describe('Pipeline: Plan → Assets → Composition', () => {
  describe('Shot-to-asset matching by shotId', () => {
    it('generated asset URLs appear in bRollSegments when shotIds match', () => {
      const plan = makePlan({
        shots: [
          makeShot('shot-1', { type: 'ai-video', prompt: 'terminal', toolId: 'seedance2-piapi' }, 0, 5),
          makeShot('shot-2', { type: 'ai-video', prompt: 'cloud', toolId: 'seedance2-piapi' }, 5, 10),
          makeShot('shot-3', { type: 'ai-image', prompt: 'freedom', toolId: 'nanobanana2-kie' }, 10, 15),
        ],
      });

      const assets: GeneratedAsset[] = [
        makeAsset('shot-1', 'https://cdn.piapi.ai/video1.mp4'),
        makeAsset('shot-2', 'https://cdn.piapi.ai/video2.mp4'),
        makeAsset('shot-3', 'https://cdn.kie.ai/image3.png', 'ai-image'),
      ];

      const result = assembleComposition({ plan, assets, cues: [] });

      expect(result.bRollSegments).toHaveLength(3);
      expect(result.bRollSegments[0].media.url).toBe('https://cdn.piapi.ai/video1.mp4');
      expect(result.bRollSegments[0].media.type).toBe('video');
      expect(result.bRollSegments[0].startTime).toBe(0);

      expect(result.bRollSegments[1].media.url).toBe('https://cdn.piapi.ai/video2.mp4');
      expect(result.bRollSegments[1].media.type).toBe('video');

      expect(result.bRollSegments[2].media.url).toBe('https://cdn.kie.ai/image3.png');
      expect(result.bRollSegments[2].media.type).toBe('image');
    });

    it('missing asset for a shot results in gray placeholder', () => {
      const plan = makePlan({
        shots: [
          makeShot('shot-1', { type: 'ai-video', prompt: 'test', toolId: 'seedance2-piapi' }, 0, 5),
          makeShot('shot-2', { type: 'ai-video', prompt: 'test', toolId: 'seedance2-piapi' }, 5, 10),
        ],
      });

      // Only shot-1 has an asset, shot-2 is missing (e.g. generation failed)
      const assets: GeneratedAsset[] = [
        makeAsset('shot-1', 'https://cdn.piapi.ai/video1.mp4'),
      ];

      const result = assembleComposition({ plan, assets, cues: [] });

      expect(result.bRollSegments).toHaveLength(2);
      expect(result.bRollSegments[0].media.url).toBe('https://cdn.piapi.ai/video1.mp4');
      expect(result.bRollSegments[1].media.url).toBe('#333333'); // placeholder
      expect(result.bRollSegments[1].media.type).toBe('color');
    });

    it('wrong shotId means asset is lost - appears as placeholder', () => {
      const plan = makePlan({
        shots: [
          makeShot('shot-1', { type: 'ai-video', prompt: 'test', toolId: 'seedance2-piapi' }, 0, 5),
        ],
      });

      // Asset was generated but with wrong shotId (e.g. "shot_1" instead of "shot-1")
      const assets: GeneratedAsset[] = [
        makeAsset('shot_1', 'https://cdn.piapi.ai/video1.mp4'), // underscore vs dash!
      ];

      const result = assembleComposition({ plan, assets, cues: [] });

      expect(result.bRollSegments).toHaveLength(1);
      expect(result.bRollSegments[0].media.url).toBe('#333333'); // LOST! $0.75 wasted
    });
  });

  describe('Primary source matching', () => {
    it('primary source "none" means no primaryVideoUrl', () => {
      const plan = makePlan({ primarySource: { type: 'none' } });
      const result = assembleComposition({ plan, assets: [], cues: [] });
      expect(result.primaryVideoUrl).toBeUndefined();
    });

    it('user-recording sets primaryVideoUrl directly from plan', () => {
      const plan = makePlan({
        primarySource: { type: 'user-recording', url: 'https://storage.example.com/recording.mp4' },
      });
      const result = assembleComposition({ plan, assets: [], cues: [] });
      expect(result.primaryVideoUrl).toBe('https://storage.example.com/recording.mp4');
    });

    it('avatar primary finds asset WITHOUT shotId', () => {
      const plan = makePlan({
        primarySource: { type: 'avatar', toolId: 'heygen', script: 'Hello world' },
      });
      // Primary asset has no shotId (this is the convention)
      const assets: GeneratedAsset[] = [
        { toolId: 'heygen', url: 'https://heygen.com/avatar.mp4', type: 'avatar-video' },
      ];
      const result = assembleComposition({ plan, assets, cues: [] });
      expect(result.primaryVideoUrl).toBe('https://heygen.com/avatar.mp4');
    });

    it('avatar primary asset missing = undefined primaryVideoUrl', () => {
      const plan = makePlan({
        primarySource: { type: 'avatar', toolId: 'heygen', script: 'Hello world' },
      });
      // No assets generated (e.g. HeyGen failed)
      const result = assembleComposition({ plan, assets: [], cues: [] });
      expect(result.primaryVideoUrl).toBeUndefined();
    });
  });

  describe('URL validation in assembler', () => {
    it('http URLs are accepted', () => {
      const plan = makePlan({
        shots: [makeShot('shot-1', { type: 'ai-video', prompt: 'test', toolId: 't' }, 0, 5)],
      });
      const assets = [makeAsset('shot-1', 'http://cdn.example.com/video.mp4')];
      const result = assembleComposition({ plan, assets, cues: [] });
      expect(result.bRollSegments[0].media.url).toBe('http://cdn.example.com/video.mp4');
    });

    it('https URLs are accepted', () => {
      const plan = makePlan({
        shots: [makeShot('shot-1', { type: 'ai-video', prompt: 'test', toolId: 't' }, 0, 5)],
      });
      const assets = [makeAsset('shot-1', 'https://cdn.example.com/video.mp4')];
      const result = assembleComposition({ plan, assets, cues: [] });
      expect(result.bRollSegments[0].media.url).toBe('https://cdn.example.com/video.mp4');
    });

    it('local file paths (starting with /) are accepted', () => {
      const plan = makePlan({
        shots: [makeShot('shot-1', { type: 'ai-video', prompt: 'test', toolId: 't' }, 0, 5)],
      });
      const assets = [makeAsset('shot-1', '/tmp/generated-video.mp4')];
      const result = assembleComposition({ plan, assets, cues: [] });
      expect(result.bRollSegments[0].media.url).toBe('/tmp/generated-video.mp4');
    });

    it('invalid URL scheme falls back to placeholder', () => {
      const plan = makePlan({
        shots: [makeShot('shot-1', { type: 'ai-video', prompt: 'test', toolId: 't' }, 0, 5)],
      });
      const assets = [makeAsset('shot-1', 'ftp://invalid.com/video.mp4')];
      const result = assembleComposition({ plan, assets, cues: [] });
      expect(result.bRollSegments[0].media.url).toBe('#333333');
    });

    it('relative path falls back to placeholder', () => {
      const plan = makePlan({
        shots: [makeShot('shot-1', { type: 'ai-video', prompt: 'test', toolId: 't' }, 0, 5)],
      });
      const assets = [makeAsset('shot-1', '../output/video.mp4')];
      const result = assembleComposition({ plan, assets, cues: [] });
      expect(result.bRollSegments[0].media.url).toBe('#333333');
    });
  });

  describe('Primary shots are not B-roll', () => {
    it('shots with type "primary" do not appear in bRollSegments', () => {
      const plan = makePlan({
        primarySource: { type: 'user-recording', url: 'https://recording.mp4' },
        shots: [
          makeShot('shot-1', { type: 'primary' }, 0, 5),
          makeShot('shot-2', { type: 'ai-video', prompt: 'test', toolId: 't' }, 5, 10),
          makeShot('shot-3', { type: 'primary' }, 10, 15),
        ],
      });
      const assets = [makeAsset('shot-2', 'https://cdn.example.com/video.mp4')];
      const result = assembleComposition({ plan, assets, cues: [] });

      // Only shot-2 (non-primary) should be in bRollSegments
      expect(result.bRollSegments).toHaveLength(1);
      expect(result.bRollSegments[0].media.url).toBe('https://cdn.example.com/video.mp4');
    });
  });

  describe('Text cards need no generated assets', () => {
    it('text-card shots render without any asset', () => {
      const plan = makePlan({
        shots: [
          makeShot('shot-1', { type: 'text-card', headline: '73% savings', background: '#1a1a2e' }, 0, 5),
        ],
      });
      const result = assembleComposition({ plan, assets: [], cues: [] });

      expect(result.bRollSegments).toHaveLength(1);
      expect(result.bRollSegments[0].media.type).toBe('text-card');
      expect(result.bRollSegments[0].media.textCard?.headline).toBe('73% savings');
    });
  });

  describe('Full realistic scenario: 6 shots like production', () => {
    it('reproduces the exact production scenario from logs', () => {
      // This mirrors the real production run:
      // - 6 ai-video shots planned for seedance2-piapi
      // - enforceToolPreferences() rewrote tool IDs
      // - All 6 generated successfully via seedance-kie (fallback)
      const plan = makePlan({
        primarySource: { type: 'none' },
        shots: [
          makeShot('shot-1', { type: 'ai-video', prompt: 'dark terminal with green code', toolId: 'seedance2-piapi' }, 0, 3.5),
          makeShot('shot-2', { type: 'ai-video', prompt: 'cloud servers', toolId: 'seedance2-piapi' }, 3.5, 7),
          makeShot('shot-3', { type: 'ai-video', prompt: 'person typing', toolId: 'seedance2-piapi' }, 7, 10.5),
          makeShot('shot-4', { type: 'ai-video', prompt: 'server rack ownership', toolId: 'seedance2-piapi' }, 10.5, 14),
          makeShot('shot-5', { type: 'ai-video', prompt: 'destroying bills', toolId: 'seedance2-piapi' }, 14, 17),
          makeShot('shot-6', { type: 'ai-video', prompt: 'open sky freedom', toolId: 'seedance2-piapi' }, 17, 20),
        ],
        effects: [
          { type: 'text-emphasis', startTime: 0, endTime: 1.5, config: { text: 'HOOK' }, reason: 'hook' },
          { type: 'screen-shake', startTime: 3.5, endTime: 4, config: { intensity: 5 }, reason: 'impact' },
        ],
        zoomSegments: [
          { startTime: 0, endTime: 2, scale: 1.3, focusPoint: { x: 50, y: 50 }, easing: 'spring' as const },
          { startTime: 7, endTime: 9, scale: 1.5, focusPoint: { x: 50, y: 40 }, easing: 'spring' as const },
        ],
      });

      // All 6 assets generated via seedance-kie (after piapi fallback)
      const assets: GeneratedAsset[] = [
        makeAsset('shot-1', 'https://cdn.kie.ai/videos/abc1.mp4'),
        makeAsset('shot-2', 'https://cdn.kie.ai/videos/abc2.mp4'),
        makeAsset('shot-3', 'https://cdn.kie.ai/videos/abc3.mp4'),
        makeAsset('shot-4', 'https://cdn.kie.ai/videos/abc4.mp4'),
        makeAsset('shot-5', 'https://cdn.kie.ai/videos/abc5.mp4'),
        makeAsset('shot-6', 'https://cdn.kie.ai/videos/abc6.mp4'),
      ];

      const cues = [
        { id: 'cue-1', text: 'Jak przestać płacić za chmurę', startTime: 0, endTime: 3.5 },
        { id: 'cue-2', text: 'i zacząć mieć własny serwer', startTime: 3.5, endTime: 7 },
      ];

      const result = assembleComposition({ plan, assets, cues });

      // === CORE VERIFICATION ===

      // All 6 shots should be in bRollSegments with real URLs (not placeholders)
      expect(result.bRollSegments).toHaveLength(6);
      for (let i = 0; i < 6; i++) {
        expect(result.bRollSegments[i].media.url).toBe(`https://cdn.kie.ai/videos/abc${i + 1}.mp4`);
        expect(result.bRollSegments[i].media.type).toBe('video');
        expect(result.bRollSegments[i].media.url).not.toBe('#333333'); // NOT a placeholder
      }

      // Timing preserved
      expect(result.bRollSegments[0].startTime).toBe(0);
      expect(result.bRollSegments[0].endTime).toBe(3.5);
      expect(result.bRollSegments[5].startTime).toBe(17);
      expect(result.bRollSegments[5].endTime).toBe(20);

      // Effects mapped correctly
      expect(result.effects).toHaveLength(2);
      expect(result.effects[0].type).toBe('text-emphasis');
      expect(result.effects[1].type).toBe('screen-shake');

      // Zoom segments mapped
      expect(result.zoomSegments).toHaveLength(2);
      expect((result.zoomSegments[0] as { scale: number }).scale).toBe(1.3);

      // Cues passed through
      expect(result.cues).toHaveLength(2);

      // No primary video (faceless reel)
      expect(result.primaryVideoUrl).toBeUndefined();

      // Layout
      expect(result.layout).toBe('fullscreen');
    });

    it('BUG REPRO: piapi generated but worker discarded - assets with mismatched IDs', () => {
      // Simulates: piapi generates 5 videos but worker thinks they failed
      // and falls back to seedance-kie for the same shot IDs.
      // If both sets of assets end up in the array with the same shotIds,
      // only the LAST one in the Map wins.
      const plan = makePlan({
        shots: [
          makeShot('shot-1', { type: 'ai-video', prompt: 'test', toolId: 'seedance2-piapi' }, 0, 5),
        ],
      });

      // Two assets for the same shotId (shouldn't happen, but if it does)
      const assets: GeneratedAsset[] = [
        makeAsset('shot-1', 'https://cdn.piapi.ai/SHOULD_NOT_USE.mp4'),
        makeAsset('shot-1', 'https://cdn.kie.ai/CORRECT.mp4'),
      ];

      const result = assembleComposition({ plan, assets, cues: [] });

      // Map.set overwrites, so last asset wins
      expect(result.bRollSegments).toHaveLength(1);
      expect(result.bRollSegments[0].media.url).toBe('https://cdn.kie.ai/CORRECT.mp4');
    });

    it('partial failure: 4/6 assets generated, 2 become placeholders', () => {
      const plan = makePlan({
        shots: [
          makeShot('shot-1', { type: 'ai-video', prompt: 'test', toolId: 't' }, 0, 3),
          makeShot('shot-2', { type: 'ai-video', prompt: 'test', toolId: 't' }, 3, 6),
          makeShot('shot-3', { type: 'ai-video', prompt: 'test', toolId: 't' }, 6, 9),
          makeShot('shot-4', { type: 'ai-video', prompt: 'test', toolId: 't' }, 9, 12),
          makeShot('shot-5', { type: 'ai-video', prompt: 'test', toolId: 't' }, 12, 15),
          makeShot('shot-6', { type: 'ai-video', prompt: 'test', toolId: 't' }, 15, 18),
        ],
      });

      // shot-3 and shot-5 failed completely (no fallback worked)
      const assets: GeneratedAsset[] = [
        makeAsset('shot-1', 'https://cdn.kie.ai/v1.mp4'),
        makeAsset('shot-2', 'https://cdn.kie.ai/v2.mp4'),
        // shot-3 missing
        makeAsset('shot-4', 'https://cdn.kie.ai/v4.mp4'),
        // shot-5 missing
        makeAsset('shot-6', 'https://cdn.kie.ai/v6.mp4'),
      ];

      const result = assembleComposition({ plan, assets, cues: [] });

      expect(result.bRollSegments).toHaveLength(6);

      // Real assets
      expect(result.bRollSegments[0].media.url).toBe('https://cdn.kie.ai/v1.mp4');
      expect(result.bRollSegments[1].media.url).toBe('https://cdn.kie.ai/v2.mp4');
      expect(result.bRollSegments[3].media.url).toBe('https://cdn.kie.ai/v4.mp4');
      expect(result.bRollSegments[5].media.url).toBe('https://cdn.kie.ai/v6.mp4');

      // Placeholders for missing assets
      expect(result.bRollSegments[2].media.url).toBe('#333333');
      expect(result.bRollSegments[2].media.type).toBe('color');
      expect(result.bRollSegments[4].media.url).toBe('#333333');
      expect(result.bRollSegments[4].media.type).toBe('color');
    });
  });

  describe('Mixed shot types', () => {
    it('handles mix of primary, ai-video, b-roll, text-card, ai-image', () => {
      const plan = makePlan({
        primarySource: { type: 'user-recording', url: 'https://storage.com/talking-head.mp4' },
        shots: [
          makeShot('shot-1', { type: 'primary' }, 0, 5),
          makeShot('shot-2', { type: 'ai-video', prompt: 'code demo', toolId: 'seedance-kie' }, 5, 10),
          makeShot('shot-3', { type: 'text-card', headline: 'Key Point', background: '#1a1a2e' }, 10, 13),
          makeShot('shot-4', { type: 'b-roll', searchQuery: 'laptop typing', toolId: 'pexels' }, 13, 17),
          makeShot('shot-5', { type: 'ai-image', prompt: 'futuristic dashboard', toolId: 'nanobanana2-kie' }, 17, 21),
          makeShot('shot-6', { type: 'primary' }, 21, 25),
        ],
      });

      const assets: GeneratedAsset[] = [
        makeAsset('shot-2', 'https://cdn.kie.ai/code-demo.mp4'),
        makeAsset('shot-4', 'https://videos.pexels.com/laptop.mp4', 'stock-video'),
        makeAsset('shot-5', 'https://cdn.kie.ai/dashboard.png', 'ai-image'),
      ];

      const result = assembleComposition({ plan, assets, cues: [] });

      // Primary video from user recording
      expect(result.primaryVideoUrl).toBe('https://storage.com/talking-head.mp4');

      // B-roll segments: only non-primary, non-text-card types... wait, text-card IS in bRollSegments
      // shot-1 (primary) → skipped
      // shot-2 (ai-video) → bRoll
      // shot-3 (text-card) → bRoll (as text-card type)
      // shot-4 (b-roll) → bRoll
      // shot-5 (ai-image) → bRoll
      // shot-6 (primary) → skipped
      expect(result.bRollSegments).toHaveLength(4);

      expect(result.bRollSegments[0].media.url).toBe('https://cdn.kie.ai/code-demo.mp4');
      expect(result.bRollSegments[0].media.type).toBe('video');

      expect(result.bRollSegments[1].media.type).toBe('text-card');
      expect(result.bRollSegments[1].media.textCard?.headline).toBe('Key Point');

      expect(result.bRollSegments[2].media.url).toBe('https://videos.pexels.com/laptop.mp4');
      expect(result.bRollSegments[2].media.type).toBe('video');

      expect(result.bRollSegments[3].media.url).toBe('https://cdn.kie.ai/dashboard.png');
      expect(result.bRollSegments[3].media.type).toBe('image');
    });
  });

  describe('Voiceover URL passthrough', () => {
    it('voiceover filename is passed as voiceoverUrl', () => {
      const plan = makePlan();
      const result = assembleComposition({
        plan,
        assets: [],
        cues: [],
        voiceoverFilename: 'https://r2.reelstack.com/voiceover-abc.mp3',
      });
      expect(result.voiceoverUrl).toBe('https://r2.reelstack.com/voiceover-abc.mp3');
    });

    it('missing voiceover = undefined', () => {
      const plan = makePlan();
      const result = assembleComposition({ plan, assets: [], cues: [] });
      expect(result.voiceoverUrl).toBeUndefined();
    });
  });
});
