/**
 * Pricing tables for cost calculation.
 *
 * All prices in USD. Updated manually when providers change pricing.
 * Used by LLM calls, tool adapters, and TTS to calculate CostEntry.costUSD.
 */

// ── LLM pricing (per 1M tokens) ──────────────────────────────

interface LLMPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const LLM_PRICING: Record<string, LLMPricing> = {
  // Anthropic
  'claude-opus-4-6': { inputPer1M: 5.0, outputPer1M: 25.0 },
  'claude-sonnet-4-6': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-sonnet-4-5': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-haiku-4-5-20251001': { inputPer1M: 1.0, outputPer1M: 5.0 },
  // OpenRouter (same pricing, different model IDs)
  'anthropic/claude-opus-4.6': { inputPer1M: 5.0, outputPer1M: 25.0 },
  'anthropic/claude-sonnet-4.6': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'anthropic/claude-sonnet-4.5': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'anthropic/claude-haiku-4.5': { inputPer1M: 1.0, outputPer1M: 5.0 },
  // OpenAI
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'openai/gpt-5-mini': { inputPer1M: 0.3, outputPer1M: 1.2 },
  'openai/gpt-5-nano': { inputPer1M: 0.1, outputPer1M: 0.4 },
};

// ── Tool pricing ─────────────────────────────────────────────

interface ToolPricing {
  perRequest?: number;
  perSecond?: number;
}

const TOOL_PRICING: Record<string, ToolPricing> = {
  'veo31-gemini': { perSecond: 0.2 },
  veo3: { perSecond: 0.15 },
  'kling-fal': { perSecond: 0.1 },
  kling: { perSecond: 0.1 },
  'seedance-fal': { perSecond: 0.08 },
  seedance: { perSecond: 0.08 },
  nanobanana: { perRequest: 0.01 },
  pexels: { perRequest: 0 },
  heygen: { perSecond: 0.15 },
  'heygen-agent': { perSecond: 0.0333 },
  humo: { perRequest: 0.1 },
  replicate: { perSecond: 0.05 },
  minimax: { perSecond: 0.08 },
  wavespeed: { perSecond: 0.06 },
  kie: { perSecond: 0.1 },
  // seedance2-kie, seedance2-fast-kie: pricing self-declared on tools (tool.pricing)
  // Veo 3.1 KIE + Seedance 2.0 KIE: pricing self-declared on tools (tool.pricing)
  runway: { perSecond: 0.25 },
  piapi: { perSecond: 0.1 },
  aimlapi: { perSecond: 0.08 },
  'user-upload': { perRequest: 0 },
};

// ── TTS pricing ──────────────────────────────────────────────

interface TTSPricing {
  perChar?: number;
  perRequest?: number;
}

const TTS_PRICING: Record<string, TTSPricing> = {
  'edge-tts': { perRequest: 0 },
  elevenlabs: { perChar: 0.00003 },
  openai: { perChar: 0.000015 },
};

// ── Whisper pricing ──────────────────────────────────────────

const WHISPER_PRICING: Record<string, { perMinute: number }> = {
  cloudflare: { perMinute: 0 },
  openrouter: { perMinute: 0.006 },
  ollama: { perMinute: 0 },
  local: { perMinute: 0 },
};

// ── Public API ───────────────────────────────────────────────

export function calculateLLMCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = LLM_PRICING[model];
  if (!pricing) return 0;
  return (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) / 1_000_000;
}

/**
 * Calculate tool cost. Checks tool-declared pricing first (from registry),
 * then falls back to the static TOOL_PRICING table.
 * New tools should self-declare pricing via ProductionTool.pricing.
 */
export function calculateToolCost(toolId: string, durationSeconds?: number): number {
  // Check tool registry for self-declared pricing
  const toolPricing = getToolPricingFromRegistry(toolId);
  const pricing =
    toolPricing ?? TOOL_PRICING[toolId] ?? TOOL_PRICING[toolId.split('-').pop() ?? ''];
  if (!pricing) return 0;
  if (pricing.perSecond && durationSeconds) return pricing.perSecond * durationSeconds;
  return pricing.perRequest ?? 0;
}

// Lazy reference to tool registry — avoids circular import at module load time.
let registryRef: {
  get(id: string): { pricing?: { perRequest?: number; perSecond?: number } } | undefined;
} | null = null;

/** Set the tool registry reference. Called once from tool-registry.ts after construction. */
export function setToolRegistryRef(registry: typeof registryRef): void {
  registryRef = registry;
}

function getToolPricingFromRegistry(toolId: string): ToolPricing | null {
  const tool = registryRef?.get(toolId);
  return tool?.pricing ?? null;
}

export function calculateTTSCost(provider: string, charCount: number): number {
  const pricing = TTS_PRICING[provider];
  if (!pricing) return 0;
  if (pricing.perChar) return pricing.perChar * charCount;
  return pricing.perRequest ?? 0;
}

export function calculateWhisperCost(provider: string, durationSeconds: number): number {
  const pricing = WHISPER_PRICING[provider];
  if (!pricing) return 0;
  return pricing.perMinute * (durationSeconds / 60);
}
