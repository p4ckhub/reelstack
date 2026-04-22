import type { Renderer, Runtime, RenderInput, RenderOptions, RenderResult } from './interface';

/**
 * Picks the right Renderer for each module's declared runtime.
 *
 * Usage:
 *
 *     const dispatcher = new RendererDispatcher();
 *     dispatcher.register(new RemotionRendererAdapter());
 *     dispatcher.register(new HyperframesRenderer());
 *     await dispatcher.render('remotion', input, options);
 *
 * Stays boring on purpose — zero smart fallbacks. If a runtime isn't
 * registered, we throw. Call sites know which runtime they're asking for
 * (they read it from the module descriptor), so a missing registration
 * is a config bug, not a user-facing concern.
 */
export class RendererDispatcher {
  private readonly renderers = new Map<Runtime, Renderer>();

  register(renderer: Renderer): this {
    this.renderers.set(renderer.runtime, renderer);
    return this;
  }

  has(runtime: Runtime): boolean {
    return this.renderers.has(runtime);
  }

  get(runtime: Runtime): Renderer {
    const r = this.renderers.get(runtime);
    if (!r) {
      throw new Error(
        `No renderer registered for runtime "${runtime}". ` +
          `Registered: ${[...this.renderers.keys()].join(', ') || '(none)'}`
      );
    }
    return r;
  }

  async render(
    runtime: Runtime,
    input: RenderInput,
    options: RenderOptions
  ): Promise<RenderResult> {
    return this.get(runtime).render(input, options);
  }
}
