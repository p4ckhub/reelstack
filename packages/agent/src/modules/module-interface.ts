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

import type { BrandPreset } from '../types';

/** Progress callback passed to module orchestrators */
export type ProgressCallback = (step: string) => void;

/** Base request fields available to all modules */
export interface BaseModuleRequest {
  jobId: string;
  language?: string;
  tts?: {
    provider?: 'edge-tts' | 'elevenlabs' | 'openai';
    voice?: string;
    language?: string;
  };
  whisper?: {
    provider?: 'openrouter' | 'cloudflare' | 'ollama';
    apiKey?: string;
  };
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
 * Module descriptor — everything needed to register a reel type module.
 *
 * Modules register themselves via `registerModule()`. The worker and
 * Remotion Root discover modules through the global registry.
 */
export interface ReelModule {
  /** Unique module ID, used as the `mode` in API requests */
  id: string;

  /** Human-readable name */
  name: string;

  /** Remotion composition ID (must match what's registered in Root.tsx) */
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
   * plus base fields (jobId, tts, whisper, brandPreset, etc.).
   *
   * The module is responsible for:
   * 1. Parsing its specific config fields
   * 2. Running its pipeline (generators, LLM calls, etc.)
   * 3. Calling core services (TTS, render) via imports from @reelstack/agent
   * 4. Returning the rendered video path
   */
  orchestrate: (
    baseRequest: BaseModuleRequest,
    moduleConfig: Record<string, unknown>,
  ) => Promise<ModuleResult>;
}
