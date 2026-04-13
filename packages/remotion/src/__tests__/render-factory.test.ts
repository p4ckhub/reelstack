import { describe, it, expect, afterEach } from 'vitest';
import { createRenderer } from '../render/index';

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
    expect(renderer.constructor.name).toBe('LocalRenderer');
  });

  it('returns LocalRenderer when REMOTION_RENDERER=local', () => {
    process.env.REMOTION_RENDERER = 'local';
    const renderer = createRenderer();
    expect(renderer.constructor.name).toBe('LocalRenderer');
  });

  it('returns LambdaRenderer when REMOTION_RENDERER=lambda', () => {
    process.env.REMOTION_RENDERER = 'lambda';
    // LambdaRenderer constructor requires these env vars
    process.env.AWS_REGION = 'eu-central-1';
    process.env.REMOTION_LAMBDA_FUNCTION_NAME = 'test-function';
    process.env.REMOTION_LAMBDA_SERVE_URL = 'https://test-serve-url.example.com';
    try {
      const renderer = createRenderer();
      expect(renderer.constructor.name).toBe('LambdaRenderer');
    } finally {
      delete process.env.AWS_REGION;
      delete process.env.REMOTION_LAMBDA_FUNCTION_NAME;
      delete process.env.REMOTION_LAMBDA_SERVE_URL;
    }
  });
});
