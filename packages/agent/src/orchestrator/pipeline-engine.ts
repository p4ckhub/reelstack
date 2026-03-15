import { createStorage } from '@reelstack/storage';
import type { StorageAdapter } from '@reelstack/types';
import { createLogger } from '@reelstack/logger';
import { runWithJobId } from '../context';

const logger = createLogger('pipeline-engine');

// ── Types ─────────────────────────────────────────────────────

/** Accumulated state passed between steps. Each step reads from and writes to context. */
export interface PipelineContext {
  jobId: string;
  /** Each step stores its output here under its step ID */
  results: Record<string, unknown>;
  /** Initial input (script, config, etc.) */
  input: Record<string, unknown>;
}

export interface StepDefinition {
  /** Unique step ID (e.g. 'tts', 'plan', 'asset-gen') */
  id: string;
  /** Human-readable name (e.g. "Generate voiceover") */
  name: string;
  /** Step IDs that must complete before this step can run */
  dependsOn: string[];
  /** Execute the step. Receives accumulated context, returns step output. */
  execute: (context: PipelineContext) => Promise<unknown>;
}

export interface StepStatus {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
  /** Timestamp when step completed */
  completedAt?: number;
}

export interface PipelineResult {
  jobId: string;
  status: 'completed' | 'failed' | 'paused';
  steps: StepStatus[];
  context: PipelineContext;
  /** Which step failed (if status === 'failed') */
  failedStepId?: string;
}

export interface PipelineDefinition {
  /** Pipeline ID (e.g. 'generate', 'captions', 'talking-object') */
  id: string;
  name: string;
  steps: StepDefinition[];
}

// ── Engine ────────────────────────────────────────────────────

export class PipelineEngine {
  private storagePromise: Promise<StorageAdapter> | null = null;

  private getStorage(): Promise<StorageAdapter> {
    if (!this.storagePromise) {
      this.storagePromise = createStorage();
    }
    return this.storagePromise;
  }

  /**
   * Run all steps from beginning.
   * Persists context after each step.
   * Stops on first failure.
   */
  async runAll(
    definition: PipelineDefinition,
    initialInput: Record<string, unknown>,
    jobId: string,
    onProgress?: (stepId: string, status: StepStatus) => void
  ): Promise<PipelineResult> {
    this.validateDependencies(definition);

    const context: PipelineContext = {
      jobId,
      results: {},
      input: initialInput,
    };

    return runWithJobId(jobId, () => this.executeSteps(definition, context, 0, onProgress));
  }

  /**
   * Resume pipeline from a specific step.
   * Loads persisted context from storage, validates dependencies are met,
   * then continues from stepId.
   */
  async resumeFrom(
    definition: PipelineDefinition,
    jobId: string,
    fromStepId: string,
    onProgress?: (stepId: string, status: StepStatus) => void
  ): Promise<PipelineResult> {
    const stepIndex = definition.steps.findIndex((s) => s.id === fromStepId);
    if (stepIndex === -1) {
      throw new Error(`Step "${fromStepId}" not found in pipeline "${definition.id}"`);
    }

    const context = await this.loadContext(jobId);
    if (!context) {
      throw new Error(`No persisted context found for job "${jobId}"`);
    }

    const step = definition.steps[stepIndex];
    this.validateDependenciesMet(step, context);

    return runWithJobId(jobId, () => this.executeSteps(definition, context, stepIndex, onProgress));
  }

  /**
   * Retry a single step with optionally modified input.
   * Loads context, re-runs just that step, saves updated context.
   * Does NOT continue to next steps.
   */
  async retryStep(
    definition: PipelineDefinition,
    jobId: string,
    stepId: string,
    modifiedInput?: Record<string, unknown>
  ): Promise<StepStatus> {
    const step = definition.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step "${stepId}" not found in pipeline "${definition.id}"`);
    }

    const context = await this.loadContext(jobId);
    if (!context) {
      throw new Error(`No persisted context found for job "${jobId}"`);
    }

    if (modifiedInput) {
      Object.assign(context.input, modifiedInput);
    }

    this.validateDependenciesMet(step, context);

    return this.executeSingleStep(step, context);
  }

  /**
   * Get current pipeline status from persisted state.
   */
  async getStatus(definition: PipelineDefinition, jobId: string): Promise<StepStatus[]> {
    const context = await this.loadContext(jobId);

    return definition.steps.map((step) => ({
      id: step.id,
      name: step.name,
      status:
        context?.results[step.id] !== undefined ? ('completed' as const) : ('pending' as const),
    }));
  }

  /**
   * Load persisted context for a job.
   */
  async loadContext(jobId: string): Promise<PipelineContext | null> {
    try {
      const storage = await this.getStorage();
      const buf = await storage.download(`jobs/${jobId}/context.json`);
      return JSON.parse(buf.toString()) as PipelineContext;
    } catch {
      return null;
    }
  }

  // ── Private helpers ─────────────────────────────────────────

  private validateDependencies(definition: PipelineDefinition): void {
    const stepIds = new Set(definition.steps.map((s) => s.id));
    for (const step of definition.steps) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          throw new Error(
            `Dependency "${dep}" not found in pipeline "${definition.id}" (required by step "${step.id}")`
          );
        }
      }
    }
  }

  private validateDependenciesMet(step: StepDefinition, context: PipelineContext): void {
    const missing = step.dependsOn.filter((dep) => !(dep in context.results));
    if (missing.length > 0) {
      throw new Error(
        `Dependencies not met for step "${step.id}": missing [${missing.join(', ')}]`
      );
    }
  }

  private async executeSteps(
    definition: PipelineDefinition,
    context: PipelineContext,
    fromIndex: number,
    onProgress?: (stepId: string, status: StepStatus) => void
  ): Promise<PipelineResult> {
    const stepStatuses: StepStatus[] = definition.steps.map((step, i) => ({
      id: step.id,
      name: step.name,
      status: i < fromIndex ? ('skipped' as const) : ('pending' as const),
    }));

    for (let i = fromIndex; i < definition.steps.length; i++) {
      const step = definition.steps[i];
      const startTime = Date.now();

      // Report running
      stepStatuses[i] = { ...stepStatuses[i], status: 'running' };
      onProgress?.(step.id, { ...stepStatuses[i] });

      try {
        const result = await step.execute(context);
        const durationMs = Date.now() - startTime;
        const completedAt = Date.now();

        context.results[step.id] = result;

        stepStatuses[i] = {
          ...stepStatuses[i],
          status: 'completed',
          durationMs,
          completedAt,
        };

        onProgress?.(step.id, { ...stepStatuses[i] });

        await this.persistContext(context, step.id);
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorMessage = err instanceof Error ? err.message : String(err);

        stepStatuses[i] = {
          ...stepStatuses[i],
          status: 'failed',
          durationMs,
          error: errorMessage,
        };

        onProgress?.(step.id, { ...stepStatuses[i] });

        return {
          jobId: context.jobId,
          status: 'failed',
          steps: stepStatuses,
          context,
          failedStepId: step.id,
        };
      }
    }

    return {
      jobId: context.jobId,
      status: 'completed',
      steps: stepStatuses,
      context,
    };
  }

  private async executeSingleStep(
    step: StepDefinition,
    context: PipelineContext
  ): Promise<StepStatus> {
    const startTime = Date.now();

    try {
      const result = await step.execute(context);
      const durationMs = Date.now() - startTime;

      context.results[step.id] = result;
      await this.persistContext(context, step.id);

      return {
        id: step.id,
        name: step.name,
        status: 'completed',
        durationMs,
        completedAt: Date.now(),
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      return {
        id: step.id,
        name: step.name,
        status: 'failed',
        durationMs,
        error: errorMessage,
      };
    }
  }

  private async persistContext(context: PipelineContext, stepId: string): Promise<void> {
    try {
      const storage = await this.getStorage();
      const contextBuf = Buffer.from(JSON.stringify(context));
      const stepBuf = Buffer.from(JSON.stringify(context.results[stepId]));

      await Promise.all([
        storage.upload(contextBuf, `jobs/${context.jobId}/context.json`),
        storage.upload(stepBuf, `jobs/${context.jobId}/steps/${stepId}.json`),
      ]);
    } catch (err) {
      logger.warn({ err, jobId: context.jobId, stepId }, 'Failed to persist pipeline context');
    }
  }
}
