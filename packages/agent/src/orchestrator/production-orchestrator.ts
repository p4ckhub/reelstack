import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  normalizeAudioForWhisper,
  getAudioDuration,
  transcribeAudio,
} from '@reelstack/remotion/pipeline';
import { groupWordsIntoCues } from '@reelstack/transcription';
import { ToolRegistry } from '../registry/tool-registry';
import { discoverTools } from '../registry/discovery';
import { planProduction, planComposition } from '../planner/production-planner';
import { generateAssets } from './asset-generator';
import { assembleComposition } from './composition-assembler';
import { validatePlan } from '../planner/plan-validator';
import { supervisePlan } from '../planner/plan-supervisor';
import {
  buildTimingReference,
  resolvePresetConfig,
  runTTSPipeline,
  uploadVoiceover,
  renderVideo,
} from './base-orchestrator';
import type { TTSPipelineResult } from './base-orchestrator';
import type {
  ProductionRequest,
  ProductionResult,
  ProductionStep,
  ComposeRequest,
  BrandPreset,
  ProductionPlan,
  GeneratedAsset,
} from '../types';
import { selectMontageProfile } from '../planner/montage-profile';
import { reviewScript, isScriptReviewEnabled } from '../planner/script-reviewer';
import { writePrompt, isPromptWriterEnabled } from '../planner/prompt-writer';
import type { ShotBrief } from '../planner/prompt-writer';
import { createLogger } from '@reelstack/logger';
import { PipelineLogger } from './pipeline-logger';
import { persistAssetsToStorage } from './asset-persistence';
import { runWithJobId } from '../context';

const baseLog = createLogger('production-orchestrator');

/**
 * Main production orchestrator.
 * Flow: discover + TTS (parallel) -> plan with exact timestamps -> generate assets -> assemble -> render
 *
 * IMPORTANT: Audio/transcription runs BEFORE planning so the director (LLM) receives
 * exact speech timestamps and plans to them. No timeline adjustment needed.
 */
export async function produce(request: ProductionRequest): Promise<ProductionResult> {
  // Input validation
  const MAX_SCRIPT_LENGTH = 50_000; // ~8000 words
  if (!request.script || request.script.length > MAX_SCRIPT_LENGTH) {
    throw new Error(`Script must be between 1 and ${MAX_SCRIPT_LENGTH} characters`);
  }

  // Wrap entire pipeline in job context so nested calls (LLM, tools) can access jobId
  const jobId = request.jobId;
  if (jobId) {
    return runWithJobId(jobId, () => produceInner(request));
  }
  return produceInner(request);
}

async function produceInner(request: ProductionRequest): Promise<ProductionResult> {
  // Create job-scoped logger so all logs from this pipeline run are correlated
  const log = request.jobId ? baseLog.child({ jobId: request.jobId }) : baseLog;
  const pipelineLogger = request.jobId ? new PipelineLogger(request.jobId) : null;

  const steps: ProductionStep[] = [];
  const onProgress = request.onProgress;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-agent-'));

  // ── 1. DISCOVER TOOLS + TTS (parallel) ─────────────────────
  // Both are independent — run in parallel to save time.
  onProgress?.('Discovering tools and generating voiceover...');
  const parallelStart = performance.now();

  const registryPromise = (async () => {
    const registry = new ToolRegistry();
    for (const tool of discoverTools()) {
      registry.register(tool);
    }
    await registry.discover();
    return registry;
  })();

  const [registry, ttsResult] = await Promise.all([
    registryPromise,
    runTTSPipeline(request, tmpDir, onProgress),
  ]);

  const manifest = registry.getToolManifest();
  steps.push({
    name: 'Tool discovery + TTS',
    durationMs: performance.now() - parallelStart,
    detail: manifest.summary,
  });
  steps.push(...ttsResult.steps);

  log.info(
    { available: manifest.tools.filter((t) => t.available).map((t) => t.id) },
    'Tools discovered'
  );

  // Pipeline logging: TTS
  pipelineLogger?.logStep(
    'tts',
    performance.now() - parallelStart,
    { script: request.script, tts: request.tts },
    { audioPath: ttsResult.voiceoverPath, duration: ttsResult.audioDuration }
  );

  // Pipeline logging: whisper (included in TTS pipeline)
  pipelineLogger?.logStep(
    'whisper',
    0, // duration already included in TTS step
    { audioPath: ttsResult.voiceoverPath },
    { wordsCount: ttsResult.transcriptionWords.length, cuesCount: ttsResult.cues.length }
  );

  // ── 2. BUILD TIMING REFERENCE ──────────────────────────────
  // Director gets exact speech timestamps from Whisper transcription
  const timingReference = buildTimingReference(ttsResult.transcriptionWords);

  // ── 2b. SELECT MONTAGE PROFILE ────────────────────────────
  const montageProfile = selectMontageProfile(request.script, request.montageProfile);
  log.info(
    { profileId: montageProfile.id, profileName: montageProfile.name },
    'Selected montage profile'
  );

  // ── 2c. SCRIPT REVIEW (fact-check before planning) ──────────
  let scriptForPlanning = request.script;
  if (isScriptReviewEnabled()) {
    onProgress?.('Reviewing script for factual errors...');
    const reviewStart = performance.now();

    const scriptReview = await reviewScript(request.script);

    steps.push({
      name: 'Script review',
      durationMs: performance.now() - reviewStart,
      detail: scriptReview.approved
        ? 'Script approved'
        : `${scriptReview.issues.length} issue(s) found`,
    });

    if (!scriptReview.approved) {
      log.info(
        {
          issues: scriptReview.issues,
          suggestions: scriptReview.suggestions,
          hasCorrectedScript: !!scriptReview.correctedScript,
        },
        'Script review found issues'
      );

      if (scriptReview.correctedScript) {
        log.info('Using corrected script from reviewer');
        scriptForPlanning = scriptReview.correctedScript;
      }
    } else {
      log.info('Script review passed');
    }

    // Pipeline logging: script review
    pipelineLogger?.logStep(
      'script-review',
      performance.now() - reviewStart,
      { script: request.script },
      scriptReview
    );
    pipelineLogger?.saveArtifact('01-script-review.json', JSON.stringify(scriptReview, null, 2));
  }

  // ── 3. PLAN PRODUCTION (with exact timestamps) ─────────────
  onProgress?.('Planning production (with exact speech timing)...');
  const planStart = performance.now();

  let plan = await planProduction({
    script: scriptForPlanning,
    durationEstimate: ttsResult.audioDuration,
    style: request.style ?? 'dynamic',
    toolManifest: manifest,
    primaryVideoUrl: request.primaryVideoUrl,
    layout: request.layout,
    timingReference,
    montageProfile,
  });

  steps.push({
    name: 'Production planning',
    durationMs: performance.now() - planStart,
    detail: `${plan.shots.length} shots, ${plan.effects.length} effects, layout: ${plan.layout}`,
  });

  log.info(
    {
      shots: plan.shots.length,
      effects: plan.effects.length,
      primaryType: plan.primarySource.type,
      shotDetails: plan.shots.map((s) => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: +(s.endTime - s.startTime).toFixed(1),
        type: s.visual.type,
        toolId: 'toolId' in s.visual ? s.visual.toolId : undefined,
        prompt: 'prompt' in s.visual ? (s.visual.prompt as string) : undefined,
        searchQuery: 'searchQuery' in s.visual ? s.visual.searchQuery : undefined,
      })),
      reasoning: plan.reasoning,
    },
    'Plan created'
  );

  // Pipeline logging: plan
  pipelineLogger?.logStep(
    'plan',
    performance.now() - planStart,
    { script: scriptForPlanning, tools: manifest.summary, style: request.style ?? 'dynamic' },
    plan
  );
  pipelineLogger?.saveArtifact('02-plan.json', JSON.stringify(plan, null, 2));

  // Log full prompts separately for easy debugging
  for (const s of plan.shots) {
    if ('prompt' in s.visual && s.visual.prompt) {
      log.info(
        { shotId: s.id, toolId: (s.visual as { toolId: string }).toolId, prompt: s.visual.prompt },
        'Shot prompt'
      );
    }
  }

  // ── 3b. SUPERVISOR REVIEW ──────────────────────────────────
  onProgress?.('Supervisor reviewing plan...');
  const supervision = await supervisePlan({
    plan,
    script: request.script,
    audioDuration: ttsResult.audioDuration,
    style: request.style ?? 'dynamic',
    toolManifest: manifest,
    timingReference,
    montageProfile,
  });
  plan = supervision.plan;
  log.info(
    {
      approved: supervision.approved,
      iterations: supervision.iterations,
      reviews: supervision.reviews,
    },
    'Supervisor review complete'
  );

  // Pipeline logging: supervisor reviews
  pipelineLogger?.logStep(
    'supervisor-reviews',
    0, // supervisor timing is internal to supervisePlan
    { planVersion: 'initial' },
    supervision.reviews
  );
  pipelineLogger?.saveArtifact('03-supervisor.json', JSON.stringify(supervision.reviews, null, 2));

  // ── 3c. PROMPT EXPANSION ────────────────────────────────────
  // Expand short briefs into detailed AI prompts using a cheap/fast model
  if (isPromptWriterEnabled()) {
    const aiShots = plan.shots.filter(
      (s) => s.visual.type === 'ai-image' || s.visual.type === 'ai-video'
    );

    if (aiShots.length > 0) {
      onProgress?.(`Expanding ${aiShots.length} shot briefs into detailed prompts...`);
      const expandStart = performance.now();

      const briefs: ShotBrief[] = aiShots.map((shot) => {
        const visual = shot.visual as {
          type: 'ai-image' | 'ai-video';
          prompt: string;
          toolId: string;
        };
        return {
          shotId: shot.id,
          description: visual.prompt,
          toolId: visual.toolId,
          assetType: visual.type,
          durationSeconds:
            visual.type === 'ai-video' ? +(shot.endTime - shot.startTime).toFixed(1) : undefined,
          aspectRatio: request.layout === 'fullscreen' ? '9:16' : '16:9',
          scriptSegment: shot.scriptSegment || undefined,
        };
      });

      const expandedPrompts = await Promise.all(briefs.map((brief) => writePrompt(brief)));

      // Replace briefs with expanded prompts in the plan
      const expandedMap = new Map<string, string>();
      for (let i = 0; i < briefs.length; i++) {
        expandedMap.set(briefs[i].shotId, expandedPrompts[i]);
      }

      plan = {
        ...plan,
        shots: plan.shots.map((shot) => {
          const expanded = expandedMap.get(shot.id);
          if (expanded && (shot.visual.type === 'ai-image' || shot.visual.type === 'ai-video')) {
            return { ...shot, visual: { ...shot.visual, prompt: expanded } };
          }
          return shot;
        }),
      };

      steps.push({
        name: 'Prompt expansion',
        durationMs: performance.now() - expandStart,
        detail: `${aiShots.length} briefs expanded into detailed prompts`,
      });

      log.info({ expandedCount: aiShots.length }, 'Shot briefs expanded into detailed prompts');

      // Pipeline logging: prompt expansion — save both briefs and expanded prompts
      const promptPairs: Array<{ shotId: string; brief: string; expanded: string }> = [];
      for (let i = 0; i < briefs.length; i++) {
        const shotId = briefs[i].shotId;
        const briefText = briefs[i].description;
        const expandedText = expandedPrompts[i];
        promptPairs.push({ shotId, brief: briefText, expanded: expandedText });

        // Save individual prompt files (fire-and-forget)
        pipelineLogger?.saveArtifact(`04-prompts/${shotId}-brief.txt`, briefText);
        pipelineLogger?.saveArtifact(`04-prompts/${shotId}-expanded.txt`, expandedText);
      }

      pipelineLogger?.logStep(
        'prompt-expansion',
        performance.now() - expandStart,
        briefs.map((b) => ({ shotId: b.shotId, brief: b.description })),
        promptPairs
      );
    }
  }

  // ── 4. GENERATE ASSETS ─────────────────────────────────────
  onProgress?.('Generating visual assets...');
  const genStart = performance.now();

  const rawAssets = await generateAssets(plan, registry, onProgress);

  steps.push({
    name: 'Asset generation',
    durationMs: performance.now() - genStart,
    detail: `${rawAssets.length} assets generated`,
  });

  // Pipeline logging: asset generation (per shot)
  for (const asset of rawAssets) {
    pipelineLogger?.logStep(
      'asset-generation',
      0,
      { shotId: asset.shotId, toolId: asset.toolId },
      { url: asset.url, type: asset.type, durationSeconds: asset.durationSeconds }
    );
  }

  // ── 4b. PERSIST ASSETS TO STORAGE ───────────────────────────
  // Re-upload external provider URLs to our storage so they don't expire during render
  onProgress?.('Persisting assets to storage...');
  const persistStart = performance.now();

  const assets = await persistAssetsToStorage(rawAssets, request.jobId, log);

  steps.push({
    name: 'Asset persistence',
    durationMs: performance.now() - persistStart,
    detail: `${assets.length} assets persisted`,
  });

  // Pipeline logging: asset persistence
  for (const asset of assets) {
    pipelineLogger?.logStep(
      'asset-persistence',
      0,
      { originalUrl: rawAssets.find((r) => r.shotId === asset.shotId)?.url },
      { storageUrl: asset.url }
    );
  }

  // ── 5. VALIDATE & ASSEMBLE COMPOSITION ─────────────────────
  onProgress?.('Validating plan...');
  const validation = validatePlan(plan, ttsResult.audioDuration);
  if (validation.issues.length > 0) {
    log.info({ issues: validation.issues }, 'Plan validation issues found and auto-fixed');
    plan = validation.fixedPlan;
  }

  onProgress?.('Assembling composition...');

  const voiceoverUrl = await uploadVoiceover(ttsResult.voiceoverPath);

  const props = assembleComposition({
    plan,
    assets,
    cues: ttsResult.cues,
    voiceoverFilename: voiceoverUrl,
    brandPreset: request.brandPreset,
  });

  // Pipeline logging: composition assembly
  pipelineLogger?.logStep('composition-assembly', 0, { planLayout: plan.layout }, props);
  pipelineLogger?.saveArtifact('06-composition.json', JSON.stringify(props, null, 2));

  // ── 6. RENDER ──────────────────────────────────────────────
  const { outputPath, step: renderStep } = await renderVideo(
    props as unknown as Record<string, unknown>,
    request.outputPath,
    onProgress
  );
  steps.push(renderStep);

  // Pipeline logging: render
  pipelineLogger?.logStep(
    'render',
    renderStep.durationMs,
    { layout: props.layout, outputPath },
    { sizeBytes: renderStep.detail, durationMs: renderStep.durationMs }
  );

  // Persist full pipeline log (awaited — this is the final step)
  if (pipelineLogger) {
    await pipelineLogger.persist();
  }

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // cleanup errors are non-fatal
  }

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0);
  onProgress?.(`Done! ${(totalMs / 1000).toFixed(1)}s total`);

  return {
    outputPath,
    durationSeconds: ttsResult.audioDuration,
    plan,
    steps,
    generatedAssets: assets,
    pipelineLogSummary: pipelineLogger?.getSummary(),
  };
}

/**
 * Compose pipeline: user provides all materials + descriptions, LLM arranges them.
 * No tool discovery, no asset generation — LLM decides what goes where.
 *
 * Use cases:
 * - Talking head + screenshoty → LLM decyduje kiedy co pokazać
 * - Kilka klipów video + obrazki → LLM montuje timeline
 * - Screen recording + talking head → LLM robi split/PiP layout
 */
export async function produceComposition(request: ComposeRequest): Promise<ProductionResult> {
  const MAX_SCRIPT_LENGTH = 50_000;
  if (!request.script || request.script.length > MAX_SCRIPT_LENGTH) {
    throw new Error(`Script must be between 1 and ${MAX_SCRIPT_LENGTH} characters`);
  }
  if (!request.assets || request.assets.length === 0) {
    throw new Error('At least one asset is required');
  }
  if (request.assets.length > 50) {
    throw new Error('Maximum 50 assets allowed');
  }

  // Wrap entire pipeline in job context so nested calls (LLM, tools) can access jobId
  const jobId = request.jobId;
  if (jobId) {
    return runWithJobId(jobId, () => produceCompositionInner(request));
  }
  return produceCompositionInner(request);
}

async function produceCompositionInner(request: ComposeRequest): Promise<ProductionResult> {
  const log = request.jobId ? baseLog.child({ jobId: request.jobId }) : baseLog;
  const pipelineLogger = request.jobId ? new PipelineLogger(request.jobId) : null;

  const steps: ProductionStep[] = [];
  const onProgress = request.onProgress;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-compose-'));

  // ── 1. TTS (or use existing) ────────────────────────────────
  let voiceoverPath: string;
  let audioDuration: number;
  let cues: TTSPipelineResult['cues'];

  if (request.existingCues && request.existingVoiceoverPath) {
    onProgress?.('Using existing voiceover and cues...');
    voiceoverPath = request.existingVoiceoverPath;
    // Estimate duration from longest video asset or cues
    const maxCueEnd = Math.max(...request.existingCues.map((c) => c.endTime), 0);
    const maxAssetDuration = Math.max(...request.assets.map((a) => a.durationSeconds ?? 0), 0);
    audioDuration = Math.max(maxCueEnd, maxAssetDuration);
    cues = [...request.existingCues];
  } else if (request.existingVoiceoverPath) {
    onProgress?.('Transcribing existing voiceover...');
    voiceoverPath = request.existingVoiceoverPath;
    const rawBuf = fs.readFileSync(voiceoverPath);
    const ext = path.extname(voiceoverPath).replace('.', '') || 'mp3';
    const wavBuffer = normalizeAudioForWhisper(rawBuf, ext);
    audioDuration = getAudioDuration(rawBuf, ext);

    const transcription = await transcribeAudio(wavBuffer, {
      apiKey: request.whisper?.apiKey,
      language: request.tts?.language?.split('-')[0],
      text: request.script,
      durationSeconds: audioDuration,
    });

    const composePresetConfig = resolvePresetConfig(request.brandPreset);
    cues = groupWordsIntoCues(
      transcription.words,
      {
        maxWordsPerCue: composePresetConfig.maxWordsPerCue,
        maxDurationPerCue: composePresetConfig.maxDurationPerCue,
        breakOnPunctuation: true,
      },
      composePresetConfig.animationStyle
    ).map((c) => ({
      id: c.id,
      text: c.text,
      startTime: c.startTime,
      endTime: c.endTime,
      words: c.words?.map((w) => ({ text: w.text, startTime: w.startTime, endTime: w.endTime })),
      animationStyle: c.animationStyle,
    }));
  } else {
    const ttsResult = await runTTSPipeline(
      {
        script: request.script,
        tts: request.tts,
        whisper: request.whisper,
        brandPreset: request.brandPreset,
      },
      tmpDir,
      onProgress
    );
    voiceoverPath = ttsResult.voiceoverPath;
    audioDuration = ttsResult.audioDuration;
    cues = ttsResult.cues;
    steps.push(...ttsResult.steps);
  }

  // ── 2. BUILD TIMING REFERENCE ──────────────────────────────
  // Extract transcription words from cues for timing reference
  const allWords: Array<{ text: string; startTime: number; endTime: number }> = [];
  for (const cue of cues) {
    if (cue.words) {
      allWords.push(...cue.words);
    }
  }
  const timingReference = allWords.length > 0 ? buildTimingReference(allWords) : undefined;

  // ── 2b. SCRIPT REVIEW (fact-check before planning) ──────────
  let composeScriptForPlanning = request.script;
  if (isScriptReviewEnabled()) {
    onProgress?.('Reviewing script for factual errors...');
    const reviewStart = performance.now();

    const scriptReview = await reviewScript(request.script);

    steps.push({
      name: 'Script review',
      durationMs: performance.now() - reviewStart,
      detail: scriptReview.approved
        ? 'Script approved'
        : `${scriptReview.issues.length} issue(s) found`,
    });

    if (!scriptReview.approved) {
      log.info(
        {
          issues: scriptReview.issues,
          suggestions: scriptReview.suggestions,
          hasCorrectedScript: !!scriptReview.correctedScript,
        },
        'Script review found issues'
      );

      if (scriptReview.correctedScript) {
        log.info('Using corrected script from reviewer');
        composeScriptForPlanning = scriptReview.correctedScript;
      }
    } else {
      log.info('Script review passed');
    }

    // Pipeline logging: script review
    pipelineLogger?.logStep(
      'script-review',
      performance.now() - reviewStart,
      { script: request.script },
      scriptReview
    );
    pipelineLogger?.saveArtifact('01-script-review.json', JSON.stringify(scriptReview, null, 2));
  }

  // ── 3. LLM COMPOSITION PLANNING (with exact timestamps) ────
  onProgress?.('LLM composing timeline (with exact speech timing)...');
  const planStart = performance.now();

  let plan = await planComposition({
    script: composeScriptForPlanning,
    durationEstimate: audioDuration,
    style: request.style ?? 'educational',
    assets: request.assets,
    layout: request.layout,
    directorNotes: request.directorNotes,
    timingReference,
  });

  // Force layout from request — LLM may override it but user's choice takes priority
  if (request.layout && plan.layout !== request.layout) {
    log.info(
      { requested: request.layout, planned: plan.layout },
      'Overriding LLM layout with request layout'
    );
    plan = { ...plan, layout: request.layout };
  }

  steps.push({
    name: 'Composition planning',
    durationMs: performance.now() - planStart,
    detail: `${plan.shots.length} shots, ${plan.effects.length} effects`,
  });

  // Pipeline logging: plan
  pipelineLogger?.logStep(
    'plan',
    performance.now() - planStart,
    { script: composeScriptForPlanning, style: request.style ?? 'educational' },
    plan
  );
  pipelineLogger?.saveArtifact('02-plan.json', JSON.stringify(plan, null, 2));

  // ── 4. BUILD ASSET MAP (resolve asset IDs → URLs) ───────────
  // No adjustTimeline needed — director planned to exact timestamps
  const assetMap = new Map(request.assets.map((a) => [a.id, a]));
  const resolvedAssets: GeneratedAsset[] = [];

  for (const shot of plan.shots) {
    if (shot.visual.type === 'b-roll' && shot.visual.toolId === 'user-upload') {
      const userAsset = assetMap.get(shot.visual.searchQuery);
      if (userAsset) {
        resolvedAssets.push({
          toolId: 'user-upload',
          shotId: shot.id,
          url: userAsset.url,
          type: userAsset.type === 'image' ? 'stock-image' : 'stock-video',
          durationSeconds: userAsset.durationSeconds,
        });
      } else {
        log.warn(
          { assetId: shot.visual.searchQuery, shotId: shot.id },
          'Referenced asset not found'
        );
      }
    }
  }

  // ── 4b. PERSIST ASSETS TO STORAGE ───────────────────────────
  onProgress?.('Persisting assets to storage...');
  const persistStart = performance.now();

  const persistedAssets = await persistAssetsToStorage(resolvedAssets, request.jobId, log);

  steps.push({
    name: 'Asset persistence',
    durationMs: performance.now() - persistStart,
    detail: `${persistedAssets.length} assets persisted`,
  });

  // Pipeline logging: asset persistence
  for (const asset of persistedAssets) {
    pipelineLogger?.logStep(
      'asset-persistence',
      0,
      { originalUrl: resolvedAssets.find((r) => r.shotId === asset.shotId)?.url },
      { storageUrl: asset.url }
    );
  }

  // ── 5. VALIDATE & ASSEMBLE ──────────────────────────────────
  onProgress?.('Validating plan...');
  const validation = validatePlan(plan, audioDuration);
  if (validation.issues.length > 0) {
    log.info({ issues: validation.issues }, 'Plan validation issues found and auto-fixed');
    plan = validation.fixedPlan;
  }

  onProgress?.('Assembling composition...');

  const voiceoverUrl = await uploadVoiceover(voiceoverPath);

  const primaryAsset = request.assets.find((a) => a.isPrimary);
  const framingMap: Record<string, string> = {
    'bottom-aligned': 'center 85%',
    'top-aligned': 'center 15%',
    centered: 'center',
  };
  const avatarFraming = primaryAsset?.metadata?.avatarFraming ?? 'centered';

  const props = assembleComposition({
    plan,
    assets: persistedAssets,
    cues,
    voiceoverFilename: voiceoverUrl,
    brandPreset: request.brandPreset,
    primaryVideoDurationSeconds: primaryAsset?.durationSeconds,
    primaryVideoObjectPosition: framingMap[avatarFraming] ?? 'center',
  });

  // Pipeline logging: composition assembly
  pipelineLogger?.logStep('composition-assembly', 0, { planLayout: plan.layout }, props);
  pipelineLogger?.saveArtifact('06-composition.json', JSON.stringify(props, null, 2));

  // ── 6. RENDER ───────────────────────────────────────────────
  const { outputPath, step: renderStep } = await renderVideo(
    props as unknown as Record<string, unknown>,
    request.outputPath,
    onProgress
  );
  steps.push(renderStep);

  // Pipeline logging: render
  pipelineLogger?.logStep(
    'render',
    renderStep.durationMs,
    { layout: props.layout, outputPath },
    { sizeBytes: renderStep.detail, durationMs: renderStep.durationMs }
  );

  // Persist full pipeline log (awaited — this is the final step)
  if (pipelineLogger) {
    await pipelineLogger.persist();
  }

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* cleanup non-fatal */
  }

  const totalMs = steps.reduce((sum, s) => sum + s.durationMs, 0);
  onProgress?.(`Done! ${(totalMs / 1000).toFixed(1)}s total`);

  return {
    outputPath,
    durationSeconds: audioDuration,
    plan,
    steps,
    generatedAssets: persistedAssets,
    pipelineLogSummary: pipelineLogger?.getSummary(),
  };
}

// Shared functions (buildTimingReference, resolvePresetConfig, runTTSPipeline,
// uploadVoiceover, renderVideo) are now in base-orchestrator.ts
