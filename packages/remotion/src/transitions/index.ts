/**
 * Public Transitions API.
 *
 * Packs (private or public) import from here to register transitions.
 * Compositions + orchestrators import from here to resolve transitions
 * by slug and plug the returned presentation into <TransitionSeries>.
 *
 * Re-exports @remotion/transitions primitives for convenience.
 */

export type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
  PresentationDirection,
  TransitionInvocationProps,
  TransitionMetadata,
  TransitionFactory,
  RegisteredTransition,
  TransitionPackManifest,
} from './types';

export {
  registerTransition,
  getTransition,
  listTransitions,
  registerTransitionPack,
  getTransitionPack,
  listTransitionPacks,
  listTransitionsForPack,
  getPacksContainingTransition,
} from './registry';

// Re-export Remotion's primitives for orchestrators
export { TransitionSeries, linearTiming, springTiming } from '@remotion/transitions';
