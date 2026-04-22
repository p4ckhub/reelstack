export type { Runtime, RenderInput, RenderOptions, RenderResult, Renderer } from './interface';
export { RendererDispatcher } from './dispatcher';
export { RemotionRendererAdapter } from './remotion-adapter';
export { HyperframesRenderer } from './hyperframes-renderer';

import { RendererDispatcher } from './dispatcher';
import { RemotionRendererAdapter } from './remotion-adapter';
import { HyperframesRenderer } from './hyperframes-renderer';

/**
 * Build a dispatcher with both runtimes pre-registered. This is the
 * default for production code paths; tests can build a narrower one.
 */
export function createDispatcher(): RendererDispatcher {
  return new RendererDispatcher()
    .register(new RemotionRendererAdapter())
    .register(new HyperframesRenderer());
}
