import { describe, it, expect } from 'vitest';
import { buildPlannerPrompt, buildComposerPrompt, buildRevisionPrompt } from '../prompt-builder';
import type { ToolManifest, ProductionPlan, UserAsset } from '../../types';
import type { MontageProfileEntry } from '@reelstack/remotion/catalog';
import {
  EFFECT_CATALOG,
  ENTRANCE_ANIMATIONS,
  EXIT_ANIMATIONS,
  TRANSITION_TYPES,
  LAYOUT_CATALOG,
  BGM_CATALOG,
} from '@reelstack/remotion/catalog';
import { BUILT_IN_CAPTION_PRESETS } from '@reelstack/types';

// ── Fixtures ────────────────────────────────────────────────

const mockManifest: ToolManifest = {
  tools: [
    {
      id: 'seedance2-piapi',
      name: 'Seedance 2.0',
      available: true,
      capabilities: [
        {
          assetType: 'ai-video',
          supportsPrompt: true,
          supportsScript: false,
          isAsync: true,
          estimatedLatencyMs: 120_000,
          costTier: 'expensive',
        },
      ],
      promptGuidelines: 'Describe motion explicitly. Avoid text overlays.',
    },
    {
      id: 'pexels',
      name: 'Pexels Stock',
      available: true,
      capabilities: [
        {
          assetType: 'stock-video',
          supportsPrompt: false,
          supportsScript: false,
          isAsync: false,
          estimatedLatencyMs: 2000,
          costTier: 'free',
        },
      ],
    },
    {
      id: 'disabled-tool',
      name: 'Disabled Tool',
      available: false,
      capabilities: [
        {
          assetType: 'ai-image',
          supportsPrompt: true,
          supportsScript: false,
          isAsync: true,
          estimatedLatencyMs: 30_000,
          costTier: 'moderate',
        },
      ],
    },
  ],
  summary: 'Two available tools for testing',
};

const emptyManifest: ToolManifest = {
  tools: [
    {
      id: 'unavailable',
      name: 'Unavailable',
      available: false,
      capabilities: [],
    },
  ],
  summary: 'No available tools',
};

const mockProfile: MontageProfileEntry = {
  id: 'test-profile',
  name: 'Test Profile',
  description: 'A test montage profile for unit tests.',
  pacing: 'fast',
  maxShotDurationSec: 4,
  effectsPerThirtySec: 5,
  allowedTransitions: ['crossfade', 'glitch'],
  sfxMapping: { transition: 'whoosh', emphasis: 'pop' },
  directorRules: ['Keep shots under 4s', 'Use glitch transitions for scene changes'],
  topicKeywords: ['test', 'unit'],
  toolPreference: ['seedance2-piapi', 'pexels'],
  colorPalette: { primary: '#FF0000', accent: '#00FF00' },
  bRollFilter: 'brightness(0.8)',
  arcTemplate: 'HOOK -> DEMO -> CTA',
};

const mockAssets: readonly UserAsset[] = [
  {
    id: 'talking-head-1',
    url: '/tmp/talking-head.mp4',
    type: 'video',
    description: 'Talking head, narrator facing camera',
    durationSeconds: 30,
    isPrimary: true,
  },
  {
    id: 'dashboard-screenshot',
    url: '/tmp/dashboard.png',
    type: 'image',
    description: 'Analytics dashboard showing monthly growth',
  },
];

const mockPlan: ProductionPlan = {
  primarySource: { type: 'none' },
  shots: [
    {
      id: 'shot-1',
      startTime: 0,
      endTime: 5,
      scriptSegment: 'Welcome to the demo',
      visual: { type: 'text-card', headline: 'Welcome', background: '#1a1a2e' },
      transition: { type: 'crossfade', durationMs: 400 },
      reason: 'Opening hook',
    },
  ],
  effects: [],
  zoomSegments: [],
  lowerThirds: [],
  counters: [],
  highlights: [],
  ctaSegments: [],
  layout: 'fullscreen',
  reasoning: 'Simple test plan',
};

// ── buildPlannerPrompt ──────────────────────────────────────

describe('buildPlannerPrompt', () => {
  it('includes available tool sections from manifest', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).toContain('Seedance 2.0 (id: "seedance2-piapi")');
    expect(result).toContain('Pexels Stock (id: "pexels")');
    expect(result).toContain('ai-video: prompt=true, script=false, async=true');
    expect(result).toContain('stock-video: prompt=false, script=false, async=false');
  });

  it('excludes unavailable tools from tool section', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).not.toContain('Disabled Tool (id: "disabled-tool")');
  });

  it('includes prompt guidelines for tools that have them', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).toContain('Describe motion explicitly. Avoid text overlays.');
  });

  it('includes effect catalog entries', () => {
    const result = buildPlannerPrompt(mockManifest);

    for (const effect of EFFECT_CATALOG.slice(0, 3)) {
      expect(result).toContain(`"${effect.type}"`);
      expect(result).toContain(effect.description);
    }
  });

  it('includes entrance and exit animations', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).toContain(ENTRANCE_ANIMATIONS.join(', '));
    expect(result).toContain(EXIT_ANIMATIONS.join(', '));
  });

  it('includes style guidelines with all style keys', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).toContain('"dynamic"');
    expect(result).toContain('"calm"');
    expect(result).toContain('"cinematic"');
    expect(result).toContain('"educational"');
  });

  it('includes caption presets', () => {
    const result = buildPlannerPrompt(mockManifest);
    const presetNames = Object.keys(BUILT_IN_CAPTION_PRESETS);

    expect(result).toContain(presetNames.join(', '));
  });

  it('includes layout catalog', () => {
    const result = buildPlannerPrompt(mockManifest);

    for (const layout of LAYOUT_CATALOG) {
      expect(result).toContain(`"${layout.type}"`);
    }
  });

  it('includes BGM catalog', () => {
    const result = buildPlannerPrompt(mockManifest);

    for (const bgm of BGM_CATALOG) {
      expect(result).toContain(`"${bgm.id}"`);
    }
  });

  it('includes transition types', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).toContain(TRANSITION_TYPES.join(', '));
  });

  it('includes profile guidelines when montageProfile provided', () => {
    const result = buildPlannerPrompt(mockManifest, mockProfile);

    expect(result).toContain('MONTAGE PROFILE: test-profile');
    expect(result).toContain('Test Profile');
    expect(result).toContain('Max shot duration: 4s');
    expect(result).toContain('Keep shots under 4s');
    expect(result).toContain('primary: #FF0000');
  });

  it('does not include profile section when no profile provided', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).not.toContain('MONTAGE PROFILE');
  });

  it('includes preferred tools section when preferredToolIds provided', () => {
    const result = buildPlannerPrompt(mockManifest, undefined, ['seedance2-piapi', 'pexels']);

    expect(result).toContain('PREFERRED TOOLS (MUST USE)');
    expect(result).toContain('"seedance2-piapi"');
    expect(result).toContain('"pexels"');
  });

  it('does not include preferred section when preferredToolIds is empty', () => {
    const result = buildPlannerPrompt(mockManifest, undefined, []);

    expect(result).not.toContain('PREFERRED TOOLS');
  });

  it('does not include preferred section when preferredToolIds is undefined', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).not.toContain('PREFERRED TOOLS');
  });

  it('shows fallback text when no tools are available', () => {
    const result = buildPlannerPrompt(emptyManifest);

    expect(result).toContain('No tools available - use text cards and effects only.');
  });

  it('shows fallback guidelines when no tools have promptGuidelines', () => {
    const noGuidelinesManifest: ToolManifest = {
      tools: [
        {
          id: 'simple-tool',
          name: 'Simple',
          available: true,
          capabilities: [
            {
              assetType: 'stock-image',
              supportsPrompt: false,
              supportsScript: false,
              isAsync: false,
              estimatedLatencyMs: 1000,
              costTier: 'free',
            },
          ],
          // no promptGuidelines
        },
      ],
      summary: 'Simple tool without guidelines',
    };

    const result = buildPlannerPrompt(noGuidelinesManifest);

    expect(result).toContain('No specific guidelines');
  });
});

// ── buildComposerPrompt ─────────────────────────────────────

describe('buildComposerPrompt', () => {
  it('includes user asset descriptions', () => {
    const result = buildComposerPrompt(mockAssets);

    expect(result).toContain('"talking-head-1"');
    expect(result).toContain('Talking head, narrator facing camera');
    expect(result).toContain('duration: 30s');
    expect(result).toContain('**PRIMARY / talking head**');
  });

  it('includes non-primary asset without PRIMARY marker', () => {
    const result = buildComposerPrompt(mockAssets);

    expect(result).toContain('"dashboard-screenshot"');
    expect(result).toContain('Analytics dashboard showing monthly growth');
    // dashboard-screenshot line should not contain PRIMARY
    const lines = result.split('\n');
    const dashboardLine = lines.find((l) => l.includes('dashboard-screenshot'));
    expect(dashboardLine).not.toContain('PRIMARY');
  });

  it('includes effect catalog', () => {
    const result = buildComposerPrompt(mockAssets);

    for (const effect of EFFECT_CATALOG.slice(0, 3)) {
      expect(result).toContain(`"${effect.type}"`);
    }
  });

  it('includes style guidelines', () => {
    const result = buildComposerPrompt(mockAssets);

    expect(result).toContain('"dynamic"');
    expect(result).toContain('"calm"');
  });

  it('includes entrance and exit animations', () => {
    const result = buildComposerPrompt(mockAssets);

    expect(result).toContain(ENTRANCE_ANIMATIONS.join(', '));
    expect(result).toContain(EXIT_ANIMATIONS.join(', '));
  });

  it('includes caption presets', () => {
    const result = buildComposerPrompt(mockAssets);

    const presetNames = Object.keys(BUILT_IN_CAPTION_PRESETS);
    expect(result).toContain(presetNames.join(', '));
  });

  it('includes layout catalog', () => {
    const result = buildComposerPrompt(mockAssets);

    for (const layout of LAYOUT_CATALOG) {
      expect(result).toContain(`"${layout.type}"`);
    }
  });

  it('handles empty assets array', () => {
    const result = buildComposerPrompt([]);

    // Should still render template without errors
    expect(result).toContain("USER'S AVAILABLE MATERIALS");
    expect(result).toContain('AVAILABLE VISUAL EFFECTS');
  });
});

// ── buildRevisionPrompt ─────────────────────────────────────

describe('buildRevisionPrompt', () => {
  it('contains original plan as JSON', () => {
    const result = buildRevisionPrompt(mockPlan, 'Make it more dynamic', mockManifest);

    expect(result).toContain('"primarySource"');
    expect(result).toContain('"shot-1"');
    expect(result).toContain('"Welcome to the demo"');
    expect(result).toContain('"Simple test plan"');
  });

  it('contains director notes', () => {
    const notes = 'Add more zoom segments and use glitch transitions';
    const result = buildRevisionPrompt(mockPlan, notes, mockManifest);

    expect(result).toContain(notes);
  });

  it('truncates director notes at 5000 characters', () => {
    const longNotes = 'x'.repeat(6000);
    const result = buildRevisionPrompt(mockPlan, longNotes, mockManifest);

    // The truncated string (5000 x's) should be present
    expect(result).toContain('x'.repeat(5000));
    // But the full 6000-char string should not
    expect(result).not.toContain('x'.repeat(5001));
  });

  it('includes tool sections from manifest', () => {
    const result = buildRevisionPrompt(mockPlan, 'Fix it', mockManifest);

    expect(result).toContain('Seedance 2.0 (id: "seedance2-piapi")');
    expect(result).toContain('Pexels Stock (id: "pexels")');
  });

  it('excludes unavailable tools', () => {
    const result = buildRevisionPrompt(mockPlan, 'Fix it', mockManifest);

    expect(result).not.toContain('Disabled Tool');
  });

  it('includes effect catalog', () => {
    const result = buildRevisionPrompt(mockPlan, 'Fix it', mockManifest);

    for (const effect of EFFECT_CATALOG.slice(0, 3)) {
      expect(result).toContain(`"${effect.type}"`);
    }
  });

  it('shows fallback text when no tools are available', () => {
    const result = buildRevisionPrompt(mockPlan, 'Fix it', emptyManifest);

    expect(result).toContain('No tools available - use text cards and effects only.');
  });

  it('includes layout and caption property sections', () => {
    const result = buildRevisionPrompt(mockPlan, 'Fix it', mockManifest);

    for (const layout of LAYOUT_CATALOG) {
      expect(result).toContain(`"${layout.type}"`);
    }
  });
});

// ── Partial inclusion ───────────────────────────────────────

describe('partial inclusion', () => {
  it('planner includes rules-hook partial', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).toContain('HOOK RULES');
  });

  it('planner includes rules-no-text-redundancy partial', () => {
    const result = buildPlannerPrompt(mockManifest);

    // Check for content from the partial rather than exact heading
    expect(result).toMatch(/text.*(redundan|caption|duplicate)/i);
  });

  it('planner includes rules-retention partial', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).toMatch(/retention/i);
  });

  it('planner includes rules-broll partial', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).toMatch(/b-?roll/i);
  });

  it('planner includes rules-text-duplication partial', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).toMatch(/duplication|duplicate/i);
  });

  it('composer includes rules-no-text-redundancy partial', () => {
    const result = buildComposerPrompt(mockAssets);

    expect(result).toMatch(/text.*(redundan|caption|duplicate)/i);
  });

  it('no unresolved partial placeholders remain in planner output', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).not.toMatch(/\{\{>\s*\w+\s*\}\}/);
  });

  it('no unresolved partial placeholders remain in composer output', () => {
    const result = buildComposerPrompt(mockAssets);

    expect(result).not.toMatch(/\{\{>\s*\w+\s*\}\}/);
  });

  it('no unresolved partial placeholders remain in revision output', () => {
    const result = buildRevisionPrompt(mockPlan, 'notes', mockManifest);

    expect(result).not.toMatch(/\{\{>\s*\w+\s*\}\}/);
  });
});

// ── Template rendering ──────────────────────────────────────

describe('template rendering', () => {
  it('all {{variables}} are replaced in planner output', () => {
    const result = buildPlannerPrompt(mockManifest);

    // No unresolved variables should remain (matching {{word}} pattern)
    expect(result).not.toMatch(/\{\{[a-zA-Z_]\w*\}\}/);
  });

  it('all {{variables}} are replaced in composer output', () => {
    const result = buildComposerPrompt(mockAssets);

    expect(result).not.toMatch(/\{\{[a-zA-Z_]\w*\}\}/);
  });

  it('all {{variables}} are replaced in revision output', () => {
    const result = buildRevisionPrompt(mockPlan, 'notes', mockManifest);

    expect(result).not.toMatch(/\{\{[a-zA-Z_]\w*\}\}/);
  });

  it('planner output starts with the template header', () => {
    const result = buildPlannerPrompt(mockManifest);

    expect(result).toMatch(/^You are an AI video production planner/);
  });

  it('composer output starts with the template header', () => {
    const result = buildComposerPrompt(mockAssets);

    expect(result).toMatch(/^You are an AI video director\/composer/);
  });

  it('revision output starts with the template header', () => {
    const result = buildRevisionPrompt(mockPlan, 'notes', mockManifest);

    expect(result).toMatch(/^You are an AI video production planner revising/);
  });
});
