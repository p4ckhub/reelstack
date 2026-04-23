/**
 * Regression tests for prompt content.
 *
 * Two strategies:
 *
 * 1. **Static templates** (supervisor, prompt-writer, script-reviewer,
 *    script-writer, short-film-director) — full snapshot. Their .md content is
 *    deterministic, so any unintentional edit triggers a snapshot diff.
 *
 * 2. **Dynamic templates** (planner, composer, revision) — these inject runtime
 *    data (EFFECT_CATALOG, registered cards/palettes/transitions). A snapshot
 *    would break every time a module is added. Instead we assert STRUCTURAL
 *    invariants: required sections present, length within reasonable bounds,
 *    no unresolved {{vars}} or {{> partials}}.
 *
 * 3. **Guidelines** — every per-tool guideline is fully static prose.
 *    Snapshot all 21 in one assertion.
 *
 * 4. **Partials** — same as guidelines: static prose, snapshot all.
 *
 * To update intentionally: `bun test --update-snapshots`.
 */
import { describe, it, expect } from 'vitest';
import { renderPrompt, loadGuideline, loadPartial, loadTemplate } from '..';
import {
  buildPlannerPrompt,
  buildComposerPrompt,
  buildRevisionPrompt,
} from '../../planner/prompt-builder';
import type { ToolManifest, ProductionPlan, UserAsset } from '../../types';

// ── Stable mock fixtures (must match shape used in prompt-builder.test.ts) ──

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
      promptGuidelines: 'See guidelines/seedance.md',
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
  ],
  summary: 'Two tools available for regression testing',
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
      scriptSegment: 'Hook line',
      visual: { type: 'b-roll', searchQuery: 'laptop desk' },
    },
  ],
  effects: [],
  layout: 'fullscreen',
} as unknown as ProductionPlan;

// ── 1. Static templates: full snapshot ─────────────────────────

const STATIC_TEMPLATES = [
  'supervisor',
  'prompt-writer',
  'script-reviewer',
  'script-writer',
  'short-film-director',
] as const;

describe('static templates — content snapshot', () => {
  for (const name of STATIC_TEMPLATES) {
    it(`${name}.md content matches snapshot`, () => {
      const raw = loadTemplate(name);
      expect(raw).not.toBe('');
      expect(raw).toMatchSnapshot();
    });
  }
});

// ── 2. Dynamic templates: structural invariants ────────────────

describe('planner prompt — structural invariants', () => {
  const out = buildPlannerPrompt(mockManifest);

  it('contains all required headings', () => {
    const required = [
      '## AVAILABLE TOOLS',
      '## PROMPT WRITING GUIDELINES PER TOOL',
      '## AVAILABLE VISUAL EFFECTS',
      '## SOUND EFFECTS (SFX)',
      '## ADVANCED COMPOSITION ELEMENTS',
      '## LAYOUTS',
      '## CARD LIBRARY',
      '## SCENE TRANSITIONS',
      '## BACKGROUND MUSIC',
      '## CAPTION STYLE',
      '## STYLE GUIDELINES',
      '## PLANNING RULES',
      '## SELF-CRITIQUE',
      '## OUTPUT FORMAT',
    ];
    for (const heading of required) expect(out).toContain(heading);
  });

  it('contains all numbered planning rules in order (1..12)', () => {
    const positions = Array.from({ length: 12 }, (_, i) => out.indexOf(`\n${i + 1}. `));
    // Every rule must be present
    expect(positions.every((p) => p > -1)).toBe(true);
    // Strictly ascending order — no duplicate or out-of-order numbering
    const planningStart = out.indexOf('## PLANNING RULES');
    const planningPositions = positions.filter((p) => p > planningStart);
    const sorted = [...planningPositions].sort((a, b) => a - b);
    expect(planningPositions).toEqual(sorted);
  });

  it('SELF-CRITIQUE appears BEFORE OUTPUT FORMAT', () => {
    const critique = out.indexOf('## SELF-CRITIQUE');
    const output = out.indexOf('## OUTPUT FORMAT');
    expect(critique).toBeGreaterThan(0);
    expect(output).toBeGreaterThan(critique);
  });

  it('partials are resolved (no {{> name}} markers remain)', () => {
    expect(out).not.toMatch(/\{\{>\s*\S+\s*\}\}/);
    expect(out).not.toContain('[MISSING PARTIAL:');
  });

  it('all variables are resolved (no {{var}} placeholders remain)', () => {
    expect(out).not.toMatch(/\{\{\w+\}\}/);
  });

  it('text overlap rules appear EXACTLY ONCE in the rendered prompt', () => {
    // After T1.2 dedupe, the "redundancy with captions" rule is in
    // rules-no-text-redundancy.md only; rules-text-duplication.md keeps
    // text-card style rules. Unique heading markers must occur once.
    // (We match the heading prefix, not the inline cross-ref prose.)
    const noRedundancyHeading = '## CRITICAL: NO TEXT REDUNDANCY';
    const cardStyleHeading = '## TEXT-CARD STYLE';
    expect(occurrences(out, noRedundancyHeading)).toBe(1);
    expect(occurrences(out, cardStyleHeading)).toBe(1);
  });

  it('length is within sane bounds', () => {
    // Empirical: 35-50k chars with mock manifest. <10k = something is missing,
    // >100k = something is duplicating into the prompt.
    expect(out.length).toBeGreaterThan(10_000);
    expect(out.length).toBeLessThan(100_000);
  });
});

describe('composer prompt — structural invariants', () => {
  const out = buildComposerPrompt(mockAssets);

  it('lists every provided asset', () => {
    for (const a of mockAssets) {
      expect(out).toContain(a.id);
      expect(out).toContain(a.description);
    }
  });

  it('partials and variables are fully resolved', () => {
    expect(out).not.toMatch(/\{\{>\s*\S+\s*\}\}/);
    expect(out).not.toMatch(/\{\{\w+\}\}/);
    expect(out).not.toContain('[MISSING PARTIAL:');
  });
});

describe('revision prompt — structural invariants', () => {
  const out = buildRevisionPrompt(mockPlan, 'tighten pacing on shot 3', mockManifest);

  it('embeds the original plan as JSON', () => {
    expect(out).toContain('"id": "shot-1"');
    expect(out).toContain('"laptop desk"');
  });

  it('embeds the director note', () => {
    expect(out).toContain('tighten pacing on shot 3');
  });

  it('partials and variables are fully resolved', () => {
    expect(out).not.toMatch(/\{\{>\s*\S+\s*\}\}/);
    expect(out).not.toMatch(/\{\{\w+\}\}/);
  });
});

// ── 3. Guidelines snapshot (all 21) ────────────────────────────

const GUIDELINE_NAMES = [
  'flux',
  'gpt-image',
  'hailuo',
  'heygen-agent',
  'heygen',
  'hunyuan',
  'ideogram',
  'kling',
  'ltx',
  'luma',
  'nanobanana',
  'pexels',
  'pika',
  'qwen-image',
  'recraft',
  'runway',
  'seedance',
  'seedream',
  'sora',
  'veo3',
  'wan',
] as const;

describe('guidelines — content snapshot', () => {
  for (const name of GUIDELINE_NAMES) {
    it(`guidelines/${name}.md matches snapshot`, () => {
      const raw = loadGuideline(name);
      expect(raw).not.toBe('');
      expect(raw).toMatchSnapshot();
    });
  }

  it('every generative guideline mentions an aspect ratio or "ratios"', () => {
    // Quality bar from T3 audit: every guideline that generates pixels must
    // give the LLM information about output dimensions.
    // Exempt: scripting tools (heygen) and search/registry tools (pexels).
    const exempt = new Set(['heygen', 'pexels']);
    for (const name of GUIDELINE_NAMES) {
      if (exempt.has(name)) continue;
      const raw = loadGuideline(name).toLowerCase();
      const mentionsRatio =
        raw.includes('aspect rat') ||
        raw.includes('9:16') ||
        raw.includes('16:9') ||
        raw.includes('1:1') ||
        raw.includes('1024x') ||
        raw.includes('1024×');
      expect(mentionsRatio, `${name}.md must declare aspect ratio support`).toBe(true);
    }
  });
});

// ── 4. Partials snapshot (all 5) ────────────────────────────────

const PARTIAL_NAMES = [
  'rules-broll',
  'rules-hook',
  'rules-no-text-redundancy',
  'rules-retention',
  'rules-text-duplication',
] as const;

describe('partials — content snapshot', () => {
  for (const name of PARTIAL_NAMES) {
    it(`partials/${name}.md matches snapshot`, () => {
      const raw = loadPartial(name);
      expect(raw).not.toBe('');
      expect(raw).toMatchSnapshot();
    });
  }

  it('rules-text-duplication is dedupe-compliant: holds NO caption-redundancy rule', () => {
    // After T1.2: this partial must contain only text-card style rules.
    // The caption-redundancy rule lives exclusively in rules-no-text-redundancy.
    const raw = loadPartial('rules-text-duplication');
    expect(raw).toContain('TEXT-CARD STYLE');
    expect(raw).not.toMatch(/captions.*every.*word/i);
  });
});

// ── 5. renderPrompt round-trip (smoke) ──────────────────────────

describe('renderPrompt smoke — every static template renders without errors', () => {
  for (const name of STATIC_TEMPLATES) {
    it(`renderPrompt('${name}') returns non-empty content`, () => {
      const out = renderPrompt(name, {});
      expect(out).not.toBe('');
      expect(out.length).toBeGreaterThan(50);
    });
  }
});

// ── helpers ────────────────────────────────────────────────────

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}
