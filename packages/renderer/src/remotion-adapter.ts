/**
 * Adapter that exposes the existing `@reelstack/remotion` createRenderer()
 * (LocalRenderer / LambdaRenderer) through the runtime-agnostic Renderer
 * contract.
 *
 * This is pure delegation — zero new logic. When `REMOTION_RENDERER=lambda`
 * is set, the inner factory returns the Lambda impl; otherwise Local.
 */

import type { Renderer, RenderInput, RenderOptions, RenderResult } from './interface';

// Dynamic import so @reelstack/renderer can load without forcing
// @reelstack/remotion as a hard runtime dependency (it's declared as a
// peerDependency; callers that need Remotion install it separately).
type RemotionRendererLike = {
  render(
    props: Record<string, unknown>,
    options: {
      outputPath: string;
      codec?: 'h264' | 'h265';
      concurrency?: number;
      compositionId?: string;
    }
  ): Promise<RenderResult>;
};

export class RemotionRendererAdapter implements Renderer {
  readonly runtime = 'remotion' as const;

  private inner?: RemotionRendererLike;

  constructor(private readonly factory?: () => RemotionRendererLike) {}

  async render(input: RenderInput, options: RenderOptions): Promise<RenderResult> {
    if (!this.inner) {
      if (this.factory) {
        this.inner = this.factory();
      } else {
        // Subpath import — @reelstack/remotion's main is the registerRoot
        // entrypoint (Remotion's expectation), so we reach into /render for
        // the factory.
        const mod = (await import('@reelstack/remotion/render')) as {
          createRenderer: () => RemotionRendererLike;
        };
        this.inner = mod.createRenderer();
      }
    }
    return this.inner.render(input.variables, {
      outputPath: options.outputPath,
      codec: options.codec,
      concurrency: options.concurrency,
      compositionId: input.composition,
    });
  }
}
