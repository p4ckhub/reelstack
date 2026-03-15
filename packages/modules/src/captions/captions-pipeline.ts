/**
 * Captions pipeline definitions for PipelineEngine.
 *
 * Three sub-modes with different step sequences:
 * - transcribe: extract-audio -> whisper -> build-props -> render
 * - script:     tts -> whisper -> build-props -> render
 * - cues:       build-props -> render
 */
import type { PipelineDefinition, StepDefinition, PipelineContext } from '@reelstack/agent';
import type { VideoClipProps } from '@reelstack/remotion/schemas/video-clip-props';

// ── Dependencies (injected, mockable) ─────────────────────────

export interface CaptionsPipelineDeps {
  extractAudio: (ctx: PipelineContext) => Promise<{ audioPath: string }>;
  runWhisper: (ctx: PipelineContext) => Promise<{
    words: Array<{ text: string; startTime: number; endTime: number }>;
    cues: Array<{
      id: string;
      text: string;
      startTime: number;
      endTime: number;
      words?: Array<{ text: string; startTime: number; endTime: number }>;
    }>;
  }>;
  runTTSPipeline: (ctx: PipelineContext) => Promise<{
    voiceoverPath: string;
    audioDuration: number;
    transcriptionWords: Array<{ text: string; startTime: number; endTime: number }>;
    cues: Array<{
      id: string;
      text: string;
      startTime: number;
      endTime: number;
      words?: Array<{ text: string; startTime: number; endTime: number }>;
    }>;
    steps: unknown[];
  }>;
  buildCaptionsProps: (ctx: PipelineContext) => VideoClipProps;
  renderVideo: (ctx: PipelineContext) => Promise<{ outputPath: string }>;
  uploadVoiceover: (voiceoverPath: string) => Promise<string>;
}

export type CaptionsSubMode = 'transcribe' | 'script' | 'cues';

// ── Pipeline factory ──────────────────────────────────────────

export function createCaptionsPipeline(
  mode: CaptionsSubMode,
  deps: CaptionsPipelineDeps
): PipelineDefinition {
  const steps = buildStepsForMode(mode, deps);

  return {
    id: 'captions',
    name: `Captions (${mode})`,
    steps,
  };
}

// ── Step builders per mode ────────────────────────────────────

function buildStepsForMode(mode: CaptionsSubMode, deps: CaptionsPipelineDeps): StepDefinition[] {
  switch (mode) {
    case 'transcribe':
      return [
        createExtractAudioStep(deps),
        createWhisperStep(deps, ['extract-audio']),
        createBuildPropsStep(deps, ['whisper']),
        createRenderStep(deps),
      ];
    case 'script':
      return [
        createTTSStep(deps),
        createWhisperStep(deps, ['tts']),
        createBuildPropsStep(deps, ['whisper']),
        createRenderStep(deps),
      ];
    case 'cues':
      return [createBuildPropsStep(deps, []), createRenderStep(deps)];
  }
}

// ── Individual step creators ──────────────────────────────────

function createExtractAudioStep(deps: CaptionsPipelineDeps): StepDefinition {
  return {
    id: 'extract-audio',
    name: 'Extract audio from video',
    dependsOn: [],
    async execute(ctx: PipelineContext) {
      return deps.extractAudio(ctx);
    },
  };
}

function createTTSStep(deps: CaptionsPipelineDeps): StepDefinition {
  return {
    id: 'tts',
    name: 'Generate voiceover (TTS)',
    dependsOn: [],
    async execute(ctx: PipelineContext) {
      const result = await deps.runTTSPipeline(ctx);
      const voiceoverUrl = await deps.uploadVoiceover(result.voiceoverPath);
      return { ...result, voiceoverUrl };
    },
  };
}

function createWhisperStep(deps: CaptionsPipelineDeps, dependsOn: string[]): StepDefinition {
  return {
    id: 'whisper',
    name: 'Transcribe audio (Whisper)',
    dependsOn,
    async execute(ctx: PipelineContext) {
      return deps.runWhisper(ctx);
    },
  };
}

function createBuildPropsStep(deps: CaptionsPipelineDeps, dependsOn: string[]): StepDefinition {
  return {
    id: 'build-props',
    name: 'Build composition props',
    dependsOn,
    async execute(ctx: PipelineContext) {
      return deps.buildCaptionsProps(ctx);
    },
  };
}

function createRenderStep(deps: CaptionsPipelineDeps): StepDefinition {
  return {
    id: 'render',
    name: 'Render video',
    dependsOn: ['build-props'],
    async execute(ctx: PipelineContext) {
      return deps.renderVideo(ctx);
    },
  };
}
