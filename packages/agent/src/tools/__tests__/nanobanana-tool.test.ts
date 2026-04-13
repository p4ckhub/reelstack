import { describe, it, expect, vi, beforeEach, afterEach, afterAll, type Mock } from 'vitest';
import type { AssetGenerationRequest } from '../../types';

import fs from 'fs';
import * as contextModule from '../../context';

const mockWriteFileSync = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
afterAll(() => {
  mockWriteFileSync.mockRestore();
});
const mockAddCost = vi.spyOn(contextModule, 'addCost');

import { NanoBananaTool } from '../nanobanana-tool';

const FAKE_PNG_BASE64 = Buffer.from('fake-png-data').toString('base64');

function makeGeminiResponse(
  mimeType = 'image/png',
  data = FAKE_PNG_BASE64
): Record<string, unknown> {
  return {
    candidates: [
      {
        content: {
          parts: [{ inlineData: { mimeType, data } }],
        },
      },
    ],
  };
}

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'thumbnail image',
    prompt: 'a glowing neon cat in space',
    aspectRatio: '9:16',
    ...overrides,
  };
}

describe('NanoBananaTool', () => {
  let tool: NanoBananaTool;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let mockFetch: Mock;

  beforeEach(() => {
    tool = new NanoBananaTool();
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as typeof fetch;
    mockAddCost.mockReset();
    mockWriteFileSync.mockReset();
    delete process.env.NANOBANANA_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.NANOBANANA_MODEL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns unavailable when neither API key is set', async () => {
      const result = await tool.healthCheck();
      expect(result).toEqual({
        available: false,
        reason: 'NANOBANANA_API_KEY or GEMINI_API_KEY not set',
      });
    });

    it('returns available with NANOBANANA_API_KEY', async () => {
      process.env.NANOBANANA_API_KEY = 'nb-test-key';
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: true });
    });

    it('returns available with GEMINI_API_KEY as fallback', async () => {
      process.env.GEMINI_API_KEY = 'gemini-test-key';
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate ─────────────────────────────────────────────────

  describe('generate', () => {
    beforeEach(() => {
      process.env.NANOBANANA_API_KEY = 'nb-test-key';
    });

    it('sends correct request with x-goog-api-key header (NOT query param)', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse()), { status: 200 })
      );

      await tool.generate(makeRequest());

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent'
      );
      expect(url).not.toContain('key=');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual(
        expect.objectContaining({
          'Content-Type': 'application/json',
          'x-goog-api-key': 'nb-test-key',
        })
      );

      const body = JSON.parse(options.body as string);
      expect(body.contents[0].parts[0].text).toBe('a glowing neon cat in space');
      expect(body.generationConfig.responseModalities).toEqual(['IMAGE']);
      expect(body.generationConfig.imageConfig.aspectRatio).toBe('9:16');
    });

    it('returns completed with local file path on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse()), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('completed');
      expect(result.url).toMatch(/nanobanana-[a-f0-9-]+\.png$/);
      expect(result.toolId).toBe('nanobanana');
    });

    it('calls addCost on success', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse()), { status: 200 })
      );

      await tool.generate(makeRequest());

      expect(mockAddCost).toHaveBeenCalledOnce();
      const costCall = mockAddCost.mock.calls[0]?.[0];
      expect(costCall?.step).toBe('asset:nanobanana');
      expect(costCall?.provider).toBe('nanobanana');
      expect(costCall?.model).toBe('gemini-2.0-flash-exp');
      expect(costCall?.type).toBe('image');
      expect(typeof costCall?.costUSD).toBe('number');
      expect(costCall?.costUSD).toBeGreaterThanOrEqual(0);
      expect(costCall?.inputUnits).toBe(1);
    });

    it('writes base64-decoded file to temp directory', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse()), { status: 200 })
      );

      await tool.generate(makeRequest());

      expect(mockWriteFileSync).toHaveBeenCalledOnce();
      const [, buffer] = mockWriteFileSync.mock.calls[0]!;
      expect(buffer.toString()).toBe('fake-png-data');
    });

    it('returns failed when API key not set', async () => {
      delete process.env.NANOBANANA_API_KEY;

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('API key not set');
    });

    it('handles API error response', async () => {
      mockFetch.mockResolvedValue(new Response('{"error": "quota exceeded"}', { status: 429 }));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Gemini API error (429)');
    });

    it('returns failed when no image in response', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'some text' }] } }],
          }),
          { status: 200 }
        )
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No image in response');
    });

    it('rejects invalid MIME type', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse('image/bmp', FAKE_PNG_BASE64)), {
          status: 200,
        })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Invalid image type');
    });

    it('accepts image/jpeg MIME type', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse('image/jpeg', FAKE_PNG_BASE64)), {
          status: 200,
        })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('completed');
      expect(result.url).toMatch(/\.jpg$/);
    });

    it('accepts image/webp MIME type', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse('image/webp', FAKE_PNG_BASE64)), {
          status: 200,
        })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('completed');
      expect(result.url).toMatch(/\.webp$/);
    });

    it('rejects oversized base64 data', async () => {
      // 68MB+ base64 string
      const hugeData = 'A'.repeat(68 * 1024 * 1024 + 1);
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse('image/png', hugeData)), { status: 200 })
      );

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Image data too large');
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValue(new Error('DNS resolution failed'));

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('failed');
      expect(result.error).toContain('DNS resolution failed');
    });

    it('maps 16:9 aspect ratio correctly', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse()), { status: 200 })
      );

      await tool.generate(makeRequest({ aspectRatio: '16:9' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.generationConfig.imageConfig.aspectRatio).toBe('16:9');
    });

    it('maps 1:1 aspect ratio correctly', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse()), { status: 200 })
      );

      await tool.generate(makeRequest({ aspectRatio: '1:1' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.generationConfig.imageConfig.aspectRatio).toBe('1:1');
    });

    it('uses searchQuery as fallback when prompt is undefined', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse()), { status: 200 })
      );

      await tool.generate(makeRequest({ prompt: undefined, searchQuery: 'sunset over ocean' }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.contents[0].parts[0].text).toBe('sunset over ocean');
    });

    it('uses default prompt when neither prompt nor searchQuery provided', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse()), { status: 200 })
      );

      await tool.generate(makeRequest({ prompt: undefined, searchQuery: undefined }));

      const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(body.contents[0].parts[0].text).toBe('abstract colorful background');
    });

    it('respects NANOBANANA_MODEL env override', async () => {
      process.env.NANOBANANA_MODEL = 'custom-model-v2';
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify(makeGeminiResponse()), { status: 200 })
      );

      await tool.generate(makeRequest());

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toContain('/models/custom-model-v2:generateContent');
    });
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('has correct id and name', () => {
      expect(tool.id).toBe('nanobanana');
      expect(tool.name).toBe('NanoBanana (Gemini Image)');
    });

    it('declares ai-image capability with sync (isAsync=false)', () => {
      expect(tool.capabilities).toHaveLength(1);
      const cap = tool.capabilities[0]!;
      expect(cap.assetType).toBe('ai-image');
      expect(cap.isAsync).toBe(false);
      expect(cap.costTier).toBe('cheap');
    });
  });
});
