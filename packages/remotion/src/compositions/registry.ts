/**
 * Composition registry for ReelStack modules.
 *
 * Modules register their Remotion compositions at import time.
 * Root.tsx reads from the registry to render all module compositions.
 *
 * Core compositions (Reel, YouTubeLongForm) are hardcoded in Root.tsx.
 * Module compositions (ScreenExplainer, VideoClip, PresenterExplainer)
 * register themselves here.
 */

import type { CompositionModule } from './types';

const COMPOSITIONS = new Map<string, CompositionModule>();

/** Register a module composition. Throws if ID already registered. */
export function registerComposition(mod: CompositionModule): void {
  if (COMPOSITIONS.has(mod.id)) {
    throw new Error(`Composition "${mod.id}" is already registered`);
  }
  COMPOSITIONS.set(mod.id, mod);
}

/** Get a composition by ID. */
export function getComposition(id: string): CompositionModule | undefined {
  return COMPOSITIONS.get(id);
}

/** List all registered module compositions. */
export function listCompositions(): CompositionModule[] {
  return Array.from(COMPOSITIONS.values());
}
