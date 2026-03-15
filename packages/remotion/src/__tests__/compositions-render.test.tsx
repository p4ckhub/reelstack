/**
 * Smoke tests: every Remotion composition renders without crashing.
 *
 * Uses renderToString with mocked Remotion hooks. These tests are intentionally
 * lightweight — they don't validate pixel output, only that the React tree
 * can be constructed without a runtime error (e.g. undefined.layout, missing
 * required props, etc.).
 *
 * Core compositions are tested with explicit props.
 * Module compositions (n8n-explainer, ai-tips, presenter-explainer) live in
 * @reelstack/modules and are NOT tested here — they have their own test suite.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

// ── Mock Remotion ─────────────────────────────────────────────
vi.mock('remotion', () => ({
  useCurrentFrame: () => 0,
  useVideoConfig: () => ({ fps: 30, durationInFrames: 300, width: 1080, height: 1920, id: 'Test' }),
  AbsoluteFill: ({
    children,
    style,
  }: {
    children?: React.ReactNode;
    style?: React.CSSProperties;
  }) => React.createElement('div', { style }, children),
  Audio: () => null,
  Sequence: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  Img: ({ src, style }: { src?: string; style?: React.CSSProperties }) =>
    React.createElement('img', { src, style }),
  OffthreadVideo: ({ src, style }: { src?: string; style?: React.CSSProperties }) =>
    React.createElement('video', { src, style }),
  interpolate: (value: number, input: number[], output: number[]) => {
    if (input.length < 2 || output.length < 2) return output[0] ?? 0;
    const t = (value - input[0]) / (input[input.length - 1] - input[0]);
    return output[0] + t * (output[output.length - 1] - output[0]);
  },
  random: (_seed?: string | number) => 0.5,
  staticFile: (s: string) => s,
  spring: () => 1,
  noise2D: () => 0,
  Easing: { bezier: () => (t: number) => t, linear: (t: number) => t },
}));

// ── Core composition sample props ─────────────────────────────

const sampleCues = [
  { id: '1', text: 'Hello world', startTime: 0, endTime: 2 },
  { id: '2', text: 'This is a test', startTime: 2, endTime: 5 },
];

const sampleReelProps = {
  layout: 'fullscreen' as const,
  primaryVideoUrl: 'https://cdn.example.com/primary.mp4',
  cues: sampleCues,
  bRollSegments: [],
  speedRamps: [],
  durationSeconds: 10,
  showProgressBar: false,
  backgroundColor: '#000000',
};

// ── Tests ──────────────────────────────────────────────────────

describe('Core composition smoke tests', () => {
  it('ReelComposition renders without crashing', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    expect(() =>
      renderToString(React.createElement(ReelComposition, sampleReelProps as never))
    ).not.toThrow();
  });
});

// ── anchor-bottom layout tests ────────────────────────────────

const sampleBRollSegments = [
  {
    startTime: 0,
    endTime: 3,
    media: { url: 'https://cdn.example.com/broll.mp4', type: 'video' as const },
  },
  {
    startTime: 3,
    endTime: 6,
    media: { url: 'https://cdn.example.com/broll2.jpg', type: 'image' as const },
  },
];

const anchorBottomBaseProps = {
  ...sampleReelProps,
  layout: 'anchor-bottom' as const,
};

describe('anchor-bottom layout', () => {
  it('renders anchor-bottom layout without crashing', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    expect(() =>
      renderToString(React.createElement(ReelComposition, anchorBottomBaseProps as never))
    ).not.toThrow();
  });

  it('anchor-bottom layout has two main areas', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const html = renderToString(
      React.createElement(ReelComposition, anchorBottomBaseProps as never)
    );

    // Bottom area: talking head with height 45%
    expect(html).toContain('height:45%');
    // Top area: dynamic content with height 55%
    expect(html).toContain('height:55%');
  });

  it('anchor-bottom layout renders b-roll in content area', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const propsWithBRoll = {
      ...anchorBottomBaseProps,
      bRollSegments: sampleBRollSegments,
    };
    const html = renderToString(React.createElement(ReelComposition, propsWithBRoll as never));

    // Content area (55%) present
    expect(html).toContain('height:55%');
    // B-roll media URL rendered inside content area (via BRollCutaway)
    expect(html).toContain('broll.mp4');
  });

  it('anchor-bottom layout renders captions', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const propsWithCues = {
      ...anchorBottomBaseProps,
      cues: sampleCues,
    };
    const html = renderToString(React.createElement(ReelComposition, propsWithCues as never));

    // CaptionOverlay renders the active cue text into the DOM (frame 0 → first cue)
    expect(html).toContain('Hello world');
  });
});

// ── Hybrid-anchor layout tests ────────────────────────────────

const makeBRollSegment = (overrides: Record<string, unknown> = {}) => ({
  startTime: 0,
  endTime: 5,
  media: { url: 'https://cdn.example.com/broll.mp4', type: 'video' as const },
  ...overrides,
});

describe('Hybrid-anchor layout', () => {
  it('renders hybrid-anchor layout without crashing', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const props = {
      ...sampleReelProps,
      layout: 'hybrid-anchor' as const,
      bRollSegments: [makeBRollSegment()],
    };
    expect(() =>
      renderToString(React.createElement(ReelComposition, props as never))
    ).not.toThrow();
  });

  it('hybrid-anchor defaults to head mode (no b-roll overlay)', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const props = {
      ...sampleReelProps,
      layout: 'hybrid-anchor' as const,
      bRollSegments: [makeBRollSegment()],
    };
    // Frame 0, no shotLayout → head (presenter) shot, b-roll NOT overlaid
    const html = renderToString(React.createElement(ReelComposition, props as never));
    // No 45% split (not split mode), no b-roll media in output
    expect(html).not.toContain('height:45%');
    // Should not contain b-roll URL since it's a head/presenter shot
    expect(html).not.toContain('broll.mp4');
  });

  it('hybrid-anchor content mode shows b-roll overlay', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const props = {
      ...sampleReelProps,
      layout: 'hybrid-anchor' as const,
      bRollSegments: [makeBRollSegment({ shotLayout: 'content' })],
    };
    // Frame 0, shotLayout='content' → b-roll IS overlaid
    const html = renderToString(React.createElement(ReelComposition, props as never));
    // No 45% split
    expect(html).not.toContain('height:45%');
    // B-roll content should be rendered
    expect(html).toContain('broll.mp4');
  });

  it('hybrid-anchor with legacy shotLayout=fullscreen maps to content mode', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const props = {
      ...sampleReelProps,
      layout: 'hybrid-anchor' as const,
      bRollSegments: [makeBRollSegment({ shotLayout: 'fullscreen' })],
    };
    // Legacy 'fullscreen' → 'content', b-roll IS overlaid
    const html = renderToString(React.createElement(ReelComposition, props as never));
    expect(html).toContain('broll.mp4');
  });

  it('hybrid-anchor split mode renders anchor-bottom style', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const props = {
      ...sampleReelProps,
      layout: 'hybrid-anchor' as const,
      bRollSegments: [makeBRollSegment({ shotLayout: 'split' })],
    };
    const html = renderToString(React.createElement(ReelComposition, props as never));
    // Split mode renders 45% height for head area
    expect(html).toContain('height:45%');
    // And 55% for content area
    expect(html).toContain('height:55%');
    // B-roll content rendered in the content area
    expect(html).toContain('broll.mp4');
    // Has the split content testid
    expect(html).toContain('data-testid="hybrid-split-content"');
  });

  it('hybrid-anchor montage mode renders multi-panel', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const props = {
      ...sampleReelProps,
      layout: 'hybrid-anchor' as const,
      bRollSegments: [
        makeBRollSegment({
          shotLayout: 'montage',
          media: {
            url: '#000000',
            type: 'multi-panel' as const,
            panels: [
              { url: 'https://cdn.example.com/panel1.mp4', type: 'video' as const },
              { url: 'https://cdn.example.com/panel2.mp4', type: 'video' as const },
              { url: 'https://cdn.example.com/panel3.mp4', type: 'video' as const },
            ],
          },
        }),
      ],
    };
    const html = renderToString(React.createElement(ReelComposition, props as never));
    // Dark background overlay present
    expect(html).toContain('rgba(0,0,0,0.85)');
    // Multi-panel montage rendered with testid
    expect(html).toContain('data-testid="multi-panel-montage"');
    // All panel URLs rendered
    expect(html).toContain('panel1.mp4');
    expect(html).toContain('panel2.mp4');
    expect(html).toContain('panel3.mp4');
  });

  it('hybrid-anchor montage falls back to single media when no panels', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const props = {
      ...sampleReelProps,
      layout: 'hybrid-anchor' as const,
      bRollSegments: [makeBRollSegment({ shotLayout: 'montage' })],
    };
    const html = renderToString(React.createElement(ReelComposition, props as never));
    // Dark overlay present
    expect(html).toContain('rgba(0,0,0,0.85)');
    // Falls back to single media (b-roll URL rendered directly, no multi-panel)
    expect(html).toContain('broll.mp4');
    expect(html).not.toContain('data-testid="multi-panel-montage"');
  });
});

// ── MultiPanelMontage standalone tests ────────────────────────

describe('MultiPanelMontage', () => {
  it('renders correct number of panels', async () => {
    const { MultiPanelMontage } = await import('../components/MultiPanelMontage');
    const panels = [
      { url: 'https://cdn.example.com/a.mp4', type: 'video' as const },
      { url: 'https://cdn.example.com/b.mp4', type: 'video' as const },
      { url: 'https://cdn.example.com/c.jpg', type: 'image' as const },
    ];
    const html = renderToString(React.createElement(MultiPanelMontage, { panels, startFrame: 0 }));
    // All 3 panel media URLs present
    expect(html).toContain('a.mp4');
    expect(html).toContain('b.mp4');
    expect(html).toContain('c.jpg');
    // Has the montage testid
    expect(html).toContain('data-testid="multi-panel-montage"');
  });

  it('renders both video and image panel types', async () => {
    const { MultiPanelMontage } = await import('../components/MultiPanelMontage');
    const panels = [
      { url: 'https://cdn.example.com/vid.mp4', type: 'video' as const },
      { url: 'https://cdn.example.com/img.jpg', type: 'image' as const },
    ];
    const html = renderToString(React.createElement(MultiPanelMontage, { panels, startFrame: 0 }));
    // Video rendered as <video> element
    expect(html).toContain('vid.mp4');
    // Image rendered as <img> element
    expect(html).toContain('img.jpg');
  });
});

// ── Comparison-split layout tests ────────────────────────────

const comparisonSplitBaseProps = {
  ...sampleReelProps,
  layout: 'comparison-split' as const,
  bRollSegments: [],
};

describe('comparison-split layout', () => {
  it('renders comparison-split layout without crashing', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    expect(() =>
      renderToString(React.createElement(ReelComposition, comparisonSplitBaseProps as never))
    ).not.toThrow();
  });

  it('comparison-split has left and right panels', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const props = {
      ...comparisonSplitBaseProps,
      bRollSegments: [
        {
          startTime: 0,
          endTime: 5,
          media: { url: 'https://cdn.example.com/left.mp4', type: 'video' as const },
          panel: 'left' as const,
        },
        {
          startTime: 0,
          endTime: 5,
          media: { url: 'https://cdn.example.com/right.mp4', type: 'video' as const },
          panel: 'right' as const,
        },
      ],
    };
    const html = renderToString(React.createElement(ReelComposition, props as never));

    // Both panels render with 50% width
    expect(html).toContain('width:50%');
    // Left panel content
    expect(html).toContain('left.mp4');
    // Right panel content
    expect(html).toContain('right.mp4');
    // Divider present
    expect(html).toContain('data-testid="comparison-divider"');
  });

  it('comparison-split shows VS badge when both panels active', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const props = {
      ...comparisonSplitBaseProps,
      bRollSegments: [
        {
          startTime: 0,
          endTime: 5,
          media: { url: 'https://cdn.example.com/a.mp4', type: 'video' as const },
          panel: 'left' as const,
        },
        {
          startTime: 0,
          endTime: 5,
          media: { url: 'https://cdn.example.com/b.mp4', type: 'video' as const },
          panel: 'right' as const,
        },
      ],
    };
    // Frame 0, currentTime = 0 → both segments active → VS badge visible
    const html = renderToString(React.createElement(ReelComposition, props as never));
    expect(html).toContain('data-testid="vs-badge"');
    expect(html).toContain('VS');
  });

  it('comparison-split hides VS badge when only one panel active', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const props = {
      ...comparisonSplitBaseProps,
      bRollSegments: [
        {
          startTime: 0,
          endTime: 5,
          media: { url: 'https://cdn.example.com/a.mp4', type: 'video' as const },
          panel: 'left' as const,
        },
        // Right panel starts later — not active at frame 0
        {
          startTime: 3,
          endTime: 5,
          media: { url: 'https://cdn.example.com/b.mp4', type: 'video' as const },
          panel: 'right' as const,
        },
      ],
    };
    const html = renderToString(React.createElement(ReelComposition, props as never));
    expect(html).not.toContain('data-testid="vs-badge"');
  });

  it('comparison-split defaults panel to left when not specified', async () => {
    const { ReelComposition } = await import('../compositions/ReelComposition');
    const props = {
      ...comparisonSplitBaseProps,
      bRollSegments: [
        // No panel specified — should default to left
        {
          startTime: 0,
          endTime: 5,
          media: { url: 'https://cdn.example.com/default.mp4', type: 'video' as const },
        },
      ],
    };
    const html = renderToString(React.createElement(ReelComposition, props as never));
    // Content renders in the left panel (first 50% div)
    expect(html).toContain('default.mp4');
    // No VS badge (only left panel has content)
    expect(html).not.toContain('data-testid="vs-badge"');
  });
});
