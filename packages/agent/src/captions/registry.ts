/**
 * Runtime registry for HF caption preset builders. Same pattern as the
 * HF card registry — public ships the contract + a baseline (`text`),
 * private overlay calls `registerHfCaptionPreset(...)` for every
 * premium look during a side-effect import.
 */
import type { CaptionPresetBuilder } from './types';

const REGISTRY = new Map<string, CaptionPresetBuilder>();

export function registerHfCaptionPreset(slug: string, builder: CaptionPresetBuilder): void {
  REGISTRY.set(slug, builder);
}

export function getHfCaptionPreset(slug: string): CaptionPresetBuilder | undefined {
  return REGISTRY.get(slug);
}

export function listHfCaptionPresets(): string[] {
  return Array.from(REGISTRY.keys()).sort();
}

export function hasHfCaptionPreset(slug: string): boolean {
  return REGISTRY.has(slug);
}
