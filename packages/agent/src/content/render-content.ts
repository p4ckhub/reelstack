/**
 * Render a ContentPackage to final MP4 using template or AI montage.
 *
 * This is the bridge between content production and Remotion rendering.
 * Takes ContentPackage + montage config → ProductionPlan → assembler → render.
 */

import type { ContentPackage, EffectsMode } from './content-package';
import type { ProductionPlan, GeneratedAsset, BrandPreset } from '../types';
import { buildTemplatePlan } from './template-montage';
import { assembleComposition } from '../orchestrator/composition-assembler';
import { renderVideo } from '../orchestrator/base-orchestrator';
import { createLogger } from '@reelstack/logger';

const log = createLogger('render-content');

export interface RenderContentRequest {
  content: ContentPackage;
  /** Template ID for deterministic montage */
  templateId: string;
  /** Effects mode */
  effects?: EffectsMode;
  /** Brand preset for caption styling etc */
  brandPreset?: BrandPreset;
  /** Output file path */
  outputPath?: string;
  /** Progress callback */
  onProgress?: (step: string) => void;
  /**
   * Optional SFX director: replaces deterministic SFX with AI-planned SFX.
   * Called after plan is built, receives plan + content, returns sfxSegments.
   * Injected by private modules when sfxMode: 'ai-director'.
   */
  sfxDirector?: (
    plan: ProductionPlan,
    content: ContentPackage
  ) => Promise<Array<{ startTime: number; sfxId: string; volume: number }>>;
}

export interface RenderContentResult {
  outputPath: string;
  durationSeconds: number;
  plan: ProductionPlan;
}

/**
 * Render ContentPackage to video using template montage.
 *
 * Flow: ContentPackage → buildTemplatePlan() → assets → assembleComposition() → renderVideo()
 */
export async function renderContentPackage(
  request: RenderContentRequest
): Promise<RenderContentResult> {
  const { content, templateId, onProgress } = request;

  // ── 1. Build plan from template ────────────────────────────
  onProgress?.('Building montage plan...');
  const plan = buildTemplatePlan(content, templateId);

  // ── 1b. AI Director SFX override (if provided) ───────────
  if (request.sfxDirector) {
    onProgress?.('Planning SFX with AI director...');
    const aiSfx = await request.sfxDirector(plan, content);
    if (aiSfx.length > 0) {
      (plan as unknown as Record<string, unknown>).sfxSegments = aiSfx;
      log.info({ sfxCount: aiSfx.length }, 'AI Director SFX applied');
    }
  }

  log.info(
    {
      templateId,
      layout: plan.layout,
      shots: plan.shots.length,
      effects: plan.effects.length,
      sfx: (plan.sfxSegments ?? []).length,
      primarySource: plan.primarySource.type,
    },
    'Template plan built'
  );

  // ── 2. Build asset list for assembler ──────────────────────
  // Assembler expects GeneratedAsset[] with shotId matching plan shot IDs
  const assets: GeneratedAsset[] = [];

  // Map content assets to generated assets by matching plan shots
  for (const shot of plan.shots) {
    if (shot.visual.type !== 'b-roll') continue;
    const searchQuery = (shot.visual as { searchQuery?: string }).searchQuery;
    if (!searchQuery) continue;

    const contentAsset = content.assets.find((a) => a.id === searchQuery);
    if (contentAsset) {
      assets.push({
        toolId: 'user-upload',
        shotId: shot.id,
        url: contentAsset.url,
        type: contentAsset.type === 'video' ? 'stock-video' : 'stock-image',
        durationSeconds: contentAsset.durationSeconds,
      });
    }
  }

  // ── 3. Assemble composition props ──────────────────────────
  onProgress?.('Assembling composition...');

  const framingMap: Record<string, string> = {
    'bottom-aligned': 'center 85%',
    'top-aligned': 'center 15%',
    centered: 'center',
  };

  const props = assembleComposition({
    plan,
    assets,
    cues: content.cues.map((c) => ({
      id: c.id,
      text: c.text,
      startTime: c.startTime,
      endTime: c.endTime,
      words: c.words ? [...c.words.map((w) => ({ ...w }))] : undefined,
    })),
    voiceoverFilename: content.voiceover.url,
    brandPreset: request.brandPreset,
    primaryVideoDurationSeconds: content.primaryVideo?.loop
      ? content.primaryVideo.durationSeconds
      : undefined,
    primaryVideoObjectPosition: content.primaryVideo
      ? (framingMap[content.primaryVideo.framing] ?? 'center')
      : 'center',
  });

  log.info(
    {
      layout: props.layout,
      bRollSegments: props.bRollSegments.length,
      effects: props.effects.length,
      primaryVideoUrl: props.primaryVideoUrl?.substring(0, 60),
    },
    'Composition assembled'
  );

  // ── 4. Render ──────────────────────────────────────────────
  onProgress?.('Rendering video...');
  const { outputPath, step: renderStep } = await renderVideo(
    props as unknown as Record<string, unknown>,
    request.outputPath,
    onProgress
  );

  log.info({ outputPath, durationMs: renderStep.durationMs }, 'Render complete');

  return {
    outputPath,
    durationSeconds: content.voiceover.durationSeconds,
    plan,
  };
}
