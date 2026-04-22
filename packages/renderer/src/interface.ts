/**
 * Runtime-agnostic renderer contract.
 *
 * Each renderer wraps a specific video engine (Remotion, Hyperframes,
 * future ones). Modules declare which runtime they target; the
 * dispatcher picks the right renderer at queue-dispatch time.
 *
 * Note: we intentionally do NOT define an IR/DSL here. A generic
 * `{ composition, variables }` shape is enough — each renderer knows
 * what to do with its own composition identifier (Remotion ID vs HF
 * HTML path) and variables shape.
 */

/** Runtimes we support. Modules declare one of these. */
export type Runtime = 'remotion' | 'hyperframes';

/** Renderer input — composition identifier + variables. Shape is stable
 *  across runtimes; meaning of `composition` depends on the runtime:
 *  - Remotion: composition ID registered in Root.tsx (e.g. "Reel")
 *  - Hyperframes: path to the HTML composition file */
export interface RenderInput {
  readonly composition: string;
  readonly variables: Record<string, unknown>;
}

export interface RenderOptions {
  readonly outputPath: string;
  readonly codec?: 'h264' | 'h265';
  /** Parallel frame rendering threads (Remotion-specific; Hyperframes
   *  ignores). Default: 50% of CPU cores. */
  readonly concurrency?: number;
}

export interface RenderResult {
  readonly outputPath: string;
  readonly sizeBytes: number;
  readonly durationMs: number;
}

export interface Renderer {
  readonly runtime: Runtime;
  render(input: RenderInput, options: RenderOptions): Promise<RenderResult>;
}
