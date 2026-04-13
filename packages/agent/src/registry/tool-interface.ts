import type {
  ToolCapability,
  AssetGenerationRequest,
  AssetGenerationJob,
  AssetGenerationStatus,
} from '../types';

/**
 * Interface for production tools (HeyGen, Veo3, Pexels, etc.).
 * Modeled after TTSProvider from @reelstack/tts.
 */
export interface ToolPricing {
  /** Fixed cost per generation (e.g. $0.15 per video) */
  readonly perRequest?: number;
  /** Cost per second of output (e.g. $0.10/s for video) */
  readonly perSecond?: number;
}

export interface ProductionTool {
  /** Unique tool identifier (e.g. 'heygen', 'veo3', 'pexels') */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** What this tool can do */
  readonly capabilities: readonly ToolCapability[];

  /**
   * Self-declared pricing. When present, calculateToolCost() uses this
   * instead of the static TOOL_PRICING table. New tools should always
   * declare pricing here — the static table is legacy fallback only.
   */
  readonly pricing?: ToolPricing;

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
