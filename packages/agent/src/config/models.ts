/**
 * Centralized model configuration for all LLM calls in the agent pipeline.
 *
 * Each role has a default model per provider (Anthropic direct vs OpenRouter).
 * All defaults are overridable via environment variables.
 *
 * To change a model: set the env var (e.g. PLANNER_MODEL=anthropic/claude-opus-4.6)
 * To change ALL models at once: update the defaults here — one file, zero hunting.
 */

// ── Provider detection ───────────────────────────────────────

export type LLMProvider = 'anthropic' | 'openrouter' | 'openai';

export function detectProvider(): LLMProvider | null {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

export function hasOpenRouter(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

// ── Model family constants (single place to update on new releases) ──

const MODELS = {
  // Anthropic direct API IDs
  OPUS: 'claude-opus-4-6',
  SONNET: 'claude-sonnet-4-6',
  HAIKU: 'claude-haiku-4-5-20251001',
  // OpenRouter IDs (uses dots not dashes)
  OR_OPUS: 'anthropic/claude-opus-4.6',
  OR_SONNET: 'anthropic/claude-sonnet-4.6',
  OR_HAIKU: 'anthropic/claude-haiku-4.5',
  // OpenAI
  GPT_TOP: 'gpt-4o',
  GPT_MINI: 'gpt-4o-mini',
  OR_GPT_MINI: 'openai/gpt-5-mini',
  OR_GPT_NANO: 'openai/gpt-5-nano',
} as const;

// ── Model defaults per role ──────────────────────────────────

interface ModelConfig {
  envVar: string;
  anthropic: string;
  openrouter: string;
  openai: string;
}

const MODEL_DEFAULTS: Record<string, ModelConfig> = {
  planner: {
    envVar: 'PLANNER_MODEL',
    anthropic: MODELS.OPUS,
    openrouter: MODELS.OR_OPUS,
    openai: MODELS.GPT_TOP,
  },
  supervisor: {
    envVar: 'SUPERVISOR_MODEL',
    anthropic: MODELS.SONNET,
    openrouter: MODELS.OR_SONNET,
    openai: MODELS.GPT_TOP,
  },
  promptWriter: {
    envVar: 'PROMPT_WRITER_MODEL',
    anthropic: MODELS.SONNET,
    openrouter: MODELS.OR_SONNET,
    openai: MODELS.GPT_TOP,
  },
  scriptReviewer: {
    envVar: 'REVIEWER_MODEL',
    anthropic: MODELS.SONNET,
    openrouter: MODELS.OR_SONNET,
    openai: MODELS.GPT_MINI,
  },
  /** Lightweight director tasks (SFX, zoom planning) */
  director: {
    envVar: 'DIRECTOR_MODEL',
    anthropic: MODELS.SONNET,
    openrouter: MODELS.OR_SONNET,
    openai: MODELS.GPT_TOP,
  },
  /** Vision model for describing user-provided assets (cheap, fast) */
  assetDescriber: {
    envVar: 'ASSET_DESCRIBER_MODEL',
    anthropic: MODELS.HAIKU,
    openrouter: MODELS.OR_HAIKU,
    openai: MODELS.GPT_MINI,
  },
} as const;

// ── Presets ──────────────────────────────────────────────────

type PresetModels = Record<string, { anthropic: string; openrouter: string; openai: string }>;

const PRESETS: Record<string, PresetModels> = {
  /** Production — best quality, highest cost */
  production: {
    planner: { anthropic: MODELS.OPUS, openrouter: MODELS.OR_OPUS, openai: MODELS.GPT_TOP },
    supervisor: { anthropic: MODELS.SONNET, openrouter: MODELS.OR_SONNET, openai: MODELS.GPT_TOP },
    promptWriter: {
      anthropic: MODELS.SONNET,
      openrouter: MODELS.OR_SONNET,
      openai: MODELS.GPT_TOP,
    },
    scriptReviewer: {
      anthropic: MODELS.SONNET,
      openrouter: MODELS.OR_SONNET,
      openai: MODELS.GPT_MINI,
    },
    director: { anthropic: MODELS.SONNET, openrouter: MODELS.OR_SONNET, openai: MODELS.GPT_TOP },
  },

  /** Development — good quality, moderate cost */
  development: {
    planner: { anthropic: MODELS.SONNET, openrouter: MODELS.OR_SONNET, openai: MODELS.GPT_TOP },
    supervisor: { anthropic: MODELS.SONNET, openrouter: MODELS.OR_SONNET, openai: MODELS.GPT_MINI },
    promptWriter: {
      anthropic: MODELS.SONNET,
      openrouter: MODELS.OR_SONNET,
      openai: MODELS.GPT_MINI,
    },
    scriptReviewer: {
      anthropic: MODELS.SONNET,
      openrouter: MODELS.OR_GPT_MINI,
      openai: MODELS.GPT_MINI,
    },
    director: { anthropic: MODELS.SONNET, openrouter: MODELS.OR_SONNET, openai: MODELS.GPT_MINI },
  },

  /** Testing — cheapest possible, for smoke tests and integration tests */
  testing: {
    planner: { anthropic: MODELS.HAIKU, openrouter: MODELS.OR_GPT_MINI, openai: MODELS.GPT_MINI },
    supervisor: {
      anthropic: MODELS.HAIKU,
      openrouter: MODELS.OR_GPT_MINI,
      openai: MODELS.GPT_MINI,
    },
    promptWriter: {
      anthropic: MODELS.HAIKU,
      openrouter: MODELS.OR_GPT_MINI,
      openai: MODELS.GPT_MINI,
    },
    scriptReviewer: {
      anthropic: MODELS.HAIKU,
      openrouter: MODELS.OR_GPT_NANO,
      openai: MODELS.GPT_MINI,
    },
    director: { anthropic: MODELS.HAIKU, openrouter: MODELS.OR_GPT_MINI, openai: MODELS.GPT_MINI },
  },
};

/**
 * Apply a model preset. Set MODEL_PRESET env var to 'production', 'development', or 'testing'.
 * Returns the active preset name.
 */
export function getActivePreset(): string {
  return process.env.MODEL_PRESET ?? 'production';
}

// ── Public API ───────────────────────────────────────────────

export type ModelRole = keyof typeof MODEL_DEFAULTS;

/**
 * Get the model ID for a given role, respecting env var overrides.
 *
 * Priority: env var > provider-specific default
 *
 * @example
 * getModel('planner')        // 'claude-opus-4-6' (Anthropic) or 'anthropic/claude-opus-4.6' (OpenRouter)
 * getModel('promptWriter')   // 'claude-sonnet-4-6' or 'anthropic/claude-sonnet-4.6'
 * getModel('scriptReviewer') // 'claude-haiku-4-5-20251001' or 'openai/gpt-5-mini'
 */
export function getModel(role: ModelRole, provider?: LLMProvider): string {
  const config = MODEL_DEFAULTS[role];
  if (!config) throw new Error(`Unknown model role: ${role}`);

  // Env var override takes priority
  const envOverride = process.env[config.envVar];
  if (envOverride) return envOverride;

  // Auto-detect provider if not specified
  const p = provider ?? detectProvider() ?? 'anthropic';

  // Check if preset overrides the default
  const preset = PRESETS[getActivePreset()];
  if (preset?.[role]) {
    switch (p) {
      case 'anthropic':
        return preset[role].anthropic;
      case 'openrouter':
        return preset[role].openrouter;
      case 'openai':
        return preset[role].openai;
    }
  }

  // Fallback to MODEL_DEFAULTS
  switch (p) {
    case 'anthropic':
      return config.anthropic;
    case 'openrouter':
      return config.openrouter;
    case 'openai':
      return config.openai;
    default:
      return config.anthropic;
  }
}

/**
 * Get the API URL for a provider.
 */
export function getApiUrl(provider: LLMProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'https://api.anthropic.com/v1/messages';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1/chat/completions';
    case 'openai':
      return 'https://api.openai.com/v1/chat/completions';
  }
}

/**
 * Get the API key for a provider.
 */
export function getApiKey(provider: LLMProvider): string | undefined {
  switch (provider) {
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY;
    case 'openai':
      return process.env.OPENAI_API_KEY;
  }
}
