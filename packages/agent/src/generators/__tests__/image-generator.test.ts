import { describe, it, expect, vi } from 'vitest';
import { createImageGenerator } from '../image-generator';
import type { ProductionTool } from '../../registry/tool-interface';
import type { AssetGenerationJob, AssetGenerationStatus } from '../../types';

function createMockTool(overrides?: Partial<ProductionTool>): ProductionTool {
  return {
    id: 'mock-image',
    name: 'Mock Image Tool',
    capabilities: [
      {
        assetType: 'ai-image',
        supportsPrompt: true,
        supportsScript: false,
        maxDurationSeconds: 0,
        estimatedLatencyMs: 3000,
        isAsync: false,
        costTier: 'cheap',
      },
    ],
    healthCheck: vi.fn().mockResolvedValue({ available: true }),
    generate: vi.fn().mockResolvedValue({
      jobId: 'img-123',
      toolId: 'mock-image',
      status: 'completed',
      url: 'https://cdn.example.com/image.png',
    } satisfies AssetGenerationJob),
    ...overrides,
  };
}

describe('ImageGenerator', () => {
  it('generates image with sync tool', async () => {
    const tool = createMockTool();
    const generator = createImageGenerator(tool);

    const result = await generator.generate({
      prompt: 'A cute toaster character',
      aspectRatio: '9:16',
    });

    expect(result.imageUrl).toBe('https://cdn.example.com/image.png');
    expect(tool.generate).toHaveBeenCalledOnce();
  });

  it('polls for async tool', async () => {
    const tool = createMockTool({
      generate: vi.fn().mockResolvedValue({
        jobId: 'img-async',
        toolId: 'mock-image',
        status: 'processing',
      }),
      poll: vi.fn().mockResolvedValue({
        jobId: 'img-async',
        toolId: 'mock-image',
        status: 'completed',
        url: 'https://cdn.example.com/async-image.png',
      } satisfies AssetGenerationStatus),
    });

    const generator = createImageGenerator(tool, { pollIntervalMs: 10 });
    const result = await generator.generate({
      prompt: 'Test',
      aspectRatio: '9:16',
    });

    expect(result.imageUrl).toBe('https://cdn.example.com/async-image.png');
    expect(tool.poll).toHaveBeenCalledOnce();
  });

  it('throws on generation failure', async () => {
    const tool = createMockTool({
      generate: vi.fn().mockResolvedValue({
        jobId: 'img-fail',
        toolId: 'mock-image',
        status: 'failed',
        error: '402 payment required',
      }),
    });

    const generator = createImageGenerator(tool);

    await expect(
      generator.generate({
        prompt: 'Test',
        aspectRatio: '9:16',
      })
    ).rejects.toThrow('402 payment required');
  });

  it('exposes toolId from underlying tool', () => {
    const tool = createMockTool();
    const generator = createImageGenerator(tool);
    expect(generator.toolId).toBe('mock-image');
  });
});

describe('ImageGenerator fallback chain', () => {
  it('uses first tool when it succeeds', async () => {
    const tool1 = createMockTool({ id: 'tool-a', name: 'Tool A' });
    const tool2 = createMockTool({ id: 'tool-b', name: 'Tool B' });

    const generator = createImageGenerator([tool1, tool2]);

    const result = await generator.generate({
      prompt: 'Test',
      aspectRatio: '9:16',
    });

    expect(result.imageUrl).toBe('https://cdn.example.com/image.png');
    expect(tool1.generate).toHaveBeenCalledOnce();
    expect(tool2.generate).not.toHaveBeenCalled();
  });

  it('falls back to second tool when first fails', async () => {
    const tool1 = createMockTool({
      id: 'tool-a',
      name: 'Tool A',
      generate: vi.fn().mockResolvedValue({
        jobId: 'j1',
        toolId: 'tool-a',
        status: 'failed',
        error: 'credits exhausted',
      }),
    });
    const tool2 = createMockTool({ id: 'tool-b', name: 'Tool B' });

    const generator = createImageGenerator([tool1, tool2]);

    const result = await generator.generate({
      prompt: 'Test',
      aspectRatio: '9:16',
    });

    expect(result.imageUrl).toBe('https://cdn.example.com/image.png');
    expect(tool1.generate).toHaveBeenCalledOnce();
    expect(tool2.generate).toHaveBeenCalledOnce();
  });

  it('throws combined error when all tools fail', async () => {
    const tool1 = createMockTool({
      id: 'tool-a',
      name: 'Tool A',
      generate: vi.fn().mockResolvedValue({
        jobId: 'j1',
        toolId: 'tool-a',
        status: 'failed',
        error: 'credits exhausted',
      }),
    });
    const tool2 = createMockTool({
      id: 'tool-b',
      name: 'Tool B',
      generate: vi.fn().mockRejectedValue(new Error('network error')),
    });

    const generator = createImageGenerator([tool1, tool2]);

    await expect(
      generator.generate({
        prompt: 'Test',
        aspectRatio: '9:16',
      })
    ).rejects.toThrow(
      /All image generation tools failed.*tool-a.*credits exhausted.*tool-b.*network error/
    );
  });

  it('exposes comma-separated toolId for multiple tools', () => {
    const tool1 = createMockTool({ id: 'nanobanana' });
    const tool2 = createMockTool({ id: 'flux-kie' });

    const generator = createImageGenerator([tool1, tool2]);
    expect(generator.toolId).toBe('nanobanana,flux-kie');
  });

  it('throws when empty array is passed', () => {
    expect(() => createImageGenerator([])).toThrow('at least one tool must be provided');
  });

  it('falls back when first tool throws during generate()', async () => {
    const tool1 = createMockTool({
      id: 'tool-a',
      name: 'Tool A',
      generate: vi.fn().mockRejectedValue(new Error('API timeout')),
    });
    const tool2 = createMockTool({ id: 'tool-b', name: 'Tool B' });

    const generator = createImageGenerator([tool1, tool2]);

    const result = await generator.generate({
      prompt: 'Test',
      aspectRatio: '9:16',
    });

    expect(result.imageUrl).toBe('https://cdn.example.com/image.png');
  });

  it('falls back when first tool fails during polling', async () => {
    const tool1 = createMockTool({
      id: 'tool-a',
      name: 'Tool A',
      generate: vi.fn().mockResolvedValue({
        jobId: 'j1',
        toolId: 'tool-a',
        status: 'processing',
      }),
      poll: vi.fn().mockResolvedValue({
        jobId: 'j1',
        toolId: 'tool-a',
        status: 'failed',
        error: 'moderation rejected',
      }),
    });
    const tool2 = createMockTool({ id: 'tool-b', name: 'Tool B' });

    const generator = createImageGenerator([tool1, tool2], { pollIntervalMs: 10 });

    const result = await generator.generate({
      prompt: 'Test',
      aspectRatio: '9:16',
    });

    expect(result.imageUrl).toBe('https://cdn.example.com/image.png');
    expect(tool1.poll).toHaveBeenCalled();
    expect(tool2.generate).toHaveBeenCalledOnce();
  });
});
