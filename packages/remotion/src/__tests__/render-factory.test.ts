import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../render/local-renderer', () => ({
  LocalRenderer: vi.fn(),
}));

vi.mock('../render/lambda-renderer', () => ({
  LambdaRenderer: vi.fn(),
}));

const { createRenderer } = await import('../render/index');
const { LocalRenderer } = await import('../render/local-renderer');
const { LambdaRenderer } = await import('../render/lambda-renderer');

describe('createRenderer', () => {
  const originalEnv = process.env.REMOTION_RENDERER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.REMOTION_RENDERER;
    } else {
      process.env.REMOTION_RENDERER = originalEnv;
    }
  });

  it('returns LocalRenderer by default', () => {
    delete process.env.REMOTION_RENDERER;
    const renderer = createRenderer();
    expect(renderer).toBeInstanceOf(LocalRenderer);
  });

  it('returns LocalRenderer when REMOTION_RENDERER=local', () => {
    process.env.REMOTION_RENDERER = 'local';
    const renderer = createRenderer();
    expect(renderer).toBeInstanceOf(LocalRenderer);
  });

  it('returns LambdaRenderer when REMOTION_RENDERER=lambda', () => {
    process.env.REMOTION_RENDERER = 'lambda';
    const renderer = createRenderer();
    expect(renderer).toBeInstanceOf(LambdaRenderer);
  });
});
