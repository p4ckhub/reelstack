import type { ProductionPlan, ShotPlan, AssetGenerationJob, GeneratedAsset } from '../types';
import type { ToolRegistry } from '../registry/tool-registry';
import { pollUntilDone } from '../polling';
import { isPublicUrl } from '../utils/url-validation';
import { extractLastFrame } from '@reelstack/ffmpeg';
import { createStorage } from '@reelstack/storage';
import { createLogger } from '@reelstack/logger';
import fs from 'fs';
import os from 'os';
import path from 'path';

const log = createLogger('asset-generator');

interface GenerationTask {
  readonly shotId?: string;
  readonly toolId: string;
  /** If true, this task should receive the last frame of the previous ai-video as imageUrl */
  readonly chainFromPrevious?: boolean;
  readonly request: {
    purpose: string;
    prompt?: string;
    script?: string;
    voice?: string;
    avatarId?: string;
    durationSeconds?: number;
    aspectRatio?: '9:16' | '16:9' | '1:1';
    searchQuery?: string;
    imageUrl?: string;
  };
}

/**
 * Generates all assets needed by a production plan.
 *
 * Independent tasks run in parallel (batches of 5).
 * Chained tasks (chainFromPrevious) run sequentially — each receives the
 * last frame of the previous video as imageUrl (first_frame_url) for
 * visual continuity between clips.
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

  // Split into chained sequences and independent tasks.
  // A chain is a consecutive run of tasks where chainFromPrevious is true.
  const { chains, independent } = splitChainedTasks(tasks);

  // Generate independent tasks in parallel batches
  const MAX_CONCURRENT = 5;
  const assets: GeneratedAsset[] = [];

  for (let i = 0; i < independent.length; i += MAX_CONCURRENT) {
    const batch = independent.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.allSettled(
      batch.map((task) => generateSingle(task, registry))
    );
    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const task = batch[j];
      if (result.status === 'fulfilled' && result.value) {
        assets.push(result.value);
        onProgress?.(`Asset ready: ${task.toolId} for ${task.shotId ?? 'primary'}`);
      } else {
        const err = result.status === 'rejected' ? result.reason : 'null result';
        log.warn({ task: task.shotId, err }, 'Asset generation failed');
        onProgress?.(`Asset failed: ${task.toolId} for ${task.shotId ?? 'primary'}`);
      }
    }
  }

  // Generate chained sequences sequentially with frame extraction between clips
  for (const chain of chains) {
    let lastFrameUrl: string | undefined;

    for (const task of chain) {
      // Inject last frame from previous clip as imageUrl
      const chainedTask = lastFrameUrl
        ? { ...task, request: { ...task.request, imageUrl: lastFrameUrl } }
        : task;

      const asset = await generateSingle(chainedTask, registry);
      if (asset) {
        assets.push(asset);
        onProgress?.(`Asset ready (chained): ${task.toolId} for ${task.shotId}`);

        // Extract last frame for next clip in chain
        if (asset.type === 'ai-video' || asset.type === 'stock-video') {
          lastFrameUrl = await extractAndUploadLastFrame(asset.url);
          if (lastFrameUrl) {
            log.info(
              { shotId: task.shotId, frameUrl: lastFrameUrl.substring(0, 80) },
              'Last frame extracted for chain'
            );
          }
        }
      } else {
        onProgress?.(`Asset failed (chained): ${task.toolId} for ${task.shotId}`);
        // Chain broken — continue without frame reference
        lastFrameUrl = undefined;
      }
    }
  }

  return assets;
}

/**
 * Split tasks into chained sequences and independent tasks.
 * A chain starts with a non-chained ai-video task, followed by consecutive chainFromPrevious tasks.
 */
function splitChainedTasks(tasks: GenerationTask[]): {
  chains: GenerationTask[][];
  independent: GenerationTask[];
} {
  const chains: GenerationTask[][] = [];
  const independent: GenerationTask[] = [];
  let currentChain: GenerationTask[] = [];

  for (const task of tasks) {
    if (task.chainFromPrevious && currentChain.length > 0) {
      currentChain.push(task);
    } else if (task.chainFromPrevious) {
      // chainFromPrevious but no previous — treat as chain start
      currentChain = [task];
    } else if (task.request.prompt && (task.request.durationSeconds ?? 0) > 0) {
      // AI video task that could start a chain — check if next task chains from it
      if (currentChain.length > 0) chains.push(currentChain);
      currentChain = [task];
    } else {
      if (currentChain.length > 0) chains.push(currentChain);
      currentChain = [];
      independent.push(task);
    }
  }
  if (currentChain.length > 0) {
    // Only keep as chain if it has chained members (>1 task)
    if (currentChain.length > 1) {
      chains.push(currentChain);
    } else {
      independent.push(currentChain[0]);
    }
  }

  return { chains, independent };
}

/**
 * Download video, extract last frame, upload to storage, return signed URL.
 * Returns undefined on failure (non-blocking — chain continues without reference).
 */
async function extractAndUploadLastFrame(videoUrl: string): Promise<string | undefined> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-frame-'));
  const videoPath = path.join(tmpDir, 'clip.mp4');

  try {
    // Download video to temp
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000), redirect: 'error' });
    if (!res.ok) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(videoPath, buf);

    // Extract last frame
    const framePath = extractLastFrame(videoPath);

    // Upload to storage
    const storage = await createStorage();
    const key = `chain-frames/frame-${Date.now()}.jpg`;
    await storage.upload(fs.readFileSync(framePath), key);
    const url = await storage.getSignedUrl(key, 7200);

    return url;
  } catch (err) {
    log.warn(
      { videoUrl: videoUrl.substring(0, 80), err },
      'Failed to extract last frame for chain'
    );
    return undefined;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* cleanup best-effort */
    }
  }
}

/**
 * Regenerate a single asset for a specific shot.
 * Finds the shot in the plan, builds a generation task, generates, and returns the result.
 * Optionally override the prompt.
 */
export async function regenerateAsset(
  plan: ProductionPlan,
  shotId: string,
  registry: ToolRegistry,
  options?: { prompt?: string; toolId?: string }
): Promise<GeneratedAsset | null> {
  const shot = plan.shots.find((s) => s.id === shotId);
  if (!shot) {
    log.warn({ shotId }, 'Shot not found in plan');
    return null;
  }

  const task = shotToTask(shot);
  if (!task) {
    log.warn({ shotId, visualType: shot.visual.type }, 'Shot type does not need asset generation');
    return null;
  }

  // Apply overrides
  const overriddenTask: GenerationTask = {
    ...task,
    toolId: options?.toolId ?? task.toolId,
    request: {
      ...task.request,
      ...(options?.prompt ? { prompt: options.prompt } : {}),
    },
  };

  return generateSingle(overriddenTask, registry);
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
        chainFromPrevious: shot.chainFromPrevious,
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
    log.info(
      { toolId: tool.id, shotId: task.shotId, hasImageUrl: !!task.request.imageUrl },
      'Starting generation'
    );
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
  'seedance2-kie',
  'seedance2-fast-kie',
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
