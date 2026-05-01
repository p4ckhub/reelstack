/**
 * HF cards public API.
 *
 *   buildHfCardBlock(input)     — generic dispatcher (slug + palette + data).
 *   buildHfEndCardBlock(ec, td) — backwards-compat shim for the legacy
 *                                 `EndCardConfig` shape used by all module
 *                                 orchestrators today.
 *   registerHfCard(slug, build) — entry point used by the private modules
 *                                 overlay to add premium card builders.
 *
 * Premium cards live in the private overlay. Public ships a single `text`
 * baseline so the dispatcher always has at least one usable slug.
 */

// Side-effect: register the baseline text card so the registry is never
// empty on a fresh boot (premium cards layer on top via the overlay).
import './cards';

export type {
  CardRenderInput,
  CardBlockOutput,
  CardBuilder,
  CardPalette,
  CardData,
  CardMode,
  Anchor,
} from './types';
export {
  buildHfCardBlock,
  buildHfEndCardBlock,
  resolveEndCardSlug,
  MODE_DEFAULT_CARD_SLUG,
} from './build-hf-card';
export { registerHfCard, getHfCard, listHfCardSlugs, hasHfCard } from './registry';
