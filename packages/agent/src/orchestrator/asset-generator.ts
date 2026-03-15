import type { ProductionPlan, ShotPlan, AssetGenerationJob, GeneratedAsset } from '../types';
import type { ToolRegistry } from '../registry/tool-registry';
import { pollUntilDone } from '../polling';
import { isPublicUrl } from '../planner/production-planner';
import { createLogger } from '@reelstack/logger';

const log = createLogger('asset-generator');

interface GenerationTask {
  readonly shotId?: string;
  readonly toolId: string;
  readonly request: {
    purpose: string;
    prompt?: string;
    script?: string;
    voice?: string;
    avatarId?: string;
    durationSeconds?: number;
    aspectRatio?: '9:16' | '16:9' | '1:1';
    searchQuery?: string;
  };
}

/**
 * Generates all assets needed by a production plan in parallel.
 * Returns generated assets mapped to their shot IDs.
 */
export async function generateAssets(
  plan: ProductionPlan,
  registry: ToolRegistry,
  onProgress?: (msg: string) => void
): Promise<GeneratedAsset[]> {
  const tasks = collectTasks(plan);

  if (tasks.length === 0) {
    log.info('No assets to generate');
    return [];
  }

  onProgress?.(`Generating ${tasks.length} asset(s)...`);

  // Limit concurrency to avoid rate limiting and resource exhaustion
  const MAX_CONCURRENT = 5;
  const results: PromiseSettledResult<GeneratedAsset | null>[] = [];

  for (let i = 0; i < tasks.length; i += MAX_CONCURRENT) {
    const batch = tasks.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.allSettled(
      batch.map((task) => generateSingle(task, registry))
    );
    results.push(...batchResults);
  }

  const assets: GeneratedAsset[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const task = tasks[i];
    if (result.status === 'fulfilled' && result.value) {
      assets.push(result.value);
      onProgress?.(`Asset ready: ${task.toolId} for ${task.shotId ?? 'primary'}`);
    } else if (result.status === 'rejected') {
      log.warn({ task, err: result.reason }, 'Asset generation failed');
      onProgress?.(
        `Asset failed: ${task.toolId} for ${task.shotId ?? 'primary'} - ${result.reason}`
      );
    }
  }

  return assets;
}

function collectTasks(plan: ProductionPlan): GenerationTask[] {
  const tasks: GenerationTask[] = [];

  // Primary source generation (avatar or AI video)
  if (plan.primarySource.type === 'avatar') {
    tasks.push({
      toolId: plan.primarySource.toolId,
      request: {
        purpose: 'Primary talking head avatar',
        script: plan.primarySource.script,
        voice: plan.primarySource.voice,
        avatarId: plan.primarySource.avatarId,
        aspectRatio: '9:16',
      },
    });
  } else if (plan.primarySource.type === 'ai-video') {
    tasks.push({
      toolId: plan.primarySource.toolId,
      request: {
        purpose: 'Primary AI video',
        prompt: plan.primarySource.prompt,
        aspectRatio: '9:16',
      },
    });
  }

  // Shot-level assets
  for (const shot of plan.shots) {
    const task = shotToTask(shot);
    if (task) tasks.push(task);
  }

  return tasks;
}

function shotToTask(shot: ShotPlan): GenerationTask | null {
  switch (shot.visual.type) {
    case 'b-roll':
      return {
        shotId: shot.id,
        toolId: shot.visual.toolId,
        request: {
          purpose: `B-roll: ${shot.reason}`,
          searchQuery: shot.visual.searchQuery,
          durationSeconds: shot.endTime - shot.startTime,
        },
      };
    case 'ai-video':
      return {
        shotId: shot.id,
        toolId: shot.visual.toolId,
        request: {
          purpose: `AI video: ${shot.reason}`,
          prompt: shot.visual.prompt,
          durationSeconds: shot.endTime - shot.startTime,
          aspectRatio: '9:16',
        },
      };
    case 'ai-image':
      return {
        shotId: shot.id,
        toolId: shot.visual.toolId,
        request: {
          purpose: `AI image: ${shot.reason}`,
          prompt: shot.visual.prompt,
        },
      };
    case 'primary':
    case 'text-card':
      return null;
  }
}

async function generateSingle(
  task: GenerationTask,
  registry: ToolRegistry
): Promise<GeneratedAsset | null> {
  const tool = registry.get(task.toolId);
  if (!tool) {
    log.warn({ toolId: task.toolId }, 'Tool not found in registry');
    return null;
  }

  // Try primary tool, then fallback to alternatives on failure
  const result = await tryGenerate(tool, task);
  if (result) return result;

  // Primary tool failed — find alternatives with the same asset type
  const assetType = tool.capabilities[0]?.assetType;
  if (!assetType) return null;

  // Exclude pexels from fallback chain — stock footage is generic and irrelevant.
  // If AI generation fails, prefer no asset over random stock footage.
  const alternatives = sortByPriority(
    registry.getByCapability(assetType).filter((t) => t.id !== task.toolId && t.id !== 'pexels'),
    assetType
  );
  if (alternatives.length === 0) {
    log.warn({ toolId: task.toolId, shotId: task.shotId }, 'No fallback tools available');
    return null;
  }

  for (const alt of alternatives) {
    log.info(
      { originalToolId: task.toolId, fallbackToolId: alt.id, shotId: task.shotId },
      'Trying fallback tool'
    );
    const fallbackResult = await tryGenerate(alt, task);
    if (fallbackResult) return fallbackResult;
  }

  log.warn(
    { toolId: task.toolId, shotId: task.shotId, triedFallbacks: alternatives.map((t) => t.id) },
    'All tools failed'
  );
  return null;
}

async function tryGenerate(
  tool: import('../registry/tool-interface').ProductionTool,
  task: GenerationTask
): Promise<GeneratedAsset | null> {
  try {
    log.info({ toolId: tool.id, shotId: task.shotId }, 'Starting generation');
    const job = await tool.generate(task.request);

    if (job.status === 'failed') {
      log.warn({ toolId: tool.id, error: job.error }, 'Generation failed');
      return null;
    }

    // If the tool is async, poll for completion
    let finalJob: AssetGenerationJob = job;
    if (job.status === 'pending' || job.status === 'processing') {
      finalJob = await pollUntilDone(tool, job.jobId);
    }

    if (finalJob.status !== 'completed' || !finalJob.url) {
      log.warn(
        { toolId: tool.id, jobId: job.jobId, shotId: task.shotId, error: finalJob.error },
        'Generation did not complete'
      );
      return null;
    }

    // Validate returned URL: allow public URLs and local temp file paths
    const url = finalJob.url;
    if (!url.startsWith('/') && !isPublicUrl(url)) {
      log.warn({ toolId: tool.id }, 'Tool returned invalid URL');
      return null;
    }

    const assetType = tool.capabilities[0]?.assetType ?? 'stock-video';

    log.info(
      {
        toolId: tool.id,
        shotId: task.shotId,
        assetType,
        url,
        durationSeconds: finalJob.durationSeconds,
      },
      'Asset generated successfully'
    );

    return {
      toolId: tool.id,
      shotId: task.shotId,
      url,
      type: assetType,
      durationSeconds: finalJob.durationSeconds,
    };
  } catch (err) {
    log.warn({ toolId: tool.id, shotId: task.shotId, err }, 'Generation threw error');
    return null;
  }
}

const VIDEO_FALLBACK_ORDER = [
  'seedance2-piapi',
  'veo31-gemini',
  'kling-fal',
  'kling-std-fal',
  'kling-o3-std-fal',
  'kling-piapi',
  'seedance-fal',
  'seedance-piapi',
  'kling-kie',
  'hailuo-fal',
  'wan-kie',
  'hunyuan-piapi',
  'hailuo-piapi',
  'seedance-kie',
];
const IMAGE_FALLBACK_ORDER = [
  'nanobanana',
  'nanobanana2-kie',
  'nanobanana-fal',
  'flux-kie',
  'flux-fal',
  'flux-piapi',
];

function sortByPriority(
  tools: import('../registry/tool-interface').ProductionTool[],
  assetType: string
): import('../registry/tool-interface').ProductionTool[] {
  const order =
    assetType === 'ai-video'
      ? VIDEO_FALLBACK_ORDER
      : assetType === 'ai-image'
        ? IMAGE_FALLBACK_ORDER
        : [];
  if (order.length === 0) return tools;
  return [...tools].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}
