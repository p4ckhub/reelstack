/**
 * Generate pipeline - full auto reel from script.
 *
 * Steps: script-review -> discover-tools -> tts -> whisper-timing -> plan ->
 *        supervisor -> prompt-expansion -> asset-gen -> asset-persist -> composition
 *
 * Each step reads from context.results (previous step outputs) and returns
 * its own output to be stored under its step ID.
 *
 * Render is intentionally excluded - the caller (worker/CLI) decides how to render
 * (Lambda vs local vs preview). The pipeline outputs reelProps ready for any renderer.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PipelineDefinition, StepDefinition, PipelineContext } from './pipeline-engine';
import type { TTSPipelineResult, TTSPipelineInput } from './base-orchestrator';
import type { ProductionPlan, ToolManifest, GeneratedAsset, BrandPreset } from '../types';
import type { ScriptReview } from '../planner/script-reviewer';
import type { SupervisorResult } from '../planner/plan-supervisor';
import type { ToolRegistry } from '../registry/tool-registry';
import type { AssemblyInput, AssembledProps } from './composition-assembler';
import type { MontageProfileEntry } from '@reelstack/remotion/catalog';

// ── Step IDs ──────────────────────────────────────────────────

export const GENERATE_STEP_IDS = [
  'script-review',
  'discover-tools',
  'tts',
  'whisper-timing',
  'plan',
  'supervisor',
  'prompt-expansion',
  'asset-gen',
  'asset-persist',
  'composition',
] as const;

export type GenerateStepId = (typeof GENERATE_STEP_IDS)[number];

// ── Dependencies (injected, mockable) ─────────────────────────

export interface GeneratePipelineDeps {
  reviewScript: (script: string) => Promise<ScriptReview>;
  isScriptReviewEnabled: () => boolean;
  runTTSPipeline: (
    request: TTSPipelineInput,
    tmpDir: string,
    onProgress?: (msg: string) => void
  ) => Promise<TTSPipelineResult>;
  buildTimingReference: (
    words: Array<{ text: string; startTime: number; endTime: number }>
  ) => string;
  selectMontageProfile: (script: string, profileId?: string) => MontageProfileEntry;
  planProduction: (args: {
    script: string;
    durationEstimate: number;
    style: string;
    toolManifest: ToolManifest;
    primaryVideoUrl?: string;
    layout?: string;
    timingReference: string;
    montageProfile: MontageProfileEntry;
    preferredToolIds?: string[];
  }) => Promise<ProductionPlan>;
  supervisePlan: (args: {
    plan: ProductionPlan;
    script: string;
    audioDuration: number;
    style: string;
    toolManifest: ToolManifest;
    timingReference?: string;
    montageProfile?: MontageProfileEntry;
  }) => Promise<SupervisorResult>;
  isPromptWriterEnabled: () => boolean;
  expandPrompts: (
    briefs: Array<{
      shotId: string;
      description: string;
      toolId: string;
      assetType: 'ai-image' | 'ai-video';
      durationSeconds?: number;
      aspectRatio?: string;
      scriptSegment?: string;
    }>
  ) => Promise<Array<{ shotId: string; expandedPrompt: string }>>;
  generateAssets: (
    plan: ProductionPlan,
    registry: ToolRegistry,
    onProgress?: (msg: string) => void
  ) => Promise<GeneratedAsset[]>;
  persistAssets: (assets: readonly GeneratedAsset[], jobId: string) => Promise<GeneratedAsset[]>;
  validatePlan: (
    plan: ProductionPlan,
    audioDuration: number
  ) => { issues: string[]; fixedPlan: ProductionPlan | null };
  assembleComposition: (input: AssemblyInput) => AssembledProps;
  uploadVoiceover: (voiceoverPath: string) => Promise<string>;
  renderVideo: (
    props: Record<string, unknown>,
    outputPath?: string,
    onProgress?: (msg: string) => void
  ) => Promise<{ outputPath: string; step: { name: string; durationMs: number; detail?: string } }>;
  discoverTools: () => unknown[];
  createToolRegistry: () => {
    register: (tool: unknown) => void;
    discover: () => Promise<void>;
    getToolManifest: () => ToolManifest;
  };
}

// ── Pipeline factory ──────────────────────────────────────────

/**
 * Generate pipeline - full auto reel from script.
 *
 * Steps: script-review -> discover-tools -> tts -> whisper-timing -> plan ->
 *        supervisor -> prompt-expansion -> asset-gen -> asset-persist -> composition
 */
export function createGeneratePipeline(deps: GeneratePipelineDeps): PipelineDefinition {
  return {
    id: 'generate',
    name: 'Full Auto Generate',
    steps: [
      createScriptReviewStep(deps),
      createDiscoverToolsStep(deps),
      createTTSStep(deps),
      createWhisperTimingStep(deps),
      createPlanStep(deps),
      createSupervisorStep(deps),
      createPromptExpansionStep(deps),
      createAssetGenStep(deps),
      createAssetPersistStep(deps),
      createCompositionStep(deps),
    ],
  };
}

// ── Step creators ─────────────────────────────────────────────

function createScriptReviewStep(deps: GeneratePipelineDeps): StepDefinition {
  return {
    id: 'script-review',
    name: 'Script review (fact-check)',
    dependsOn: [],
    async execute(ctx: PipelineContext) {
      const script = ctx.input.script as string;

      if (!deps.isScriptReviewEnabled()) {
        return { approved: true, issues: [], suggestions: [], scriptForPlanning: script };
      }

      const review = await deps.reviewScript(script);
      const scriptForPlanning = review.correctedScript ?? script;

      return { ...review, scriptForPlanning };
    },
  };
}

function createDiscoverToolsStep(deps: GeneratePipelineDeps): StepDefinition {
  return {
    id: 'discover-tools',
    name: 'Discover available tools',
    dependsOn: [],
    async execute(_ctx: PipelineContext) {
      const registry = deps.createToolRegistry();
      for (const tool of deps.discoverTools()) {
        registry.register(tool);
      }
      await registry.discover();
      const manifest = registry.getToolManifest();
      return { manifest, registry };
    },
  };
}

function createTTSStep(deps: GeneratePipelineDeps): StepDefinition {
  return {
    id: 'tts',
    name: 'Generate voiceover (TTS + Whisper)',
    dependsOn: ['script-review'],
    async execute(ctx: PipelineContext) {
      const reviewResult = ctx.results['script-review'] as { scriptForPlanning: string };
      const script = reviewResult.scriptForPlanning;
      const tmpDir = path.join(os.tmpdir(), `reelstack-pipeline-${ctx.jobId}`);
      fs.mkdirSync(tmpDir, { recursive: true });

      const ttsResult = await deps.runTTSPipeline(
        {
          script,
          tts: ctx.input.tts as TTSPipelineInput['tts'],
          whisper: ctx.input.whisper as TTSPipelineInput['whisper'],
          brandPreset: ctx.input.brandPreset as BrandPreset | undefined,
        },
        tmpDir,
        ctx.input.onProgress as ((msg: string) => void) | undefined
      );

      return {
        voiceoverPath: ttsResult.voiceoverPath,
        audioDuration: ttsResult.audioDuration,
        transcriptionWords: ttsResult.transcriptionWords,
        cues: ttsResult.cues,
      };
    },
  };
}

function createWhisperTimingStep(deps: GeneratePipelineDeps): StepDefinition {
  return {
    id: 'whisper-timing',
    name: 'Build timing reference + select montage profile',
    dependsOn: ['tts'],
    async execute(ctx: PipelineContext) {
      const ttsResult = ctx.results.tts as TTSPipelineResult;
      const script = ctx.input.script as string;
      const montageProfileId = ctx.input.montageProfile as string | undefined;

      const timingReference = deps.buildTimingReference(ttsResult.transcriptionWords);
      const montageProfile = deps.selectMontageProfile(script, montageProfileId);

      return { timingReference, montageProfile };
    },
  };
}

function createPlanStep(deps: GeneratePipelineDeps): StepDefinition {
  return {
    id: 'plan',
    name: 'Plan production (LLM director)',
    dependsOn: ['script-review', 'discover-tools', 'tts', 'whisper-timing'],
    async execute(ctx: PipelineContext) {
      const reviewResult = ctx.results['script-review'] as { scriptForPlanning: string };
      const toolsResult = ctx.results['discover-tools'] as { manifest: ToolManifest };
      const ttsResult = ctx.results.tts as { audioDuration: number };
      const timingResult = ctx.results['whisper-timing'] as {
        timingReference: string;
        montageProfile: MontageProfileEntry;
      };

      const plan = await deps.planProduction({
        script: reviewResult.scriptForPlanning,
        durationEstimate: ttsResult.audioDuration,
        style: (ctx.input.style as string) ?? 'dynamic',
        toolManifest: toolsResult.manifest,
        primaryVideoUrl: ctx.input.primaryVideoUrl as string | undefined,
        layout: ctx.input.layout as string | undefined,
        timingReference: timingResult.timingReference,
        montageProfile: timingResult.montageProfile,
        preferredToolIds: ctx.input.preferredToolIds as string[] | undefined,
      });

      return { plan };
    },
  };
}

function createSupervisorStep(deps: GeneratePipelineDeps): StepDefinition {
  return {
    id: 'supervisor',
    name: 'Supervisor review',
    dependsOn: ['plan', 'discover-tools', 'whisper-timing', 'tts'],
    async execute(ctx: PipelineContext) {
      const planResult = ctx.results.plan as { plan: ProductionPlan };
      const toolsResult = ctx.results['discover-tools'] as { manifest: ToolManifest };
      const ttsResult = ctx.results.tts as { audioDuration: number };
      const timingResult = ctx.results['whisper-timing'] as {
        timingReference: string;
        montageProfile: MontageProfileEntry;
      };

      const supervision = await deps.supervisePlan({
        plan: planResult.plan,
        script: ctx.input.script as string,
        audioDuration: ttsResult.audioDuration,
        style: (ctx.input.style as string) ?? 'dynamic',
        toolManifest: toolsResult.manifest,
        timingReference: timingResult.timingReference,
        montageProfile: timingResult.montageProfile,
      });

      return {
        plan: supervision.plan,
        approved: supervision.approved,
        iterations: supervision.iterations,
        reviews: supervision.reviews,
      };
    },
  };
}

function createPromptExpansionStep(deps: GeneratePipelineDeps): StepDefinition {
  return {
    id: 'prompt-expansion',
    name: 'Expand shot briefs into detailed prompts',
    dependsOn: ['supervisor'],
    async execute(ctx: PipelineContext) {
      const supervisorResult = ctx.results.supervisor as { plan: ProductionPlan };
      const plan = supervisorResult.plan;

      if (!deps.isPromptWriterEnabled()) {
        return { plan, skipped: true };
      }

      const aiShots = plan.shots.filter(
        (s) => s.visual.type === 'ai-image' || s.visual.type === 'ai-video'
      );

      if (aiShots.length === 0) {
        return { plan, skipped: false };
      }

      const briefs = aiShots.map((shot) => {
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
          aspectRatio: (ctx.input.layout as string) === 'fullscreen' ? '9:16' : '16:9',
          scriptSegment: shot.scriptSegment || undefined,
        };
      });

      const expanded = await deps.expandPrompts(briefs);
      const expandedMap = new Map(expanded.map((e) => [e.shotId, e.expandedPrompt]));

      const updatedPlan = {
        ...plan,
        shots: plan.shots.map((shot) => {
          const expandedPrompt = expandedMap.get(shot.id);
          if (
            expandedPrompt &&
            (shot.visual.type === 'ai-image' || shot.visual.type === 'ai-video')
          ) {
            return { ...shot, visual: { ...shot.visual, prompt: expandedPrompt } };
          }
          return shot;
        }),
      };

      return { plan: updatedPlan, skipped: false };
    },
  };
}

function createAssetGenStep(deps: GeneratePipelineDeps): StepDefinition {
  return {
    id: 'asset-gen',
    name: 'Generate visual assets',
    dependsOn: ['prompt-expansion', 'discover-tools'],
    async execute(ctx: PipelineContext) {
      const expansionResult = ctx.results['prompt-expansion'] as { plan: ProductionPlan };
      const toolsResult = ctx.results['discover-tools'] as { registry: ToolRegistry };
      const onProgress = ctx.input.onProgress as ((msg: string) => void) | undefined;

      const assets = await deps.generateAssets(
        expansionResult.plan,
        toolsResult.registry,
        onProgress
      );

      return { assets };
    },
  };
}

function createAssetPersistStep(deps: GeneratePipelineDeps): StepDefinition {
  return {
    id: 'asset-persist',
    name: 'Persist assets to storage',
    dependsOn: ['asset-gen'],
    async execute(ctx: PipelineContext) {
      const assetGenResult = ctx.results['asset-gen'] as { assets: GeneratedAsset[] };

      const assets = await deps.persistAssets(assetGenResult.assets, ctx.jobId);

      return { assets };
    },
  };
}

function createCompositionStep(deps: GeneratePipelineDeps): StepDefinition {
  return {
    id: 'composition',
    name: 'Assemble composition (ReelProps)',
    dependsOn: ['asset-persist', 'prompt-expansion', 'tts'],
    async execute(ctx: PipelineContext) {
      const expansionResult = ctx.results['prompt-expansion'] as { plan: ProductionPlan };
      const persistResult = ctx.results['asset-persist'] as { assets: GeneratedAsset[] };
      const ttsResult = ctx.results.tts as TTSPipelineResult;

      let plan = expansionResult.plan;
      const audioDuration = ttsResult.audioDuration;

      // Validate and auto-fix plan
      const validation = deps.validatePlan(plan, audioDuration);
      if (validation.issues.length > 0 && validation.fixedPlan) {
        plan = validation.fixedPlan;
      }

      // Upload voiceover
      const voiceoverUrl = await deps.uploadVoiceover(ttsResult.voiceoverPath);

      // Assemble
      const reelProps = deps.assembleComposition({
        plan,
        assets: persistResult.assets,
        cues: ttsResult.cues,
        voiceoverFilename: voiceoverUrl,
        brandPreset: ctx.input.brandPreset as BrandPreset | undefined,
      });

      return { reelProps, plan };
    },
  };
}
