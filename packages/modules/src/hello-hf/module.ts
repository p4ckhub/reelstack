/**
 * hello-hf module — first native Hyperframes module, shipped as the
 * end-to-end proof of Faza 19.B. Renders a portrait title card from
 * three strings (badge, headline, subheadline) using the
 * `@reelstack/hyperframes` `compositions/hello` template.
 *
 * Zero TTS / whisper / asset-gen. Pure renderer smoke-test that every
 * part of the Hyperframes pipeline (dispatcher → CLI subprocess →
 * variable injection → FFmpeg) works inside our job queue.
 *
 * Keep this module alive as a permanent sanity check: if hello-hf
 * starts failing in prod, something is wrong with the HF runtime
 * before any real HF module breaks.
 */

import type { ReelModule, BaseModuleRequest, ModuleResult } from '@reelstack/agent';
import { registerModule, renderVideo } from '@reelstack/agent';
import { compositionPath } from '@reelstack/hyperframes';

export const helloHfModule: ReelModule = {
  id: 'hello-hf',
  name: 'Hello Hyperframes (test)',
  runtime: 'hyperframes',
  compositionId: compositionPath('hello'),

  configFields: [
    {
      name: 'headline',
      type: 'string',
      required: false,
      description: 'Main title text. Default: "Hello Hyperframes".',
    },
    {
      name: 'subheadline',
      type: 'string',
      required: false,
      description: 'Sub-title text under the headline.',
    },
    {
      name: 'badge',
      type: 'string',
      required: false,
      description: 'Pill badge above the headline. Default: "NEW".',
    },
    {
      name: 'durationSeconds',
      type: 'number',
      required: false,
      description: 'Total clip duration in seconds. Default: 5.',
    },
  ],

  progressSteps: {
    'Rendering Hyperframes title card...': 20,
  },

  async orchestrate(
    base: BaseModuleRequest,
    config: Record<string, unknown>
  ): Promise<ModuleResult> {
    const variables = {
      badge: (config.badge as string) ?? 'NEW',
      headline: (config.headline as string) ?? 'Hello Hyperframes',
      subheadline:
        (config.subheadline as string) ?? 'First native Hyperframes render on ReelStack.',
      durationSeconds: (config.durationSeconds as number) ?? 5,
    };

    base.onProgress?.('Rendering Hyperframes title card...');

    const { outputPath } = await renderVideo(
      // `variables` doubles as the renderer's props bag — injected into
      // the composition HTML at render time.
      { ...variables, compositionId: compositionPath('hello') },
      undefined,
      base.onProgress,
      'hyperframes'
    );

    return {
      outputPath,
      durationSeconds: variables.durationSeconds,
      meta: { runtime: 'hyperframes', composition: 'hello' },
    };
  },
};

registerModule(helloHfModule);
