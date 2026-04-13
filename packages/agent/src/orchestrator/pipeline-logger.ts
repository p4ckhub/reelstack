/**
 * Pipeline Logger — saves every intermediate result of a reel production run.
 *
 * Every step (script review, TTS, plan, supervisor, prompt expansion, assets,
 * composition, render) is logged with input/output and timing. At the end of
 * the pipeline, all data is persisted to object storage so runs are fully
 * reproducible and debuggable without re-running expensive API calls.
 *
 * Storage layout:
 *   jobs/{jobId}/pipeline.json          — full pipeline log
 *   jobs/{jobId}/01-script-review.json  — script review result
 *   jobs/{jobId}/02-plan.json           — production plan
 *   jobs/{jobId}/03-supervisor.json     — supervisor review iterations
 *   jobs/{jobId}/04-prompts/shot-{id}-brief.txt / shot-{id}-expanded.txt
 *   jobs/{jobId}/06-composition.json    — final ReelProps
 */
import { createStorage } from '@reelstack/storage';
import type { StorageAdapter } from '@reelstack/types';
import { createLogger } from '@reelstack/logger';
import { getCostSummary } from '../context';

const log = createLogger('pipeline-logger');

export interface PipelineLog {
  jobId: string;
  startedAt: number;
  completedAt?: number;
  totalDurationMs?: number;
  steps: PipelineStep[];
  costs?: import('../types').CostSummary;
}

export interface PipelineStep {
  name: string;
  timestamp: number;
  durationMs: number;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export class PipelineLogger {
  private steps: PipelineStep[] = [];
  private startedAt: number;
  private storage: StorageAdapter | null = null;
  private storageReady: Promise<StorageAdapter>;
  /** Fire-and-forget upload promises — collected so persist() can reference storage */
  private pendingUploads: Promise<void>[] = [];

  constructor(private readonly jobId: string) {
    this.startedAt = Date.now();
    // Eagerly initialize storage so it's ready when we need it.
    // If storage init fails, individual uploads will silently skip.
    this.storageReady = createStorage().then((s) => {
      this.storage = s;
      return s;
    });
  }

  /** Record a pipeline step with timing and optional input/output. */
  logStep(
    name: string,
    durationMs: number,
    input?: unknown,
    output?: unknown,
    error?: string
  ): void {
    this.steps.push({
      name,
      timestamp: Date.now(),
      durationMs,
      input,
      output,
      error,
    });
  }

  /** Get all logged steps (read-only snapshot). */
  getSteps(): PipelineStep[] {
    return [...this.steps];
  }

  /**
   * Fire-and-forget upload of an individual artifact.
   * Does NOT block the pipeline — errors are logged and swallowed.
   */
  saveArtifact(key: string, data: string | Buffer): void {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    const fullKey = `jobs/${this.jobId}/${key}`;

    const promise = this.storageReady
      .then((storage) => storage.upload(buffer, fullKey))
      .then(() => {
        log.debug({ key: fullKey }, 'Artifact saved');
      })
      .catch((err) => {
        log.warn({ err, key: fullKey }, 'Failed to save artifact');
      });

    this.pendingUploads.push(promise);
  }

  /**
   * Save a raw API call for audit purposes (fire-and-forget).
   * Stored at: jobs/{jobId}/api-calls/{stepId}/{callId}.json
   */
  saveApiCall(
    stepId: string,
    callId: string,
    data: {
      provider: string;
      model: string;
      request: { systemPrompt: string; userMessage: string };
      response: { text: string; usage?: { inputTokens: number; outputTokens: number } };
      durationMs: number;
    }
  ): void {
    const key = `api-calls/${stepId}/${callId}.json`;
    this.saveArtifact(key, JSON.stringify(data, null, 2));
  }

  /**
   * Persist the full pipeline log to storage.
   * Called once at the end of the pipeline. This one DOES await.
   */
  async persist(): Promise<void> {
    const costs = getCostSummary();
    const pipelineLog: PipelineLog = {
      jobId: this.jobId,
      startedAt: this.startedAt,
      completedAt: Date.now(),
      totalDurationMs: Date.now() - this.startedAt,
      steps: this.steps,
      costs: costs.entries.length > 0 ? costs : undefined,
    };

    try {
      const storage = await this.storageReady;
      const key = `jobs/${this.jobId}/pipeline.json`;
      await storage.upload(Buffer.from(JSON.stringify(pipelineLog, null, 2), 'utf-8'), key);
      log.info({ jobId: this.jobId, stepCount: this.steps.length }, 'Pipeline log persisted');
    } catch (err) {
      log.warn({ err, jobId: this.jobId }, 'Failed to persist pipeline log');
    }

    // Wait for any still-pending artifact uploads (best effort)
    await Promise.allSettled(this.pendingUploads);
  }

  /**
   * Build a summary object suitable for storing in DB productionMeta.
   */
  getSummary(): PipelineLogSummary {
    const toolsUsed = new Set<string>();
    for (const step of this.steps) {
      if (step.name === 'asset-generation' && step.input && typeof step.input === 'object') {
        const toolId = (step.input as Record<string, unknown>).toolId;
        if (typeof toolId === 'string') toolsUsed.add(toolId);
      }
    }

    return {
      stepCount: this.steps.length,
      totalDurationMs: Date.now() - this.startedAt,
      toolsUsed: [...toolsUsed],
      steps: this.steps.map((s) => ({
        name: s.name,
        durationMs: s.durationMs,
        hasError: !!s.error,
      })),
    };
  }
}

export interface PipelineLogSummary {
  stepCount: number;
  totalDurationMs: number;
  toolsUsed: string[];
  steps: Array<{ name: string; durationMs: number; hasError: boolean }>;
}
