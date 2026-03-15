import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob, AssetGenerationStatus } from '../types';

/**
 * Interface for production tools (HeyGen, Veo3, Pexels, etc.).
 * Modeled after TTSProvider from @reelstack/tts.
 */
export interface ProductionTool {
  /** Unique tool identifier (e.g. 'heygen', 'veo3', 'pexels') */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** What this tool can do */
  readonly capabilities: readonly ToolCapability[];

  /**
   * Prompt writing guidelines for the LLM planner.
   * Teach it what makes a good prompt for this specific tool —
   * preferred style, motion descriptions, composition, what to avoid, etc.
   * Included in the planner system prompt only when this tool is available.
   */
  readonly promptGuidelines?: string;

  /** Check if the tool is available (API key valid, service reachable) */
  healthCheck(): Promise<{ available: boolean; reason?: string }>;

  /** Start asset generation */
  generate(request: AssetGenerationRequest): Promise<AssetGenerationJob>;

  /** Poll for async job completion (only for tools with isAsync capability) */
  poll?(jobId: string): Promise<AssetGenerationStatus>;
}
