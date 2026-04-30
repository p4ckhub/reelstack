/**
 * HF cards public API. Two top-level entrypoints:
 *
 *   buildHfCardBlock(input)     — generic dispatcher (slug + palette + data)
 *   buildHfEndCardBlock(ec, td) — backwards-compat shim for the legacy
 *                                 `EndCardConfig` shape used by all
 *                                 module orchestrators today.
 */

export type {
  CardRenderInput,
  CardBlockOutput,
  CardBuilder,
  CardPalette,
  CardData,
  CardMode,
  Anchor,
} from './types';
export { buildHfCardBlock, buildHfEndCardBlock } from './build-hf-card';
export { CARD_BUILDERS, REGISTERED_SLUGS } from './cards/index';
