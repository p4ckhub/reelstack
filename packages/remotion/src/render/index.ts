import { LocalRenderer } from './local-renderer';
import { LambdaRenderer } from './lambda-renderer';
import type { RemotionRenderer } from './types';

export function createRenderer(): RemotionRenderer {
  const mode = process.env.REMOTION_RENDERER ?? 'local';
  if (mode === 'lambda') return new LambdaRenderer();
  return new LocalRenderer();
}

export type { RemotionRenderer, RenderOptions, RenderResult } from './types';
