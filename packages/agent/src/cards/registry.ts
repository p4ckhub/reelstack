/**
 * Runtime registry for HF card builders.
 *
 * Keeps the dispatcher decoupled from concrete card implementations: the
 * public package ships only the contract + a single baseline card, and the
 * private modules overlay calls `registerHfCard(...)` for every premium
 * card during a side-effect import. This is the same pattern the highlight
 * mode registry uses (`packages/remotion/src/components/highlight-modes.ts`).
 */
import type { CardBuilder } from './types';

const REGISTRY = new Map<string, CardBuilder>();

export function registerHfCard(slug: string, builder: CardBuilder): void {
  REGISTRY.set(slug, builder);
}

export function getHfCard(slug: string): CardBuilder | undefined {
  return REGISTRY.get(slug);
}

export function listHfCardSlugs(): string[] {
  return Array.from(REGISTRY.keys()).sort();
}

export function hasHfCard(slug: string): boolean {
  return REGISTRY.has(slug);
}
