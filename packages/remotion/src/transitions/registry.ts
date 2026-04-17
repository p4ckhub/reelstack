/**
 * Transition + transition-pack registries.
 *
 * Packs are manifests referencing transition slugs — same transition
 * can appear in multiple packs. Access is gated via Module table
 * (kind: TRANSITION_PACK) just like card packs.
 */

import type { RegisteredTransition, TransitionPackManifest } from './types';

const TRANSITIONS = new Map<string, RegisteredTransition>();
const PACKS = new Map<string, TransitionPackManifest>();

// ── Transitions ────────────────────────────────────────────────────

export function registerTransition(t: RegisteredTransition): void {
  if (TRANSITIONS.has(t.metadata.slug)) {
    throw new Error(`Transition "${t.metadata.slug}" is already registered`);
  }
  TRANSITIONS.set(t.metadata.slug, t);
}

export function getTransition(slug: string): RegisteredTransition | undefined {
  return TRANSITIONS.get(slug);
}

export function listTransitions(): RegisteredTransition[] {
  return Array.from(TRANSITIONS.values());
}

// ── Packs ──────────────────────────────────────────────────────────

export function registerTransitionPack(manifest: TransitionPackManifest): void {
  if (PACKS.has(manifest.slug)) {
    throw new Error(`Transition pack "${manifest.slug}" is already registered`);
  }
  PACKS.set(manifest.slug, manifest);
}

export function getTransitionPack(slug: string): TransitionPackManifest | undefined {
  return PACKS.get(slug);
}

export function listTransitionPacks(): TransitionPackManifest[] {
  return Array.from(PACKS.values());
}

export function listTransitionsForPack(packSlug: string): RegisteredTransition[] {
  const pack = PACKS.get(packSlug);
  if (!pack) return [];
  return pack.transitions
    .map((slug) => TRANSITIONS.get(slug))
    .filter((t): t is RegisteredTransition => t !== undefined);
}

export function getPacksContainingTransition(transitionSlug: string): TransitionPackManifest[] {
  return listTransitionPacks().filter((p) => p.transitions.includes(transitionSlug));
}
