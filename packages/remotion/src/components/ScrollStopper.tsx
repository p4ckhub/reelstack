import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type React from 'react';

// ── Registry (public API — private modules register presets) ──

export interface ScrollStopperPresetDef {
  id: string;
  /** Return CSS transform to apply to composition root (zoom, shake, scale) */
  useContentTransform: (frame: number, fps: number, totalFrames: number) => React.CSSProperties;
  /** Return overlay React element (flashes, glitch lines, noise) or null */
  Overlay: React.FC<{ frame: number; totalFrames: number }>;
}

const PRESETS = new Map<string, ScrollStopperPresetDef>();

/** Register a scroll-stopper preset. Called by private modules. */
export function registerScrollStopperPreset(preset: ScrollStopperPresetDef): void {
  PRESETS.set(preset.id, preset);
}

/** Get a registered preset by ID. */
export function getScrollStopperPreset(id: string): ScrollStopperPresetDef | undefined {
  return PRESETS.get(id);
}

/** List all registered preset IDs. */
export function listScrollStopperPresets(): string[] {
  return [...PRESETS.keys()];
}

// ── Content transform hook (used by compositions) ─────────────

interface ScrollStopperConfig {
  preset: string;
  durationSeconds?: number;
}

/**
 * Returns CSS transform to apply to composition root during scroll-stopper intro.
 * If the preset is not registered, returns empty (no-op).
 */
export function useScrollStopperTransform(config?: ScrollStopperConfig): React.CSSProperties {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!config || config.preset === 'none') return {};

  const preset = PRESETS.get(config.preset);
  if (!preset) return {};

  const totalFrames = Math.round((config.durationSeconds ?? 0.5) * fps);
  if (frame >= totalFrames) return {};

  return preset.useContentTransform(frame, fps, totalFrames);
}

// ── Overlay component (used by compositions) ──────────────────

interface ScrollStopperProps {
  readonly preset: string;
  readonly durationSeconds?: number;
}

/**
 * Scroll-stopper visual overlay. Renders registered preset's overlay component.
 * If the preset is not registered, renders nothing.
 */
export const ScrollStopper: React.FC<ScrollStopperProps> = ({ preset, durationSeconds = 0.5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (preset === 'none') return null;

  const presetDef = PRESETS.get(preset);
  if (!presetDef) return null;

  const totalFrames = Math.round(durationSeconds * fps);
  if (frame >= totalFrames) return null;

  return <presetDef.Overlay frame={frame} totalFrames={totalFrames} />;
};
