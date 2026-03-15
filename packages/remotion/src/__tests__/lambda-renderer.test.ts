import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LambdaRenderer } from '../render/lambda-renderer';

describe('LambdaRenderer', () => {
  beforeEach(() => {
    delete process.env.AWS_REGION;
    delete process.env.REMOTION_LAMBDA_FUNCTION_NAME;
    delete process.env.REMOTION_LAMBDA_SERVE_URL;
  });

  it('throws when env vars are missing', () => {
    expect(() => new LambdaRenderer()).toThrow(
      'Lambda renderer requires: AWS_REGION, REMOTION_LAMBDA_FUNCTION_NAME, REMOTION_LAMBDA_SERVE_URL',
    );
  });

  it('constructs when all env vars are set', () => {
    process.env.AWS_REGION = 'eu-central-1';
    process.env.REMOTION_LAMBDA_FUNCTION_NAME = 'remotion-render-test';
    process.env.REMOTION_LAMBDA_SERVE_URL = 'https://example.s3.amazonaws.com/sites/test';

    const renderer = new LambdaRenderer();
    expect(renderer).toBeInstanceOf(LambdaRenderer);
  });
});
