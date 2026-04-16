import type React from 'react';

export interface HighlightStyleOpts {
  color: string;
  fontSize: number;
  padding: number;
  borderRadius: number;
}

export interface HighlightModeRenderer {
  id: string;
  /** CSS for the currently-highlighted word. */
  activeStyle: (opts: HighlightStyleOpts) => React.CSSProperties;
  /**
   * CSS for *every* word, active or not. Needed to pre-reserve the same
   * layout footprint that the active word will occupy (padding, margins,
   * borders, display-type). Without this, the whole line shifts each
   * time the active token moves, which reads as jitter. Defaults to an
   * empty style when not provided.
   */
  baseStyle?: (opts: HighlightStyleOpts) => React.CSSProperties;
}

// ── Built-in modes (no registry, no side effects — webpack-safe) ─────

const BUILT_IN_MODES: Record<string, HighlightModeRenderer> = {
  text: {
    id: 'text',
    activeStyle: () => ({}), // text mode just uses seg.color from renderAnimatedCaption
  },
};

// ── Dynamic registry for private/plugin modes ────────────────────────

const CUSTOM_MODES = new Map<string, HighlightModeRenderer>();

export function registerHighlightMode(mode: HighlightModeRenderer): void {
  CUSTOM_MODES.set(mode.id, mode);
}

export function getHighlightMode(id: string): HighlightModeRenderer | undefined {
  return BUILT_IN_MODES[id] ?? CUSTOM_MODES.get(id);
}

export function listHighlightModes(): string[] {
  return [...Object.keys(BUILT_IN_MODES), ...Array.from(CUSTOM_MODES.keys())];
}
