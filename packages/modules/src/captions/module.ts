/**
 * Captions module descriptor.
 *
 * Overlays captions on an existing video.
 * - With cues: burns pre-computed captions directly (no TTS).
 * - With script: runs TTS pipeline to generate voiceover + captions.
 */

import type { ReelModule, BaseModuleRequest, ModuleResult } from '@reelstack/agent';
import { registerModule } from '@reelstack/agent';
import { produceCaptions } from './orchestrator';

export const captionsModule: ReelModule = {
  id: 'captions',
  name: 'Captions (Overlay captions on existing video)',
  compositionId: 'VideoClip',

  configFields: [
    {
      name: 'videoUrl',
      type: 'string',
      required: true,
      description: 'URL of the existing video to caption',
    },
    {
      name: 'highlightMode',
      type: 'string',
      required: false,
      description: 'Caption highlight mode (text, single-word, pill, hormozi, glow, etc.)',
    },
    {
      name: 'captionStyle',
      type: 'object',
      required: false,
      description: 'Caption styling overrides (fontSize, fontColor, highlightColor, position)',
    },
  ],

  progressSteps: {
    'Generating voiceover...': 20,
    'Uploading voiceover...': 40,
    'Assembling composition...': 60,
    'Rendering video...': 75,
  },

  async orchestrate(
    base: BaseModuleRequest,
    config: Record<string, unknown>
  ): Promise<ModuleResult> {
    const result = await produceCaptions({
      jobId: base.jobId,
      videoUrl: config.videoUrl as string,
      cues: config.cues as
        | Array<{ id: string; text: string; startTime: number; endTime: number }>
        | undefined,
      script: config.script as string | undefined,
      highlightMode: config.highlightMode as string | undefined,
      captionStyle: config.captionStyle as
        | {
            fontSize?: number;
            fontColor?: string;
            highlightColor?: string;
            position?: number;
          }
        | undefined,
      language: base.language,
      tts: base.tts,
      whisper: base.whisper,
      brandPreset: base.brandPreset,
      onProgress: base.onProgress,
    });

    return {
      outputPath: result.outputPath,
      durationSeconds: result.durationSeconds,
    };
  },
};

// Self-register on import
registerModule(captionsModule);
