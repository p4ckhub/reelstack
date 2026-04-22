/**
 * Hyperframes renderer — lazy adapter to the full implementation in
 * `@reelstack/hyperframes` (Faza 19.B).
 *
 * We don't import `@reelstack/hyperframes` at module load time so that
 * callers that never render hyperframes compositions (e.g. the Next.js
 * API process, which only enqueues jobs) don't pay the cost of loading
 * the hyperframes CLI subtree. Workers that actually render hit the
 * dynamic import on first use.
 */

import type { Renderer, RenderInput, RenderOptions, RenderResult } from './interface';

export class HyperframesRenderer implements Renderer {
  readonly runtime = 'hyperframes' as const;

  private inner?: Renderer;

  async render(input: RenderInput, options: RenderOptions): Promise<RenderResult> {
    if (!this.inner) {
      const mod = (await import('@reelstack/hyperframes')) as {
        HyperframesRenderer: new () => Renderer;
      };
      this.inner = new mod.HyperframesRenderer();
    }
    return this.inner.render(input, options);
  }
}
