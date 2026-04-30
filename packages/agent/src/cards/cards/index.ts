/**
 * Card registry — maps slug → builder. The dispatcher
 * (`build-hf-card.ts`) uses this map. Add new cards by creating a
 * builder file in this directory and registering it here.
 *
 * 27 cards ported from Remotion's library: see
 * `reelstack-modules/src/cards/library/cards/`.
 */

import type { CardBuilder } from '../types';
import { buildShimmerCard } from './shimmer';
import { buildGlitchCard } from './glitch';
import { buildTypewriterCard } from './typewriter';
import { buildBurstCard } from './burst';
import { buildLiquidCard } from './liquid';
import { buildFlipCard } from './flip';
import { buildGlitchBlastCard } from './glitch-blast';
import { buildSlotMachineCard } from './slot-machine';
import { buildSplitRevealCard } from './split-reveal';
import { buildSpotlightCard } from './spotlight';
import { buildWarpSpeedCard } from './warp-speed';
import { buildRetroVhsCard } from './retro-vhs';
import { buildThreeDFrameCard } from './3d-frame';
import { buildSubscribeBellCard } from './subscribe-bell';
import { buildPortalCard } from './portal';
import { buildWaveTextCard } from './wave-text';
import { buildChromaticPulseCard } from './chromatic-pulse';
import { buildNeonSignCard } from './neon-sign';
import { buildInkSplashCard } from './ink-splash';
import { buildStampSlamCard } from './stamp-slam';
import { buildNeonCircuitCard } from './neon-circuit';
import { buildStatCard } from './stat-card';
import { buildHologramCard } from './hologram';
import { buildBeatPulseCard } from './beat-pulse';
import { buildQuoteCard } from './quote-card';
import { buildCountdownPunchCard } from './countdown-punch';
import { buildEmojiBurstCard } from './emoji-burst';

export const CARD_BUILDERS: Record<string, CardBuilder> = {
  shimmer: buildShimmerCard,
  glitch: buildGlitchCard,
  typewriter: buildTypewriterCard,
  burst: buildBurstCard,
  liquid: buildLiquidCard,
  flip: buildFlipCard,
  'glitch-blast': buildGlitchBlastCard,
  'slot-machine': buildSlotMachineCard,
  'split-reveal': buildSplitRevealCard,
  spotlight: buildSpotlightCard,
  'warp-speed': buildWarpSpeedCard,
  'retro-vhs': buildRetroVhsCard,
  '3d-frame': buildThreeDFrameCard,
  'subscribe-bell': buildSubscribeBellCard,
  portal: buildPortalCard,
  'wave-text': buildWaveTextCard,
  'chromatic-pulse': buildChromaticPulseCard,
  'neon-sign': buildNeonSignCard,
  'ink-splash': buildInkSplashCard,
  'stamp-slam': buildStampSlamCard,
  'neon-circuit': buildNeonCircuitCard,
  'stat-card': buildStatCard,
  hologram: buildHologramCard,
  'beat-pulse': buildBeatPulseCard,
  'quote-card': buildQuoteCard,
  'countdown-punch': buildCountdownPunchCard,
  'emoji-burst': buildEmojiBurstCard,
};

export const REGISTERED_SLUGS = Object.keys(CARD_BUILDERS);
