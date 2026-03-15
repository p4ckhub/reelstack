// Register private modules (n8n-explainer, ai-tips, presenter-explainer)
import '@reelstack/modules';

import { createStorage } from '@reelstack/storage';
import {
  getReelJobInternal,
  updateReelJobStatus,
  markCallbackSent,
  resetCallbackSent,
} from '@reelstack/database';
import { createLogger } from '@reelstack/logger';
import { reelJobsTotal, reelRenderDuration } from '@/lib/metrics';
import {
  produce as agentProduce,
  produceComposition,
  getModule,
  isCoreMode,
  PipelineEngine,
  createGeneratePipeline,
} from '@reelstack/agent';
import type {
  UserAsset,
  ComposeRequest,
  BrandPreset,
  BaseModuleRequest,
  GeneratePipelineDeps,
  PipelineDefinition,
  PipelineResult,
  StepStatus,
  ReelModule,
} from '@reelstack/agent';
import { readFile, unlink } from 'fs/promises';
import crypto from 'crypto';

const log = createLogger('reel-pipeline');

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err)
    return String((err as Record<string, unknown>).message);
  return String(err);
}

/**
 * Deliver webhook callback to client URL.
 * Signs payload with HMAC-SHA256 using WEBHOOK_CALLBACK_SECRET.
 * Uses atomic markCallbackSent to prevent duplicate deliveries.
 * Fire-and-forget with 5s timeout.
 */
async function deliverCallback(
  jobId: string,
  callbackUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  const secret = process.env.WEBHOOK_CALLBACK_SECRET;
  if (!secret) {
    log.warn({ jobId }, 'WEBHOOK_CALLBACK_SECRET not set, skipping callback');
    return;
  }

  // Atomically claim the callback slot - prevents duplicate deliveries
  const claimed = await markCallbackSent(jobId);
  if (!claimed) {
    log.info({ jobId }, 'Callback already sent, skipping');
    return;
  }

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ReelStack-Signature': signature,
        'X-ReelStack-Event': payload.status === 'completed' ? 'reel.completed' : 'reel.failed',
        'User-Agent': 'ReelStack-Webhook/1.0',
      },
      body,
      signal: AbortSignal.timeout(5_000),
      redirect: 'error', // Don't follow redirects (SSRF protection)
    });

    if (response.ok) {
      log.info({ jobId, callbackUrl, status: response.status }, 'Webhook delivered');
    } else {
      log.warn({ jobId, callbackUrl, status: response.status }, 'Webhook delivery failed');
      // Reset flag so a retry mechanism (cron/manual) can re-attempt
      await resetCallbackSent(jobId);
    }
  } catch (err) {
    log.warn({ jobId, callbackUrl, err }, 'Webhook delivery error');
    // Reset flag so a retry mechanism (cron/manual) can re-attempt
    await resetCallbackSent(jobId);
  }
}

function makeProgressCallback(jobId: string, progressMap: Record<string, number>) {
  return (step: string) => {
    for (const [prefix, progress] of Object.entries(progressMap)) {
      if (step.startsWith(prefix)) {
        updateReelJobStatus(jobId, { progress }).catch((err) =>
          log.warn({ jobId, err }, 'Progress update failed')
        );
        break;
      }
    }
  };
}

export async function processReelPipelineJob(jobId: string): Promise<void> {
  const job = await getReelJobInternal(jobId);
  if (!job) throw new Error(`Reel job ${jobId} not found`);

  await updateReelJobStatus(jobId, {
    status: 'PROCESSING',
    progress: 0,
    startedAt: new Date(),
  });

  const pipelineStart = Date.now();

  try {
    const config = (job.reelConfig as Record<string, unknown>) ?? {};
    const mode = (config.mode as string) ?? 'generate';

    let outputPath: string;

    if (process.env.PIPELINE_ENGINE === 'false' && isCoreMode(mode)) {
      // ── Legacy fallback (only for core modes when explicitly disabled) ──
      outputPath = await runLegacyGenerate(jobId, job, config);
    } else {
      // ── All modes go through PipelineEngine ────────────────────
      const { pipeline, initialInput, stepProgressMap, postProcess } = await buildPipelineForMode(
        mode,
        jobId,
        job,
        config
      );

      const engine = new PipelineEngine();
      const pipelineResult = await engine.runAll(
        pipeline,
        initialInput,
        jobId,
        (stepId: string, _status: StepStatus) => {
          const progress = stepProgressMap[stepId] ?? 50;
          updateReelJobStatus(jobId, { progress }).catch(() => {});
        }
      );

      if (pipelineResult.status === 'failed') {
        throw new Error(
          `Pipeline failed at step "${pipelineResult.failedStepId}": ${
            pipelineResult.steps.find((s) => s.status === 'failed')?.error ?? 'unknown error'
          }`
        );
      }

      // Post-process: some pipelines need extra steps (e.g. generate needs render)
      outputPath = await postProcess(pipelineResult);

      // Save production metadata from pipeline steps
      await updateReelJobStatus(jobId, {
        productionMeta: buildPipelineProductionMeta(pipelineResult),
      }).catch((err) => log.warn({ jobId, err }, 'Failed to save production meta'));

      log.info(
        {
          jobId,
          mode,
          pipelineId: pipeline.id,
          steps: pipelineResult.steps.length,
          completedSteps: pipelineResult.steps.filter((s) => s.status === 'completed').length,
        },
        'Pipeline complete'
      );
    }

    // Upload rendered MP4 to storage
    const storage = await createStorage();
    const outputBuffer = await readFile(outputPath);
    const outputKey = `reels/${jobId}/output.mp4`;
    await storage.upload(outputBuffer, outputKey);
    const outputUrl = await storage.getSignedUrl(outputKey, 86400);

    // Clean up local file
    await unlink(outputPath).catch((err) => log.warn({ jobId, err }, 'Cleanup failed'));

    reelJobsTotal.inc({ status: 'completed' });
    reelRenderDuration.observe({ step: 'total' }, (Date.now() - pipelineStart) / 1000);

    await updateReelJobStatus(jobId, {
      status: 'COMPLETED',
      progress: 100,
      outputUrl,
      completedAt: new Date(),
    });

    // Deliver webhook callback (fire-and-forget, atomic dedup inside)
    if (job.callbackUrl) {
      deliverCallback(jobId, job.callbackUrl, {
        event: 'reel.completed',
        jobId,
        status: 'completed',
        outputUrl,
        language: job.language ?? undefined,
        parentJobId: job.parentJobId ?? undefined,
        completedAt: new Date().toISOString(),
      }).catch((e) => log.warn({ jobId, err: e }, 'Callback delivery failed'));
    }
  } catch (err) {
    reelJobsTotal.inc({ status: 'failed' });
    reelRenderDuration.observe({ step: 'total' }, (Date.now() - pipelineStart) / 1000);

    log.error({ jobId, err }, 'Pipeline failed');
    await updateReelJobStatus(jobId, {
      status: 'FAILED',
      error: extractErrorMessage(err),
      completedAt: new Date(),
    });

    // Send generic error to external callback - detailed error stays in DB + logs only
    if (job.callbackUrl) {
      deliverCallback(jobId, job.callbackUrl, {
        event: 'reel.failed',
        jobId,
        status: 'failed',
        error: 'Reel rendering failed',
        language: job.language ?? undefined,
        parentJobId: job.parentJobId ?? undefined,
        failedAt: new Date().toISOString(),
      }).catch((e) => log.warn({ jobId, err: e }, 'Callback delivery failed'));
    }

    throw err;
  }
}

// ── Pipeline builders per mode ──────────────────────────────────

interface PipelineSetup {
  pipeline: PipelineDefinition;
  initialInput: Record<string, unknown>;
  stepProgressMap: Record<string, number>;
  /** Extract outputPath from completed pipeline result. */
  postProcess: (result: PipelineResult) => Promise<string>;
}

/**
 * Build the correct PipelineDefinition + input for any mode.
 * - generate: full multi-step pipeline
 * - compose: single-step wrapper around produceComposition()
 * - modules (captions, talking-object, n8n-explainer, etc.): single-step wrapper
 */
async function buildPipelineForMode(
  mode: string,
  jobId: string,
  job: { script?: string | null; reelConfig?: unknown },
  config: Record<string, unknown>
): Promise<PipelineSetup> {
  if (mode === 'generate') {
    return buildGeneratePipelineSetup(jobId, job, config);
  }

  if (mode === 'compose') {
    return buildComposePipelineSetup(jobId, job, config);
  }

  // Module-based modes
  const reelModule = getModule(mode);
  if (!reelModule) {
    throw new Error(
      `Unknown reel mode: "${mode}". Available modules: ${(await import('@reelstack/agent'))
        .listModules()
        .map((m) => m.id)
        .join(', ')}`
    );
  }

  return buildModulePipelineSetup(reelModule, jobId, job, config);
}

async function buildGeneratePipelineSetup(
  jobId: string,
  job: { script?: string | null },
  config: Record<string, unknown>
): Promise<PipelineSetup> {
  log.info({ jobId }, 'Running full auto pipeline (PipelineEngine)');

  const deps = await createGenerateDeps();
  const pipeline = createGeneratePipeline(deps);

  return {
    pipeline,
    initialInput: {
      script: job.script ?? '',
      style: config.style ?? 'dynamic',
      layout: config.layout,
      tts: config.tts,
      whisper: config.whisper,
      brandPreset: config.brandPreset,
      montageProfile: config.montageProfile,
    },
    stepProgressMap: {
      'script-review': 10,
      'discover-tools': 15,
      tts: 25,
      'whisper-timing': 35,
      plan: 45,
      supervisor: 50,
      'prompt-expansion': 55,
      'asset-gen': 60,
      'asset-persist': 70,
      composition: 80,
    },
    async postProcess(result: PipelineResult) {
      const compositionResult = result.context.results.composition as {
        reelProps: Record<string, unknown>;
      };
      await updateReelJobStatus(jobId, { progress: 85 }).catch(() => {});
      const { renderVideo } = await import('@reelstack/agent');
      const { outputPath } = await renderVideo(compositionResult.reelProps);
      return outputPath;
    },
  };
}

function buildComposePipelineSetup(
  jobId: string,
  job: { script?: string | null },
  config: Record<string, unknown>
): PipelineSetup {
  log.info({ jobId }, 'Running compose pipeline (PipelineEngine)');

  const assets = (config.assets as UserAsset[]) ?? [];

  const pipeline: PipelineDefinition = {
    id: 'compose',
    name: 'Compose (User Assets)',
    steps: [
      {
        id: 'compose',
        name: 'Run compose orchestrator',
        dependsOn: [],
        async execute(ctx) {
          const progressMap: Record<string, number> = {
            'Planning composition...': 10,
            'Generating voiceover...': 25,
            'Normalizing audio...': 35,
            'Transcribing audio...': 45,
            'Assembling composition...': 60,
            'Rendering video...': 70,
          };

          const composeRequest: ComposeRequest = {
            jobId: ctx.jobId,
            script: (ctx.input.script as string) ?? '',
            assets: ctx.input.assets as UserAsset[],
            style: ctx.input.style as ComposeRequest['style'],
            layout: ctx.input.layout as ComposeRequest['layout'],
            tts: ctx.input.tts as ComposeRequest['tts'],
            whisper: ctx.input.whisper as ComposeRequest['whisper'],
            brandPreset: ctx.input.brandPreset as ComposeRequest['brandPreset'],
            directorNotes: ctx.input.directorNotes as string | undefined,
            onProgress: makeProgressCallback(ctx.jobId, progressMap),
          };

          const result = await produceComposition(composeRequest);
          return { outputPath: result.outputPath, steps: result.steps };
        },
      },
    ],
  };

  return {
    pipeline,
    initialInput: {
      script: job.script ?? '',
      assets,
      style: config.style,
      layout: config.layout,
      tts: config.tts,
      whisper: config.whisper,
      brandPreset: config.brandPreset,
      directorNotes: config.directorNotes,
    },
    stepProgressMap: { compose: 5 },
    async postProcess(result: PipelineResult) {
      const composeResult = result.context.results.compose as { outputPath: string };
      return composeResult.outputPath;
    },
  };
}

function buildModulePipelineSetup(
  reelModule: ReelModule,
  jobId: string,
  job: { script?: string | null },
  config: Record<string, unknown>
): PipelineSetup {
  log.info(
    { jobId, moduleId: reelModule.id, moduleName: reelModule.name },
    'Running module pipeline (PipelineEngine)'
  );

  const pipeline = createModulePipeline(reelModule);

  return {
    pipeline,
    initialInput: {
      ...config,
      script: config.script ?? job.script,
    },
    stepProgressMap: { orchestrate: 5 },
    async postProcess(result: PipelineResult) {
      const moduleResult = result.context.results.orchestrate as { outputPath: string };
      return moduleResult.outputPath;
    },
  };
}

/**
 * Wrap a ReelModule.orchestrate() call in a single-step PipelineDefinition.
 * Gives us pipeline tracking, context persistence, and step/retry/resume API
 * even for modules that don't have full multi-step pipeline definitions yet.
 */
function createModulePipeline(reelModule: ReelModule): PipelineDefinition {
  return {
    id: reelModule.id,
    name: reelModule.name,
    steps: [
      {
        id: 'orchestrate',
        name: `Run ${reelModule.id} module`,
        dependsOn: [],
        async execute(ctx) {
          const baseRequest: BaseModuleRequest = {
            jobId: ctx.jobId,
            language: (ctx.input.language as string) ?? 'en',
            tts: ctx.input.tts as BaseModuleRequest['tts'],
            whisper: ctx.input.whisper as BaseModuleRequest['whisper'],
            brandPreset: ctx.input.brandPreset as BrandPreset | undefined,
            musicUrl: ctx.input.musicUrl as string | undefined,
            musicVolume: ctx.input.musicVolume as number | undefined,
            onProgress: makeProgressCallback(ctx.jobId, reelModule.progressSteps),
          };

          const moduleConfig = { ...ctx.input };
          const result = await reelModule.orchestrate(baseRequest, moduleConfig);

          return {
            outputPath: result.outputPath,
            durationSeconds: result.durationSeconds,
            meta: result.meta,
          };
        },
      },
    ],
  };
}

/**
 * Legacy generate path (only used when PIPELINE_ENGINE=false).
 */
async function runLegacyGenerate(
  jobId: string,
  job: { script?: string | null },
  config: Record<string, unknown>
): Promise<string> {
  log.info({ jobId }, 'Running full auto pipeline (legacy)');

  const agentResult = await agentProduce({
    jobId,
    script: job.script ?? '',
    layout: config.layout as 'fullscreen' | 'split-screen' | 'picture-in-picture' | undefined,
    style: config.style as 'dynamic' | 'calm' | 'cinematic' | 'educational' | undefined,
    tts: config.tts as
      | { provider?: 'edge-tts' | 'elevenlabs' | 'openai'; voice?: string; language?: string }
      | undefined,
    whisper: config.whisper as
      | { provider?: 'openrouter' | 'cloudflare' | 'ollama'; apiKey?: string }
      | undefined,
    brandPreset: config.brandPreset as BrandPreset | undefined,
    avatar: config.avatar as { avatarId?: string; voice?: string } | undefined,
    montageProfile: config.montageProfile as string | undefined,
    onProgress: makeProgressCallback(jobId, {
      'Discovering available tools...': 5,
      'Planning production...': 10,
      'Generating assets and voiceover...': 20,
      'Generating voiceover...': 25,
      'Normalizing audio...': 35,
      'Transcribing audio...': 45,
      'Assembling composition...': 60,
      'Rendering video...': 70,
    }),
  });

  // Save production metadata to DB for debugging and traceability
  await updateReelJobStatus(jobId, {
    productionMeta: buildProductionMeta(agentResult),
  }).catch((err) => log.warn({ jobId, err }, 'Failed to save production meta'));

  log.info(
    { jobId, steps: agentResult.steps.length, assets: agentResult.generatedAssets.length },
    'Legacy auto pipeline complete'
  );

  return agentResult.outputPath;
}

/**
 * Lazily create real GeneratePipelineDeps from actual implementations.
 * Imported inside the handler to avoid heavy top-level imports (Turbopack safety).
 */
async function createGenerateDeps(): Promise<GeneratePipelineDeps> {
  const {
    reviewScript,
    isScriptReviewEnabled,
    runTTSPipeline,
    buildTimingReference,
    selectMontageProfile,
    planProduction,
    supervisePlan,
    isPromptWriterEnabled,
    writePrompt,
    generateAssets,
    persistAssetsToStorage,
    validatePlan,
    assembleComposition,
    uploadVoiceover,
    renderVideo,
    discoverTools,
    ToolRegistry,
  } = await import('@reelstack/agent');

  return {
    reviewScript,
    isScriptReviewEnabled,
    runTTSPipeline,
    buildTimingReference,
    selectMontageProfile,
    planProduction: (args) =>
      planProduction({
        ...args,
        style: args.style as 'dynamic' | 'calm' | 'cinematic' | 'educational',
        layout: args.layout as Parameters<typeof planProduction>[0]['layout'],
      }),
    supervisePlan: (args) =>
      supervisePlan({
        plan: args.plan,
        script: args.script,
        audioDuration: args.audioDuration,
        style: args.style as 'dynamic' | 'calm' | 'cinematic' | 'educational',
        toolManifest: args.toolManifest,
        timingReference: args.timingReference,
        montageProfile: args.montageProfile,
      }),
    isPromptWriterEnabled,
    expandPrompts: async (briefs) => {
      const results = await Promise.all(
        briefs.map(async (brief) => {
          const expandedPrompt = await writePrompt({
            ...brief,
            aspectRatio: brief.aspectRatio as '9:16' | '16:9' | '1:1' | undefined,
          });
          return { shotId: brief.shotId, expandedPrompt };
        })
      );
      return results;
    },
    generateAssets,
    persistAssets: (assets, jobId) => persistAssetsToStorage(assets, jobId),
    validatePlan: (plan, audioDuration) => {
      const result = validatePlan(plan, audioDuration);
      return {
        issues: result.issues.map((i) => i.message),
        fixedPlan: result.fixedPlan,
      };
    },
    assembleComposition,
    uploadVoiceover,
    renderVideo,
    discoverTools,
    createToolRegistry: () => {
      const registry = new ToolRegistry();
      return {
        register: (tool: unknown) => registry.register(tool as never),
        discover: () => registry.discover(),
        getToolManifest: () => registry.getToolManifest(),
      };
    },
  };
}

/**
 * Build production metadata from PipelineEngine result for DB persistence.
 */
function buildPipelineProductionMeta(result: PipelineResult): Record<string, unknown> {
  const ctx = result.context;
  const compositionResult = ctx.results.composition as
    | { plan: import('@reelstack/agent').ProductionPlan }
    | undefined;
  const assetPersistResult = ctx.results['asset-persist'] as
    | { assets: import('@reelstack/agent').GeneratedAsset[] }
    | undefined;
  const ttsResult = ctx.results.tts as { audioDuration?: number } | undefined;

  const plan = compositionResult?.plan;
  const assets = assetPersistResult?.assets ?? [];

  return {
    engine: 'pipeline',
    plan: plan
      ? {
          layout: plan.layout,
          primarySource: plan.primarySource,
          reasoning: plan.reasoning,
          shots: plan.shots.map((s) => ({
            id: s.id,
            startTime: s.startTime,
            endTime: s.endTime,
            visualType: s.visual.type,
            toolId: 'toolId' in s.visual ? s.visual.toolId : undefined,
            prompt: 'prompt' in s.visual ? s.visual.prompt : undefined,
            searchQuery: 'searchQuery' in s.visual ? s.visual.searchQuery : undefined,
            reason: s.reason,
          })),
          effectCount: plan.effects.length,
        }
      : null,
    assets: assets.map((a) => ({
      toolId: a.toolId,
      shotId: a.shotId,
      type: a.type,
      url: a.url,
      durationSeconds: a.durationSeconds,
    })),
    steps: result.steps.map((s) => ({
      name: s.name,
      durationMs: s.durationMs ? Math.round(s.durationMs) : undefined,
      status: s.status,
      error: s.error,
    })),
    durationSeconds: ttsResult?.audioDuration,
  };
}

/**
 * Build production metadata object to persist in DB.
 * Contains everything needed to trace what happened during production:
 * - LLM plan (shots with prompts, effects, layout)
 * - Generated assets (toolId, URL, type)
 * - Pipeline steps with durations
 */
function buildProductionMeta(
  result: import('@reelstack/agent').ProductionResult
): Record<string, unknown> {
  return {
    plan: result.plan
      ? {
          layout: result.plan.layout,
          primarySource: result.plan.primarySource,
          reasoning: result.plan.reasoning,
          shots: result.plan.shots.map((s) => ({
            id: s.id,
            startTime: s.startTime,
            endTime: s.endTime,
            visualType: s.visual.type,
            toolId: 'toolId' in s.visual ? s.visual.toolId : undefined,
            prompt: 'prompt' in s.visual ? s.visual.prompt : undefined,
            searchQuery: 'searchQuery' in s.visual ? s.visual.searchQuery : undefined,
            reason: s.reason,
          })),
          effectCount: result.plan.effects.length,
        }
      : null,
    assets: result.generatedAssets.map((a) => ({
      toolId: a.toolId,
      shotId: a.shotId,
      type: a.type,
      url: a.url,
      durationSeconds: a.durationSeconds,
    })),
    steps: result.steps.map((s) => ({
      name: s.name,
      durationMs: Math.round(s.durationMs),
      detail: s.detail,
    })),
    durationSeconds: result.durationSeconds,
  };
}
