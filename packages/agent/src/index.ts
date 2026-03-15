// ── Core orchestration ────────────────────────────────────────
export { produce, produceComposition } from './orchestrator/production-orchestrator';
export {
  buildTimingReference,
  resolvePresetConfig,
  runTTSPipeline,
  uploadVoiceover,
  renderVideo,
} from './orchestrator/base-orchestrator';
export type {
  TTSPipelineResult,
  TTSPipelineInput,
  RenderResult,
} from './orchestrator/base-orchestrator';
export { createVideoGenerator } from './generators/video-generator';
export { createBestVideoGenerator } from './generators/video-generator-factory';
export type {
  VideoGenerator,
  VideoGeneratorInput,
  VideoGeneratorResult,
  VideoGeneratorOptions,
} from './generators/video-generator';
export type { VideoGeneratorFactoryOptions } from './generators/video-generator-factory';
export { createImageGenerator } from './generators/image-generator';
export type {
  ImageGenerator,
  ImageGeneratorInput,
  ImageGeneratorResult,
  ImageGeneratorOptions,
} from './generators/image-generator';
export { callLLM, callLLMWithSystem, detectProvider, detectCheapProvider } from './llm';
export type { LLMProvider, LLMCallOptions } from './llm';
export { getModel } from './config/models';
export type { ModelRole } from './config/models';
export { ToolRegistry } from './registry/tool-registry';
export { discoverTools } from './registry/discovery';
export { discoverAvailableTools, findFirstAvailableTool } from './registry/tool-helpers';
export { planProduction, planComposition, revisePlan } from './planner/production-planner';
export {
  selectMontageProfile,
  buildProfileGuidelines,
  buildProfileSupervisorChecks,
} from './planner/montage-profile';
export { generateAssets } from './orchestrator/asset-generator';
export { assembleComposition } from './orchestrator/composition-assembler';
export type { AssemblyInput, AssembledProps } from './orchestrator/composition-assembler';
export { adjustTimeline } from './orchestrator/timeline-adjuster';
export { validatePlan } from './planner/plan-validator';
export { supervisePlan } from './planner/plan-supervisor';
export type { SupervisorResult } from './planner/plan-supervisor';
export { reviewScript, isScriptReviewEnabled } from './planner/script-reviewer';
export { writePrompt, isPromptWriterEnabled } from './planner/prompt-writer';
export { persistAssetsToStorage } from './orchestrator/asset-persistence';
export { pollUntilDone } from './polling';
export { AgentError, PlanningError, GenerationError } from './errors';
export { PipelineLogger } from './orchestrator/pipeline-logger';
export type {
  PipelineLog,
  PipelineStep as PipelineLogStep,
  PipelineLogSummary,
} from './orchestrator/pipeline-logger';
export { PipelineEngine } from './orchestrator/pipeline-engine';
export type {
  PipelineContext,
  StepDefinition,
  StepStatus,
  PipelineResult,
  PipelineDefinition,
} from './orchestrator/pipeline-engine';
export { createGeneratePipeline, GENERATE_STEP_IDS } from './orchestrator/generate-pipeline';
export type { GeneratePipelineDeps, GenerateStepId } from './orchestrator/generate-pipeline';

// ── Module system ─────────────────────────────────────────────
// Import modules/index to trigger built-in module registration.
// When modules move to closed repos, remove this import and let
// the consuming app import modules explicitly.
export {
  registerModule,
  getModule,
  listModules,
  isModuleMode,
  isCoreMode,
  CORE_MODES,
} from './modules';
export type { ReelModule, BaseModuleRequest, ModuleResult, ProgressCallback } from './modules';

export { detectLanguage } from './utils/detect-language';
export { getJobId, runWithJobId, jobContext } from './context';

// ── Types ─────────────────────────────────────────────────────
export type { ProductionTool } from './registry/tool-interface';
export type {
  ProductionRequest,
  ComposeRequest,
  UserAsset,
  ProductionResult,
  ProductionPlan,
  ProductionStep,
  ShotPlan,
  EffectPlan,
  GeneratedAsset,
  AssetType,
  AssetGenerationRequest,
  AssetGenerationJob,
  AssetGenerationStatus,
  ToolCapability,
  ToolManifest,
  ToolManifestEntry,
  CostTier,
  BrandPreset,
} from './types';

/**
 * Creates a production agent and runs the full pipeline.
 * Convenience wrapper over produce().
 */
export async function createProductionAgent() {
  const { produce: produceFn } = await import('./orchestrator/production-orchestrator');
  return { produce: produceFn };
}

// ── Content + Montage system ──────────────────────────────────
export type {
  ContentPackage,
  ContentSection,
  ContentAsset,
  PrimaryVideo,
  CaptionCue as ContentCaptionCue,
  ContentMetadata,
  AssetFillMode,
  EffectsMode,
} from './content/content-package';
export {
  buildTemplatePlan,
  registerTemplate,
  getTemplate,
  listTemplates,
} from './content/template-montage';
export type { TemplateMontageConfig, ShotTemplate } from './content/template-montage';
export { renderContentPackage } from './content/render-content';
export type { RenderContentRequest, RenderContentResult } from './content/render-content';
