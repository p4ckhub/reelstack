import { describe, it, expect, vi } from 'vitest';

// Use real modules to avoid mock leaking across test files in bun suite runs.
// Only mock the logger (side-effect free, no leaking risk).

import { assembleComposition } from '../composition-assembler';
import type { AssemblyInput, AssembledProps } from '../composition-assembler';
import type { ProductionPlan, GeneratedAsset, BrandPreset, ShotPlan } from '../../types';

// ── Helpers ────────────────────────────────────────────────────

function makeMinimalPlan(overrides: Partial<ProductionPlan> = {}): ProductionPlan {
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
    reasoning: 'test plan',
    ...overrides,
  };
}

function makeInput(overrides: Partial<AssemblyInput> = {}): AssemblyInput {
  return {
    plan: makeMinimalPlan(),
    assets: [],
    cues: [],
    ...overrides,
  };
}

function makeShot(overrides: Partial<ShotPlan> & Pick<ShotPlan, 'visual'>): ShotPlan {
  return {
    id: 'shot-1',
    startTime: 0,
    endTime: 3,
    scriptSegment: 'test',
    transition: { type: 'crossfade', durationMs: 300 },
    reason: 'test shot',
    ...overrides,
  };
}

function makeAsset(overrides: Partial<GeneratedAsset> = {}): GeneratedAsset {
  return {
    toolId: 'test-tool',
    url: 'https://cdn.example.com/video.mp4',
    type: 'ai-video',
    shotId: 'shot-1',
    ...overrides,
  };
}

// ── Layout selection ───────────────────────────────────────────

describe('layout selection', () => {
  it('uses layout from plan', () => {
    const result = assembleComposition(
      makeInput({ plan: makeMinimalPlan({ layout: 'split-screen' }) })
    );
    expect(result.layout).toBe('split-screen');
  });

  it('supports all layout types', () => {
    const layouts = [
      'fullscreen',
      'split-screen',
      'picture-in-picture',
      'anchor-bottom',
      'hybrid-anchor',
      'comparison-split',
    ] as const;

    for (const layout of layouts) {
      const result = assembleComposition(makeInput({ plan: makeMinimalPlan({ layout }) }));
      expect(result.layout).toBe(layout);
    }
  });

  it('ignores brandPreset.layout (intentionally)', () => {
    const result = assembleComposition(
      makeInput({
        plan: makeMinimalPlan({ layout: 'fullscreen' }),
        brandPreset: { layout: 'split-screen' },
      })
    );
    expect(result.layout).toBe('fullscreen');
  });
});

// ── Primary video URL ──────────────────────────────────────────

describe('primary video URL', () => {
  it('sets primaryVideoUrl from user-recording source', () => {
    const plan = makeMinimalPlan({
      primarySource: { type: 'user-recording', url: 'https://cdn.example.com/recording.mp4' },
    });
    const result = assembleComposition(makeInput({ plan }));
    expect(result.primaryVideoUrl).toBe('https://cdn.example.com/recording.mp4');
  });

  it('sets primaryVideoUrl from avatar asset (no shotId)', () => {
    const plan = makeMinimalPlan({
      primarySource: { type: 'avatar', toolId: 'heygen', script: 'Hello' },
    });
    const asset = makeAsset({
      shotId: undefined,
      url: 'https://cdn.example.com/avatar.mp4',
      durationSeconds: 12,
    });
    const result = assembleComposition(makeInput({ plan, assets: [asset] }));
    expect(result.primaryVideoUrl).toBe('https://cdn.example.com/avatar.mp4');
    expect(result.primaryVideoDurationSeconds).toBe(12);
  });

  it('sets primaryVideoUrl from ai-video source', () => {
    const plan = makeMinimalPlan({
      primarySource: { type: 'ai-video', toolId: 'veo31', prompt: 'test' },
    });
    const asset = makeAsset({
      shotId: undefined,
      url: 'https://cdn.example.com/ai-video.mp4',
      durationSeconds: 8,
    });
    const result = assembleComposition(makeInput({ plan, assets: [asset] }));
    expect(result.primaryVideoUrl).toBe('https://cdn.example.com/ai-video.mp4');
    expect(result.primaryVideoDurationSeconds).toBe(8);
  });

  it('prefers input.primaryVideoDurationSeconds over asset duration', () => {
    const plan = makeMinimalPlan({
      primarySource: { type: 'avatar', toolId: 'heygen', script: 'Hello' },
    });
    const asset = makeAsset({ shotId: undefined, durationSeconds: 12 });
    const result = assembleComposition(
      makeInput({ plan, assets: [asset], primaryVideoDurationSeconds: 25 })
    );
    expect(result.primaryVideoDurationSeconds).toBe(25);
  });

  it('passes primaryVideoObjectPosition from input', () => {
    const result = assembleComposition(makeInput({ primaryVideoObjectPosition: 'center 30%' }));
    expect(result.primaryVideoObjectPosition).toBe('center 30%');
  });

  it('leaves primaryVideoUrl undefined for type=none', () => {
    const plan = makeMinimalPlan({ primarySource: { type: 'none' } });
    const result = assembleComposition(makeInput({ plan }));
    expect(result.primaryVideoUrl).toBeUndefined();
  });
});

// ── B-roll segments ────────────────────────────────────────────

describe('B-roll segment assembly', () => {
  it('creates video b-roll segments from matched assets', () => {
    const shot = makeShot({
      visual: { type: 'ai-video', prompt: 'city flyover', toolId: 'veo31' },
    });
    const asset = makeAsset({
      shotId: 'shot-1',
      url: 'https://cdn.example.com/video.mp4',
      type: 'ai-video',
    });
    const plan = makeMinimalPlan({ shots: [shot] });
    const result = assembleComposition(makeInput({ plan, assets: [asset] }));

    expect(result.bRollSegments).toHaveLength(1);
    expect(result.bRollSegments[0].media.type).toBe('video');
    expect(result.bRollSegments[0].media.url).toBe('https://cdn.example.com/video.mp4');
    expect(result.bRollSegments[0].startTime).toBe(0);
    expect(result.bRollSegments[0].endTime).toBe(3);
  });

  it('detects image media type by asset type', () => {
    const shot = makeShot({
      visual: { type: 'ai-image', prompt: 'landscape', toolId: 'flux' },
    });
    const asset = makeAsset({
      shotId: 'shot-1',
      url: 'https://cdn.example.com/image.webp',
      type: 'ai-image',
    });
    const plan = makeMinimalPlan({ shots: [shot] });
    const result = assembleComposition(makeInput({ plan, assets: [asset] }));

    expect(result.bRollSegments[0].media.type).toBe('image');
  });

  it('detects image media type by URL extension', () => {
    const shot = makeShot({
      visual: { type: 'b-roll', searchQuery: 'photo', toolId: 'pexels' },
    });
    const asset = makeAsset({
      shotId: 'shot-1',
      url: 'https://images.pexels.com/photo.jpeg?w=1920',
      type: 'stock-video', // Pexels sometimes returns stock-video type for images
    });
    const plan = makeMinimalPlan({ shots: [shot] });
    const result = assembleComposition(makeInput({ plan, assets: [asset] }));

    expect(result.bRollSegments[0].media.type).toBe('image');
  });

  it('creates placeholder for shots with no matching asset', () => {
    const shot = makeShot({
      visual: { type: 'b-roll', searchQuery: 'nature', toolId: 'pexels' },
    });
    const plan = makeMinimalPlan({ shots: [shot] });
    const result = assembleComposition(makeInput({ plan, assets: [] }));

    expect(result.bRollSegments).toHaveLength(1);
    expect(result.bRollSegments[0].media.type).toBe('color');
    expect(result.bRollSegments[0].media.url).toBe('#333333');
  });

  it('creates placeholder for assets with invalid URL scheme', () => {
    const shot = makeShot({
      visual: { type: 'ai-video', prompt: 'test', toolId: 'veo31' },
    });
    const asset = makeAsset({
      shotId: 'shot-1',
      url: 'ftp://bad-scheme.example.com/video.mp4',
      type: 'ai-video',
    });
    const plan = makeMinimalPlan({ shots: [shot] });
    const result = assembleComposition(makeInput({ plan, assets: [asset] }));

    expect(result.bRollSegments[0].media.url).toBe('#333333');
    expect(result.bRollSegments[0].media.type).toBe('color');
  });

  it('accepts local file paths starting with /', () => {
    const shot = makeShot({
      visual: { type: 'ai-video', prompt: 'test', toolId: 'veo31' },
    });
    const asset = makeAsset({
      shotId: 'shot-1',
      url: '/tmp/reelstack/output.mp4',
      type: 'ai-video',
    });
    const plan = makeMinimalPlan({ shots: [shot] });
    const result = assembleComposition(makeInput({ plan, assets: [asset] }));

    expect(result.bRollSegments[0].media.url).toBe('/tmp/reelstack/output.mp4');
    expect(result.bRollSegments[0].media.type).toBe('video');
  });

  it('skips primary visual type shots', () => {
    const shot = makeShot({ visual: { type: 'primary' } });
    const plan = makeMinimalPlan({ shots: [shot] });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.bRollSegments).toHaveLength(0);
  });

  it('creates text-card segments', () => {
    const shot = makeShot({
      visual: { type: 'text-card', headline: 'DID YOU KNOW?', background: '#FF5500' },
    });
    const plan = makeMinimalPlan({ shots: [shot] });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.bRollSegments).toHaveLength(1);
    expect(result.bRollSegments[0].media.type).toBe('text-card');
    expect(result.bRollSegments[0].media.textCard?.headline).toBe('DID YOU KNOW?');
    expect(result.bRollSegments[0].media.textCard?.background).toBe('#FF5500');
  });

  it('rotates animations from default pool', () => {
    const shots = Array.from({ length: 3 }, (_, i) =>
      makeShot({
        id: `shot-${i}`,
        visual: { type: 'ai-video', prompt: 'test', toolId: 'veo31' },
        startTime: i * 3,
        endTime: (i + 1) * 3,
        shotLayout: 'content',
      })
    );
    const assets = shots.map((s) =>
      makeAsset({ shotId: s.id, url: `https://cdn.example.com/vid-${s.id}.mp4` })
    );
    const plan = makeMinimalPlan({ shots });
    const result = assembleComposition(makeInput({ plan, assets }));

    // Default pool: ['spring-scale', 'fade', 'slide', 'spring-scale', 'fade']
    // For content shots: animPool[idx % pool.length]
    expect(result.bRollSegments[0].animation).toBe('spring-scale');
    expect(result.bRollSegments[1].animation).toBe('fade');
    expect(result.bRollSegments[2].animation).toBe('slide');
  });

  it('uses custom animation pool from plan', () => {
    const shot = makeShot({
      visual: { type: 'ai-video', prompt: 'test', toolId: 'veo31' },
      shotLayout: 'content',
    });
    const asset = makeAsset({ shotId: 'shot-1' });
    const plan = makeMinimalPlan({
      shots: [shot],
      animationPool: ['zoom', 'flip', 'bounce'],
    });
    const result = assembleComposition(makeInput({ plan, assets: [asset] }));

    expect(result.bRollSegments[0].animation).toBe('zoom');
  });

  it('preserves shotLayout on b-roll segments', () => {
    const shot = makeShot({
      visual: { type: 'ai-video', prompt: 'test', toolId: 'veo31' },
      shotLayout: 'anchor',
    });
    const asset = makeAsset({ shotId: 'shot-1' });
    const plan = makeMinimalPlan({ shots: [shot] });
    const result = assembleComposition(makeInput({ plan, assets: [asset] }));

    expect(result.bRollSegments[0].shotLayout).toBe('anchor');
  });

  it('preserves panel on b-roll segments', () => {
    const shot = makeShot({
      visual: { type: 'ai-video', prompt: 'test', toolId: 'veo31' },
      panel: 'right',
    });
    const asset = makeAsset({ shotId: 'shot-1' });
    const plan = makeMinimalPlan({ shots: [shot] });
    const result = assembleComposition(makeInput({ plan, assets: [asset] }));

    expect((result.bRollSegments[0] as unknown as Record<string, unknown>).panel).toBe('right');
  });

  it('handles montage shots with multi-panel grid', () => {
    const shots = [
      makeShot({
        id: 'montage-1',
        visual: { type: 'ai-image', prompt: 'panel', toolId: 'flux' },
        shotLayout: 'montage',
        montagePanelIds: ['board-0', 'board-1'],
      }),
    ];
    const assets = [
      makeAsset({ shotId: 'board-0', url: 'https://cdn.example.com/img0.jpg', type: 'ai-image' }),
      makeAsset({ shotId: 'board-1', url: 'https://cdn.example.com/img1.jpg', type: 'ai-image' }),
    ];
    const plan = makeMinimalPlan({ shots });
    const result = assembleComposition(makeInput({ plan, assets }));

    expect(result.bRollSegments).toHaveLength(1);
    expect(result.bRollSegments[0].media.type).toBe('multi-panel');
    expect(result.bRollSegments[0].media.panels).toHaveLength(2);
    expect(result.bRollSegments[0].shotLayout).toBe('montage');
  });

  it('skips montage shot when fewer than 2 panels found', () => {
    const shots = [
      makeShot({
        id: 'montage-1',
        visual: { type: 'ai-image', prompt: 'panel', toolId: 'flux' },
        shotLayout: 'montage',
        montagePanelIds: ['board-0', 'board-missing'],
      }),
    ];
    const assets = [
      makeAsset({ shotId: 'board-0', url: 'https://cdn.example.com/img0.jpg', type: 'ai-image' }),
    ];
    const plan = makeMinimalPlan({ shots });
    const result = assembleComposition(makeInput({ plan, assets }));

    // Montage requires >= 2 panels, so no segment created
    expect(result.bRollSegments).toHaveLength(0);
  });
});

// ── Caption style (3-layer cascade) ────────────────────────────

describe('caption style 3-layer cascade', () => {
  it('uses preset defaults when no LLM or brand overrides', () => {
    const result = assembleComposition(makeInput());

    // Default preset is 'tiktok'
    expect(result.captionStyle?.fontFamily).toBe('Outfit');
    expect(result.captionStyle?.fontSize).toBe(72);
    expect(result.captionStyle?.fontColor).toBe('#FFFFFF');
    expect(result.captionStyle?.fontWeight).toBe('bold');
    expect(result.captionStyle?.highlightColor).toBe('#F59E0B');
    expect(result.captionStyle?.textTransform).toBe('uppercase');
    expect(result.captionStyle?.animationStyle).toBe('word-highlight');
  });

  it('LLM plan.captionStyle overrides preset defaults', () => {
    const plan = makeMinimalPlan({
      captionStyle: {
        fontFamily: 'Inter',
        fontSize: 60,
        highlightColor: '#FF0000',
      },
    });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.captionStyle?.fontFamily).toBe('Inter');
    expect(result.captionStyle?.fontSize).toBe(60);
    expect(result.captionStyle?.highlightColor).toBe('#FF0000');
    // Non-overridden fields stay as preset
    expect(result.captionStyle?.fontWeight).toBe('bold');
  });

  it('brandPreset overrides both LLM and preset', () => {
    const plan = makeMinimalPlan({
      captionStyle: {
        fontFamily: 'Inter',
        fontSize: 60,
        highlightColor: '#FF0000',
      },
    });
    const brandPreset: BrandPreset = {
      fontFamily: 'Poppins',
      fontSize: 80,
      highlightColor: '#00FF00',
    };
    const result = assembleComposition(makeInput({ plan, brandPreset }));

    expect(result.captionStyle?.fontFamily).toBe('Poppins');
    expect(result.captionStyle?.fontSize).toBe(80);
    expect(result.captionStyle?.highlightColor).toBe('#00FF00');
  });

  it('uses specified caption preset via brandPreset.captionPreset', () => {
    const brandPreset: BrandPreset = { captionPreset: 'cinematic' };
    const result = assembleComposition(makeInput({ brandPreset }));

    expect(result.captionStyle?.fontFamily).toBe('Montserrat');
    expect(result.captionStyle?.fontSize).toBe(48);
    expect(result.captionStyle?.animationStyle).toBe('karaoke');
  });

  it('falls back to tiktok preset for unknown captionPreset', () => {
    const brandPreset: BrandPreset = { captionPreset: 'nonexistent-preset' };
    const result = assembleComposition(makeInput({ brandPreset }));

    expect(result.captionStyle?.fontFamily).toBe('Outfit');
  });

  it('brandPreset fields take priority over captionPreset', () => {
    const brandPreset: BrandPreset = {
      captionPreset: 'cinematic',
      fontFamily: 'CustomFont',
      fontSize: 100,
    };
    const result = assembleComposition(makeInput({ brandPreset }));

    // brandPreset overrides cinematic preset
    expect(result.captionStyle?.fontFamily).toBe('CustomFont');
    expect(result.captionStyle?.fontSize).toBe(100);
    // Non-overridden cinematic fields remain
    expect(result.captionStyle?.shadowBlur).toBe(16);
  });

  it('ignores non-string/non-number values in LLM captionStyle', () => {
    const plan = makeMinimalPlan({
      captionStyle: {
        fontFamily: 42, // should be ignored (not a string)
        fontSize: 'large', // should be ignored (not a number)
        highlightColor: '', // empty string should be ignored
      },
    });
    const result = assembleComposition(makeInput({ plan }));

    // Falls back to preset defaults
    expect(result.captionStyle?.fontFamily).toBe('Outfit');
    expect(result.captionStyle?.fontSize).toBe(72);
    expect(result.captionStyle?.highlightColor).toBe('#F59E0B');
  });
});

// ── Effects assembly ───────────────────────────────────────────

describe('effects assembly', () => {
  it('maps plan effects to output with config spread', () => {
    const plan = makeMinimalPlan({
      effects: [
        {
          type: 'screen-shake',
          startTime: 2,
          endTime: 2.5,
          config: { intensity: 15, frequency: 5 },
          reason: 'impact',
        },
      ],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].type).toBe('screen-shake');
    expect(result.effects[0].startTime).toBe(2);
    expect(result.effects[0].endTime).toBe(2.5);
    expect(result.effects[0].intensity).toBe(15);
    expect(result.effects[0].frequency).toBe(5);
  });

  it('adds default SFX from catalog when no LLM sfx specified', () => {
    const plan = makeMinimalPlan({
      effects: [
        {
          type: 'emoji-popup',
          startTime: 1,
          endTime: 2,
          config: { emoji: 'fire' },
          reason: 'reaction',
        },
      ],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.effects[0].sfx).toEqual({ url: 'sfx/pop.mp3', volume: 0.7 });
  });

  it('uses LLM-specified custom SFX over catalog default', () => {
    const plan = makeMinimalPlan({
      effects: [
        {
          type: 'emoji-popup',
          startTime: 1,
          endTime: 2,
          config: { emoji: 'fire', sfx: { id: 'ding', volume: 0.5 } },
          reason: 'reaction',
        },
      ],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.effects[0].sfx).toEqual({ url: 'sfx/ding.mp3', volume: 0.5 });
  });

  it('omits SFX when LLM explicitly sets sfx=null', () => {
    const plan = makeMinimalPlan({
      effects: [
        {
          type: 'emoji-popup',
          startTime: 1,
          endTime: 2,
          config: { emoji: 'fire', sfx: null },
          reason: 'silent reaction',
        },
      ],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.effects[0].sfx).toBeUndefined();
  });

  it('does not add SFX for effect types without catalog default', () => {
    const plan = makeMinimalPlan({
      effects: [
        {
          type: 'screen-shake',
          startTime: 1,
          endTime: 1.5,
          config: { intensity: 10 },
          reason: 'impact',
        },
      ],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.effects[0].sfx).toBeUndefined();
  });

  it('uses default volume 0.7 when LLM sfx has no volume', () => {
    const plan = makeMinimalPlan({
      effects: [
        {
          type: 'emoji-popup',
          startTime: 1,
          endTime: 2,
          config: { emoji: 'fire', sfx: { id: 'boom' } },
          reason: 'test',
        },
      ],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect((result.effects[0].sfx as { volume: number }).volume).toBe(0.7);
  });
});

// ── Cues passthrough ───────────────────────────────────────────

describe('cues', () => {
  it('copies cues to output', () => {
    const cues = [
      { id: 'c1', text: 'Hello', startTime: 0, endTime: 1 },
      { id: 'c2', text: 'World', startTime: 1, endTime: 2 },
    ];
    const result = assembleComposition(makeInput({ cues }));

    expect(result.cues).toHaveLength(2);
    expect(result.cues[0].text).toBe('Hello');
    expect(result.cues[1].text).toBe('World');
  });

  it('creates shallow copies (not references)', () => {
    const cues = [{ id: 'c1', text: 'Hello', startTime: 0, endTime: 1 }];
    const result = assembleComposition(makeInput({ cues }));

    expect(result.cues[0]).not.toBe(cues[0]);
    expect(result.cues[0]).toEqual(cues[0]);
  });
});

// ── Brand preset global props ──────────────────────────────────

describe('brand preset global props', () => {
  it('applies musicUrl from brandPreset', () => {
    const brandPreset: BrandPreset = { musicUrl: 'https://cdn.example.com/music.mp3' };
    const result = assembleComposition(makeInput({ brandPreset }));
    expect(result.musicUrl).toBe('https://cdn.example.com/music.mp3');
  });

  it('applies musicVolume from brandPreset', () => {
    const brandPreset: BrandPreset = { musicVolume: 0.5 };
    const result = assembleComposition(makeInput({ brandPreset }));
    expect(result.musicVolume).toBe(0.5);
  });

  it('uses preset musicVolume when brandPreset does not specify', () => {
    const result = assembleComposition(makeInput());
    // tiktok preset: 0.15
    expect(result.musicVolume).toBe(0.15);
  });

  it('applies showProgressBar from brandPreset', () => {
    const brandPreset: BrandPreset = { showProgressBar: true };
    const result = assembleComposition(makeInput({ brandPreset }));
    expect(result.showProgressBar).toBe(true);
  });

  it('applies backgroundColor from brandPreset', () => {
    const brandPreset: BrandPreset = { backgroundColor: '#112233' };
    const result = assembleComposition(makeInput({ brandPreset }));
    expect(result.backgroundColor).toBe('#112233');
  });

  it('defaults backgroundColor to #000000', () => {
    const result = assembleComposition(makeInput());
    expect(result.backgroundColor).toBe('#000000');
  });

  it('applies dynamicCaptionPosition from brandPreset', () => {
    const brandPreset: BrandPreset = { dynamicCaptionPosition: true };
    const result = assembleComposition(makeInput({ brandPreset }));
    expect(result.dynamicCaptionPosition).toBe(true);
  });

  it('uses preset dynamicCaptionPosition when brandPreset does not specify', () => {
    const result = assembleComposition(makeInput());
    // tiktok preset: false
    expect(result.dynamicCaptionPosition).toBe(false);
  });
});

// ── Voiceover ──────────────────────────────────────────────────

describe('voiceover', () => {
  it('passes voiceoverFilename as voiceoverUrl', () => {
    const result = assembleComposition(
      makeInput({ voiceoverFilename: 'https://r2.example.com/voiceover.mp3' })
    );
    expect(result.voiceoverUrl).toBe('https://r2.example.com/voiceover.mp3');
  });

  it('leaves voiceoverUrl undefined when not provided', () => {
    const result = assembleComposition(makeInput());
    expect(result.voiceoverUrl).toBeUndefined();
  });
});

// ── Plan segment pass-through ──────────────────────────────────

describe('plan segment pass-through', () => {
  it('maps zoomSegments from plan', () => {
    const plan = makeMinimalPlan({
      zoomSegments: [
        { startTime: 2, endTime: 4, scale: 1.5, focusPoint: { x: 0.5, y: 0.3 }, easing: 'spring' },
      ],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.zoomSegments).toHaveLength(1);
    expect(result.zoomSegments[0]).toEqual({
      startTime: 2,
      endTime: 4,
      scale: 1.5,
      focusPoint: { x: 0.5, y: 0.3 },
      easing: 'spring',
    });
  });

  it('maps lowerThirds from plan', () => {
    const plan = makeMinimalPlan({
      lowerThirds: [
        {
          startTime: 0,
          endTime: 3,
          title: 'John Doe',
          subtitle: 'CEO',
          backgroundColor: '#000',
          textColor: '#FFF',
        },
      ],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.lowerThirds).toHaveLength(1);
    expect((result.lowerThirds[0] as unknown as Record<string, unknown>).title).toBe('John Doe');
  });

  it('maps ctaSegments from plan', () => {
    const plan = makeMinimalPlan({
      ctaSegments: [
        { startTime: 20, endTime: 25, text: 'Subscribe!', style: 'button', position: 'bottom' },
      ],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.ctaSegments).toHaveLength(1);
    expect((result.ctaSegments[0] as unknown as Record<string, unknown>).text).toBe('Subscribe!');
  });

  it('maps counters from plan', () => {
    const plan = makeMinimalPlan({
      counters: [
        { startTime: 5, endTime: 8, value: 1000000, prefix: '$', format: 'abbreviated' as const },
      ],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.counters).toHaveLength(1);
    expect((result.counters[0] as unknown as Record<string, unknown>).value).toBe(1000000);
  });

  it('maps highlights from plan', () => {
    const plan = makeMinimalPlan({
      highlights: [{ startTime: 3, endTime: 5, x: 10, y: 20, width: 200, height: 100, glow: true }],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.highlights).toHaveLength(1);
    expect((result.highlights[0] as unknown as Record<string, unknown>).glow).toBe(true);
  });

  it('maps pipSegments with primaryVideoUrl', () => {
    const plan = makeMinimalPlan({
      primarySource: { type: 'user-recording', url: 'https://cdn.example.com/recording.mp4' },
      pipSegments: [{ startTime: 5, endTime: 10, position: 'bottom-right' as const, size: 0.25 }],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect(result.pipSegments).toHaveLength(1);
    expect((result.pipSegments[0] as unknown as Record<string, unknown>).videoUrl).toBe(
      'https://cdn.example.com/recording.mp4'
    );
  });
});

// ── Optional top-level fields ──────────────────────────────────

describe('optional top-level fields', () => {
  it('includes scrollStopper when present in plan', () => {
    const plan = makeMinimalPlan({
      scrollStopper: { preset: 'zoom-bounce', durationSeconds: 1.5 },
    });
    const result = assembleComposition(makeInput({ plan }));

    expect((result as unknown as Record<string, unknown>).scrollStopper).toEqual({
      preset: 'zoom-bounce',
      durationSeconds: 1.5,
    });
  });

  it('omits scrollStopper when not in plan', () => {
    const result = assembleComposition(makeInput());
    expect((result as unknown as Record<string, unknown>).scrollStopper).toBeUndefined();
  });

  it('includes logoOverlay from brandPreset', () => {
    const brandPreset = {
      logoOverlay: { url: 'https://cdn.example.com/logo.png', position: 'top-right', size: 0.1 },
    } as BrandPreset;
    const result = assembleComposition(makeInput({ brandPreset }));

    expect((result as unknown as Record<string, unknown>).logoOverlay).toEqual({
      url: 'https://cdn.example.com/logo.png',
      position: 'top-right',
      size: 0.1,
    });
  });

  it('includes sfxSegments when present in plan', () => {
    const plan = makeMinimalPlan({
      sfxSegments: [{ startTime: 5, sfxId: 'whoosh', volume: 0.8 }],
    });
    const result = assembleComposition(makeInput({ plan }));

    expect((result as unknown as Record<string, unknown>).sfxSegments).toEqual([
      { startTime: 5, sfxId: 'whoosh', volume: 0.8 },
    ]);
  });

  it('omits sfxSegments when empty', () => {
    const plan = makeMinimalPlan({ sfxSegments: [] });
    const result = assembleComposition(makeInput({ plan }));
    expect((result as unknown as Record<string, unknown>).sfxSegments).toBeUndefined();
  });
});

// ── Default empty arrays ───────────────────────────────────────

describe('default empty arrays', () => {
  it('returns empty arrays for all optional segment types', () => {
    const result = assembleComposition(makeInput());

    expect(result.bRollSegments).toEqual([]);
    expect(result.effects).toEqual([]);
    expect(result.pipSegments).toEqual([]);
    expect(result.lowerThirds).toEqual([]);
    expect(result.ctaSegments).toEqual([]);
    expect(result.counters).toEqual([]);
    expect(result.zoomSegments).toEqual([]);
    expect(result.highlights).toEqual([]);
    expect(result.cues).toEqual([]);
  });
});
