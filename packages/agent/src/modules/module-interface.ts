/**
 * ReelModule interface — contract for pluggable reel type modules.
 *
 * Each module (n8n-explainer, ai-tips, presenter-explainer, etc.)
 * implements this interface. Modules can live in the same monorepo
 * during development, then be extracted to a separate closed repo
 * for distribution.
 *
 * Core provides: TTS, transcription, storage, rendering, LLM, video gen.
 * Module provides: orchestrator logic, generators, composition + schema.
 */

import type { BrandPreset, WhisperConfig } from '../types';

/** Video runtime — declared per module (or per request via API). */
export type ModuleRuntime = 'remotion' | 'hyperframes';

/** Progress callback passed to module orchestrators */
export type ProgressCallback = (step: string) => void;

/** Base request fields available to all modules */
export interface BaseModuleRequest {
  jobId: string;
  language?: string;
  tts?: {
    provider?: 'edge-tts' | 'elevenlabs' | 'openai' | 'gemini-tts';
    voice?: string;
    language?: string;
  };
  whisper?: WhisperConfig;
  brandPreset?: BrandPreset;
  musicUrl?: string;
  musicVolume?: number;
  onProgress?: ProgressCallback;
}

/** Result returned by module orchestrators */
export interface ModuleResult {
  outputPath: string;
  durationSeconds: number;
  /** Module-specific metadata for logging/debugging */
  meta?: Record<string, unknown>;
}

/**
 * Per-runtime composition implementation. A module ships a `RuntimeImpl`
 * for each runtime it supports — at minimum a composition identifier.
 * Optional `orchestrate` lets a module diverge entirely per runtime when
 * the shared `ReelModule.orchestrate` doesn't fit (rare).
 */
export interface RuntimeImpl {
  /**
   * Composition identifier for this runtime:
   * - `'remotion'` → composition ID registered in Root.tsx (e.g. `'Reel'`)
   * - `'hyperframes'` → path to the HTML composition file
   */
  compositionId: string;

  /**
   * Optional per-runtime orchestrator override. If omitted, the module's
   * shared `orchestrate` is called with `runtime` as the third argument.
   * Used when a runtime needs a fundamentally different pipeline.
   */
  orchestrate?: (
    baseRequest: BaseModuleRequest,
    moduleConfig: Record<string, unknown>
  ) => Promise<ModuleResult>;
}

/**
 * Module descriptor — everything needed to register a reel type module.
 *
 * Modules register themselves via `registerModule()`. The worker and
 * Remotion Root discover modules through the global registry.
 *
 * **Dual-runtime model.** A module declares all runtimes it supports in
 * `runtimes` and a `defaultRuntime`. The worker picks one per request
 * (API param) and passes it to `orchestrate(base, config, runtime)`. The
 * orchestrator routes through `renderVideo(props, _, _, runtime)` so the
 * dispatcher hits the right renderer.
 *
 * **Backward compatibility.** Modules may still set the legacy
 * `runtime` + `compositionId` singletons. `registerModule()` derives
 * `runtimes` and `defaultRuntime` from those when the new fields are
 * omitted, so existing modules don't need a code change to keep working.
 */
export interface ReelModule {
  /** Unique module ID, used as the `mode` in API requests */
  id: string;

  /** Human-readable name */
  name: string;

  /**
   * Runtimes this module supports — keyed by runtime, value is the
   * composition + optional per-runtime orchestrator. New modules should
   * populate this. Legacy modules may omit it and rely on the BC
   * derivation in `registerModule()`.
   */
  runtimes?: Partial<Record<ModuleRuntime, RuntimeImpl>>;

  /**
   * The runtime to use when the API request doesn't specify one. Required
   * once `runtimes` is populated. Legacy modules: derived from `runtime`
   * (or 'remotion' if absent).
   */
  defaultRuntime?: ModuleRuntime;

  /**
   * @deprecated Use `runtimes` + `defaultRuntime` instead. Kept for BC.
   * `registerModule()` mirrors this into `runtimes[runtime].compositionId`
   * when `runtimes` is omitted.
   */
  runtime?: ModuleRuntime;

  /**
   * @deprecated Use `runtimes[runtime].compositionId` instead. Kept for BC.
   * Mirrored into `runtimes` by `registerModule()` when needed.
   */
  compositionId: string;

  /**
   * Module-specific config fields expected in the API request body.
   * Used for documentation and validation.
   */
  configFields: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;

  /**
   * Progress step prefixes mapped to percentage values.
   * Used by the worker to report progress.
   */
  progressSteps: Record<string, number>;

  /**
   * The orchestrator function. Receives raw config from the API request
   * plus base fields (jobId, tts, whisper, brandPreset, etc.) and the
   * runtime selected for this job.
   *
   * Used as fallback for modules that don't expose a multi-step
   * `buildPipeline`. Single-step modules wrap this whole function as one
   * pipeline step — resume from the API can only restart the entire run.
   *
   * Legacy modules may declare a 2-arg signature; the worker will still
   * call them with the runtime as the third argument and TypeScript will
   * (correctly) ignore the extra parameter.
   */
  orchestrate: (
    baseRequest: BaseModuleRequest,
    moduleConfig: Record<string, unknown>,
    runtime?: ModuleRuntime
  ) => Promise<ModuleResult>;

  /**
   * Optional multi-step pipeline definition. When present, the worker
   * runs this through `PipelineEngine.runAll()` instead of wrapping
   * `orchestrate` as a single step. Each step's output is persisted
   * separately, so the API `/resume {fromStepId}` endpoint can replay
   * cheap downstream work (e.g. just the render) without paying for
   * upstream LLM / TTS / screenshot calls again.
   *
   * Receives the same arguments as `orchestrate` — typically returns a
   * PipelineDefinition with steps like `fetch-workflow`, `generate-script`,
   * `capture-screenshot`, `tts-pipeline`, `assemble-props`, `render`.
   *
   * The worker treats `context.results['render'].outputPath` as the final
   * artifact, so the last step's output must include `outputPath: string`.
   */
  buildPipeline?: (
    baseRequest: BaseModuleRequest,
    moduleConfig: Record<string, unknown>,
    runtime?: ModuleRuntime
  ) => import('../orchestrator/pipeline-engine').PipelineDefinition;
}
