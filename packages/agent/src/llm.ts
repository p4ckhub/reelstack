/**
 * Shared LLM calling infrastructure.
 * Detects provider from env vars and provides a simple prompt -> response interface.
 *
 * Used by: production-planner, script-reviewer, prompt-writer, n8n-script-generator, etc.
 */
import { createLogger } from '@reelstack/logger';
import { detectProvider, getModel, getApiKey } from './config/models';
import type { ModelRole, LLMProvider } from './config/models';
import { getJobId } from './context';

const log = createLogger('llm');

export type { LLMProvider } from './config/models';
export { detectProvider } from './config/models';

/**
 * Detect provider for lightweight/cheap tasks: prefer OpenRouter (cheaper models),
 * then Anthropic, then null.
 *
 * Unlike detectProvider() which prefers Anthropic (best quality for planning),
 * this prefers OpenRouter since lightweight tasks (script review, prompt expansion)
 * can use cheaper models without quality loss.
 */
export function detectCheapProvider(): LLMProvider | null {
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

// ── Options ────────────────────────────────────────────────────

export interface LLMCallOptions {
  /** Model role for model selection (default: 'planner') */
  modelRole?: ModelRole;
  /** Max tokens in response (default: 8192) */
  maxTokens?: number;
  /** Timeout in ms (default: 180_000) */
  timeoutMs?: number;
  /** Whether to request JSON output from OpenAI-compatible APIs (default: true) */
  jsonMode?: boolean;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Call LLM with system + user message and return text response.
 * Throws on failure. Supports custom model role, max_tokens, and timeout.
 */
export async function callLLMWithSystem(
  provider: LLMProvider,
  systemPrompt: string,
  userMessage: string,
  options?: LLMCallOptions
): Promise<string> {
  const opts = {
    modelRole: 'planner' as ModelRole,
    maxTokens: 8192,
    timeoutMs: 180_000,
    jsonMode: true,
    ...options,
  };

  if (provider === 'anthropic') {
    try {
      return await callAnthropic(systemPrompt, userMessage, opts);
    } catch (err: any) {
      // Fallback to OpenRouter if Anthropic fails (credits exhausted, rate limit, etc.)
      if (process.env.OPENROUTER_API_KEY) {
        log.warn({ error: err.message }, 'Anthropic failed, falling back to OpenRouter');
        return callOpenAICompatible('openrouter', systemPrompt, userMessage, opts);
      }
      throw err;
    }
  }
  return callOpenAICompatible(provider, systemPrompt, userMessage, opts);
}

/**
 * Simple prompt -> response LLM call. Detects provider automatically.
 * The prompt is used as both system and user message (system = instructions, user = content).
 * For the n8n script generator and similar use cases where a single prompt suffices.
 */
export async function callLLM(prompt: string): Promise<string> {
  const provider = detectProvider();
  if (!provider) {
    throw new Error(
      'No LLM API key configured (ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY)'
    );
  }
  return callLLMWithSystem(provider, prompt, 'Generate the output as specified.');
}

// ── Anthropic ─────────────────────────────────────────────────

interface InternalLLMOpts {
  modelRole: ModelRole;
  maxTokens: number;
  timeoutMs: number;
  jsonMode: boolean;
}

async function callAnthropic(
  systemPrompt: string,
  userMessage: string,
  opts: InternalLLMOpts
): Promise<string> {
  const model = getModel(opts.modelRole, 'anthropic');
  const startTime = performance.now();
  const jobId = getJobId();

  log.info({ provider: 'anthropic', model, role: opts.modelRole, jobId }, 'Calling LLM');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(opts.timeoutMs),
  });

  if (!res.ok) {
    const err = await res.text();
    const durationMs = Math.round(performance.now() - startTime);
    log.warn(
      {
        status: res.status,
        model,
        durationMs,
        jobId,
        errorPreview: err.substring(0, 200),
      },
      'Anthropic call failed'
    );
    throw new Error(`Anthropic API error (${res.status})`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };
  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock?.text) throw new Error('Empty response from Anthropic');

  const durationMs = Math.round(performance.now() - startTime);
  const responseText = textBlock.text;

  log.info(
    {
      provider: 'anthropic',
      model,
      role: opts.modelRole,
      jobId,
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
      durationMs,
      systemPromptPreview: systemPrompt.slice(0, 200),
      userMessagePreview: userMessage.slice(0, 200),
      responsePreview: responseText.slice(0, 200),
    },
    'LLM call completed'
  );

  return responseText;
}

// ── OpenAI-compatible (OpenAI + OpenRouter) ───────────────────

async function callOpenAICompatible(
  provider: 'openrouter' | 'openai',
  systemPrompt: string,
  userMessage: string,
  opts: InternalLLMOpts
): Promise<string> {
  const isOpenRouter = provider === 'openrouter';
  const baseUrl = isOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1';
  const apiKey = getApiKey(provider)!;
  const model = getModel(opts.modelRole, provider);
  const startTime = performance.now();
  const jobId = getJobId();

  log.info({ provider, model, role: opts.modelRole, jobId }, 'Calling LLM');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (isOpenRouter) {
    headers['HTTP-Referer'] = 'https://github.com/jurczykpawel/reelstack';
    headers['X-Title'] = 'ReelStack';
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
    signal: AbortSignal.timeout(opts.timeoutMs),
  });

  if (!res.ok) {
    const err = await res.text();
    const durationMs = Math.round(performance.now() - startTime);
    log.warn(
      {
        status: res.status,
        provider,
        model,
        durationMs,
        jobId,
        errorPreview: err.substring(0, 200),
      },
      'LLM call failed'
    );
    throw new Error(`${provider} API error (${res.status})`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error(`Empty response from ${provider}`);

  const durationMs = Math.round(performance.now() - startTime);

  log.info(
    {
      provider,
      model,
      role: opts.modelRole,
      jobId,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      durationMs,
      systemPromptPreview: systemPrompt.slice(0, 200),
      userMessagePreview: userMessage.slice(0, 200),
      responsePreview: content.slice(0, 200),
    },
    'LLM call completed'
  );

  return content;
}
