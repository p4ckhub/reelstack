/**
 * Generic config-driven production tool for REST API providers.
 *
 * Eliminates duplication across piapi, wavespeed, aimlapi, replicate, etc.
 * Each provider defines a ProviderConfig (auth, endpoints, response parsing)
 * and each model defines a ModelConfig (capabilities, buildInput, parseOutput).
 *
 * Pattern: one class, many instances via config — same as KieTool.
 */
import { randomUUID } from 'node:crypto';
import type { ProductionTool, ToolPricing } from '../registry/tool-interface';
import type {
  ToolCapability,
  AssetGenerationRequest,
  AssetGenerationJob,
  AssetGenerationStatus,
} from '../types';
import { createLogger } from '@reelstack/logger';
import { addCost } from '../context';
import { calculateToolCost } from '../config/pricing';

const log = createLogger('provider-tool');

const JOB_ID_RE = /^[a-zA-Z0-9\-_.~:\/]+$/;

// ── Provider config (shared across all models from same provider) ──

export interface ProviderConfig {
  /** Provider name for logging (e.g. "piapi", "wavespeed") */
  provider: string;
  /** Environment variable that gates availability */
  envKey: string;
  /** Build auth headers from API key */
  buildAuthHeaders(apiKey: string): Record<string, string>;
  /** Generate endpoint URL. Receives model config for dynamic paths. */
  generateUrl(model: ModelConfig): string;
  /** Poll endpoint URL. Receives jobId. */
  pollUrl(model: ModelConfig, jobId: string): string;
  /** Extract job ID from generate response body */
  extractJobId(body: Record<string, unknown>): string | undefined;
  /** Extract result URL from poll response body */
  extractResultUrl(body: Record<string, unknown>, model: ModelConfig): string | undefined;
  /** Extract error from poll response body */
  extractError(body: Record<string, unknown>): string | undefined;
  /** Map provider status string to canonical status. Return null for "still processing". */
  mapStatus(providerStatus: string | undefined): 'completed' | 'failed' | null;
  /** Extra headers for generate request (e.g. Replicate's Prefer: respond-async) */
  extraGenerateHeaders?: Record<string, string>;
  /** If true, buildInput result is sent as-is (no wrapping) */
  rawBody?: boolean;
  /** Wrap body before sending (e.g. Replicate wraps in {input: ...}) */
  wrapBody?(input: Record<string, unknown>, model: ModelConfig): Record<string, unknown>;
}

// ── Model config (per model/tool instance) ──────────────────

export interface ModelConfig {
  id: string;
  name: string;
  /** Provider-specific model identifier (used in request body or URL) */
  model: string;
  /** Asset type for capabilities and cost tracking */
  assetType: 'ai-video' | 'ai-image' | 'stock-video' | 'stock-image';
  capabilities: ToolCapability[];
  promptGuidelines?: string;
  pricing?: ToolPricing;
  /** Build the request body/input from AssetGenerationRequest */
  buildInput(req: AssetGenerationRequest): Record<string, unknown>;
  /** Custom output parser (overrides provider-level extractResultUrl) */
  parseOutput?(body: Record<string, unknown>): string | undefined;
  /** Extra data for provider URL builders (e.g. modelSlug, providerSlug) */
  meta?: Record<string, string>;
  /** If true, generate() returns completed immediately (synchronous tool, no polling) */
  synchronous?: boolean;
}

// ── Generic tool class ──────────────────────────────────────

export class ProviderTool implements ProductionTool {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ToolCapability[];
  readonly promptGuidelines?: string;
  readonly pricing?: ToolPricing;

  constructor(
    private readonly provider: ProviderConfig,
    private readonly model: ModelConfig
  ) {
    this.id = model.id;
    this.name = model.name;
    this.capabilities = model.capabilities;
    this.promptGuidelines = model.promptGuidelines;
    this.pricing = model.pricing;
  }

  private get apiKey(): string | undefined {
    return process.env[this.provider.envKey];
  }

  async healthCheck(): Promise<{ available: boolean; reason?: string }> {
    if (!this.apiKey) {
      return { available: false, reason: `${this.provider.envKey} not set` };
    }
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!this.apiKey) {
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `${this.provider.envKey} not set`,
      };
    }

    try {
      const input = this.model.buildInput(request);
      const body = this.provider.wrapBody ? this.provider.wrapBody(input, this.model) : input;

      const url = this.provider.generateUrl(this.model);
      const startTime = performance.now();

      log.info(
        {
          toolId: this.id,
          provider: this.provider.provider,
          model: this.model.model,
          endpoint: url,
          prompt: (input.prompt as string)?.substring(0, 200),
        },
        'generate request'
      );

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.provider.buildAuthHeaders(this.apiKey),
          ...this.provider.extraGenerateHeaders,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      });

      const durationMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        const errBody = await res.text();
        log.warn(
          {
            toolId: this.id,
            status: res.status,
            durationMs,
            errorPreview: errBody.substring(0, 500),
          },
          'generate failed'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: `${this.provider.provider} API error (${res.status})`,
        };
      }

      const data = (await res.json()) as Record<string, unknown>;

      // Synchronous tool: extract URL directly from generate response
      if (this.model.synchronous) {
        const resultUrl =
          this.model.parseOutput?.(data) ?? this.provider.extractResultUrl(data, this.model);
        if (resultUrl) {
          addCost({
            step: `asset:${this.id}`,
            provider: this.provider.provider,
            model: this.model.model,
            type: this.model.assetType === 'ai-image' ? 'image' : 'video',
            costUSD: calculateToolCost(this.id, request.durationSeconds),
            inputUnits: 1,
            durationMs,
          });
          return {
            jobId: randomUUID(),
            toolId: this.id,
            status: 'completed',
            url: resultUrl,
          };
        }
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: 'No URL in synchronous response',
        };
      }

      const jobId = this.provider.extractJobId(data);

      if (!jobId) {
        log.warn(
          { toolId: this.id, durationMs, data: JSON.stringify(data).substring(0, 300) },
          'no jobId in response'
        );
        return {
          jobId: randomUUID(),
          toolId: this.id,
          status: 'failed',
          error: (data as { message?: string }).message ?? 'No job ID returned',
        };
      }

      log.info({ toolId: this.id, jobId, durationMs }, 'generation started');
      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, err }, 'generate error');
      return {
        jobId: randomUUID(),
        toolId: this.id,
        status: 'failed',
        error: `${this.provider.provider} request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  async poll(jobId: string): Promise<AssetGenerationStatus> {
    if (!this.apiKey) {
      return { jobId, toolId: this.id, status: 'failed', error: `${this.provider.envKey} not set` };
    }

    if (!jobId || jobId.length > 512 || !JOB_ID_RE.test(jobId)) {
      return { jobId, toolId: this.id, status: 'failed', error: 'Invalid jobId format' };
    }

    try {
      const url = this.provider.pollUrl(this.model, jobId);
      const startTime = performance.now();

      const res = await fetch(url, {
        headers: {
          ...this.provider.buildAuthHeaders(this.apiKey),
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });

      const durationMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        log.warn({ toolId: this.id, jobId, status: res.status, durationMs }, 'poll failed');
        return { jobId, toolId: this.id, status: 'processing' };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const providerStatus =
        (data as { status?: string }).status ??
        (data as { data?: { status?: string } }).data?.status;
      const mapped = this.provider.mapStatus(providerStatus);

      if (mapped === 'completed') {
        const resultUrl =
          this.model.parseOutput?.(data) ?? this.provider.extractResultUrl(data, this.model);
        if (!resultUrl) {
          return { jobId, toolId: this.id, status: 'failed', error: 'No URL in result' };
        }
        addCost({
          step: `asset:${this.id}`,
          provider: this.provider.provider,
          model: this.model.model,
          type: this.model.assetType === 'ai-image' ? 'image' : 'video',
          costUSD: calculateToolCost(this.id),
          inputUnits: 1,
          durationMs,
        });
        log.info(
          { toolId: this.id, jobId, url: resultUrl.substring(0, 100), durationMs },
          'generation completed'
        );
        return { jobId, toolId: this.id, status: 'completed', url: resultUrl };
      }

      if (mapped === 'failed') {
        const error =
          this.provider.extractError(data) ?? `${this.provider.provider} generation failed`;
        return { jobId, toolId: this.id, status: 'failed', error };
      }

      return { jobId, toolId: this.id, status: 'processing' };
    } catch (err) {
      log.warn({ toolId: this.id, jobId, err }, 'poll error');
      return { jobId, toolId: this.id, status: 'processing' };
    }
  }
}

// ── Helper: create multiple tools from one provider + model array ──

export function createProviderTools(
  provider: ProviderConfig,
  models: ModelConfig[]
): ProductionTool[] {
  return models.map((model) => new ProviderTool(provider, model));
}
