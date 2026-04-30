/**
 * Slideshow module descriptor.
 *
 * Generates branded image slideshows from text.
 * Uses @reelstack/image-gen for PNG rendering — zero external API keys required.
 */

import type { ReelModule, BaseModuleRequest, ModuleResult, ModuleRuntime } from '@reelstack/agent';
import { registerModule, callLLM } from '@reelstack/agent';
import { compositionPath } from '@reelstack/hyperframes';
import { produceSlideshow, buildSlideshowPipeline } from './orchestrator';
import type { Slide } from './types';

export const slideshowModule: ReelModule = {
  id: 'slideshow',
  name: 'Slideshow (Image Slides + Voiceover)',
  // Legacy field — kept for BC. New code reads `runtimes`.
  compositionId: 'Slideshow',
  runtimes: {
    remotion: { compositionId: 'Slideshow' },
    hyperframes: { compositionId: compositionPath('slideshow') },
  },
  defaultRuntime: 'remotion',

  configFields: [
    { name: 'topic', type: 'string', required: true, description: 'Topic for slide generation' },
    {
      name: 'slides',
      type: 'array',
      required: false,
      description: 'Manual slides [{title, text, badge}] — skips LLM',
    },
    {
      name: 'numberOfSlides',
      type: 'number',
      required: false,
      description: 'Number of slides (default: 5)',
    },
    {
      name: 'template',
      type: 'string',
      required: false,
      description: 'image-gen template (default: tip-card)',
    },
    {
      name: 'brand',
      type: 'string',
      required: false,
      description: 'image-gen brand CSS (default: example)',
    },
    {
      name: 'size',
      type: 'string',
      required: false,
      description:
        "image-gen size preset: 'story' (1080×1920, default), 'carousel' (1080×1350, IG feed), 'post' (1080×1080), or 'WxH' custom",
    },
  ],

  progressSteps: {
    'Generating slideshow script...': 5,
    'Rendering slide': 15,
    'Uploading slide images...': 35,
    'Generating voiceover...': 45,
    'Transcribing audio...': 55,
    'Assembling composition...': 70,
    'Rendering video...': 80,
  },

  async orchestrate(
    base: BaseModuleRequest,
    config: Record<string, unknown>,
    runtime?: ModuleRuntime
  ): Promise<ModuleResult> {
    const result = await produceSlideshow({
      jobId: base.jobId,
      topic: config.topic as string,
      slides: config.slides as Slide[] | undefined,
      numberOfSlides: config.numberOfSlides as number | undefined,
      template: config.template as string | undefined,
      brand: config.brand as string | undefined,
      size: config.size as string | undefined,
      language: base.language,
      tts: base.tts,
      whisper: base.whisper,
      brandPreset: base.brandPreset,
      musicUrl: base.musicUrl,
      musicVolume: base.musicVolume,
      highlightMode: config.highlightMode as string | undefined,
      llmCall: callLLM,
      onProgress: base.onProgress,
      runtime: runtime ?? 'remotion',
    });

    return {
      outputPath: result.outputPath,
      durationSeconds: result.durationSeconds,
      meta: { slides: result.script.slides.length, runtime: runtime ?? 'remotion' },
    };
  },

  // Multi-step pipeline: re-render after CSS tweak = ~10s, $0 LLM/TTS/image-gen.
  buildPipeline(base, _config, runtime) {
    return buildSlideshowPipeline(base, _config, runtime ?? 'remotion', { llmCall: callLLM });
  },
};

// Self-register on import
registerModule(slideshowModule);
