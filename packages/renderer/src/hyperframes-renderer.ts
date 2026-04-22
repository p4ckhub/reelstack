/**
 * Hyperframes renderer — stub for Faza 19.A.
 *
 * Real implementation lands in Faza 19.B (the harness package
 * `packages/hyperframes/`). This stub exists so the dispatcher can be
 * registered today, module declarations can use `runtime: 'hyperframes'`,
 * and integration tests exercise the runtime branching.
 *
 * When B ships, we'll either:
 *   - replace this file with a thin re-export from `@reelstack/hyperframes`, or
 *   - move the subprocess-spawning implementation here (TBD based on
 *     dependency weight).
 */

import type { Renderer, RenderInput, RenderOptions, RenderResult } from './interface';

export class HyperframesRenderer implements Renderer {
  readonly runtime = 'hyperframes' as const;

  async render(_input: RenderInput, _options: RenderOptions): Promise<RenderResult> {
    throw new Error(
      'HyperframesRenderer is not yet implemented. Faza 19.B ships the harness; ' +
        'until then only `runtime: "remotion"` modules can render.'
    );
  }
}
