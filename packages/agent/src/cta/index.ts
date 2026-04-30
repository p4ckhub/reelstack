export {
  type CtaPlatform,
  type CtaTemplate,
  type EndCardConfig,
  type ResolveEndCardOptions,
  getCtaTemplate,
  resolveEndCard,
} from './cta-templates';
// `buildHfEndCardBlock` moved to `@reelstack/agent` cards namespace
// (see `src/cards/build-hf-card.ts`). Re-export here for callers that
// still import from `cta/`.
export { buildHfEndCardBlock } from '../cards/index';
