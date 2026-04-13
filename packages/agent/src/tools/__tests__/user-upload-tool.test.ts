import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { AssetGenerationRequest } from '../../types';
import * as urlValidation from '../../utils/url-validation';
import { UserUploadTool } from '../user-upload-tool';

// Use spyOn instead of vi.mock to avoid contaminating url-validation.test.ts
const mockIsPublicUrl = vi.spyOn(urlValidation, 'isPublicUrl');

function makeRequest(overrides: Partial<AssetGenerationRequest> = {}): AssetGenerationRequest {
  return {
    purpose: 'User provided recording',
    prompt: 'https://cdn.example.com/my-recording.mp4',
    ...overrides,
  };
}

describe('UserUploadTool', () => {
  let tool: UserUploadTool;

  beforeEach(() => {
    tool = new UserUploadTool();
    mockIsPublicUrl.mockReset();
  });

  afterAll(() => {
    mockIsPublicUrl.mockRestore();
  });

  // ── healthCheck ──────────────────────────────────────────────

  describe('healthCheck', () => {
    it('is always available', async () => {
      const result = await tool.healthCheck();
      expect(result).toEqual({ available: true });
    });
  });

  // ── generate ─────────────────────────────────────────────────

  describe('generate', () => {
    it('returns completed immediately with the URL on valid public URL', async () => {
      mockIsPublicUrl.mockReturnValue(true);

      const result = await tool.generate(makeRequest());

      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://cdn.example.com/my-recording.mp4');
      expect(result.toolId).toBe('user-upload');
      expect(result.jobId).toBeDefined();
    });

    it('returns failed when no prompt/URL provided', async () => {
      const result = await tool.generate(makeRequest({ prompt: undefined }));

      expect(result.status).toBe('failed');
      expect(result.error).toBe('No URL provided');
      expect(result.toolId).toBe('user-upload');
    });

    it('returns failed when URL is not public', async () => {
      mockIsPublicUrl.mockReturnValue(false);

      const result = await tool.generate(makeRequest({ prompt: 'file:///etc/passwd' }));

      expect(result.status).toBe('failed');
      expect(result.error).toBe('URL must be a public HTTP(S) URL');
    });

    it('validates URL via isPublicUrl', async () => {
      mockIsPublicUrl.mockReturnValue(true);

      await tool.generate(makeRequest({ prompt: 'https://storage.example.com/video.mp4' }));

      expect(mockIsPublicUrl).toHaveBeenCalledOnce();
      expect(mockIsPublicUrl).toHaveBeenCalledWith('https://storage.example.com/video.mp4');
    });

    it('rejects localhost URLs when isPublicUrl returns false', async () => {
      mockIsPublicUrl.mockReturnValue(false);

      const result = await tool.generate(
        makeRequest({ prompt: 'http://localhost:3000/video.mp4' })
      );

      expect(result.status).toBe('failed');
      expect(result.error).toBe('URL must be a public HTTP(S) URL');
    });

    it('rejects private IP URLs when isPublicUrl returns false', async () => {
      mockIsPublicUrl.mockReturnValue(false);

      const result = await tool.generate(makeRequest({ prompt: 'http://10.0.0.1/video.mp4' }));

      expect(result.status).toBe('failed');
    });

    it('does not call fetch — purely synchronous passthrough', async () => {
      mockIsPublicUrl.mockReturnValue(true);
      const fetchSpy = vi.fn();
      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchSpy as typeof fetch;

      await tool.generate(makeRequest());

      expect(fetchSpy).not.toHaveBeenCalled();
      globalThis.fetch = originalFetch;
    });

    it('returns empty prompt as failed', async () => {
      const result = await tool.generate(makeRequest({ prompt: '' }));

      // Empty string is falsy, so "No URL provided" is returned
      expect(result.status).toBe('failed');
      expect(result.error).toBe('No URL provided');
    });
  });

  // ── static properties ────────────────────────────────────────

  describe('static properties', () => {
    it('has correct id and name', () => {
      expect(tool.id).toBe('user-upload');
      expect(tool.name).toBe('User Upload');
    });

    it('declares user-recording capability as synchronous and free', () => {
      expect(tool.capabilities).toHaveLength(1);
      const cap = tool.capabilities[0]!;
      expect(cap.assetType).toBe('user-recording');
      expect(cap.isAsync).toBe(false);
      expect(cap.costTier).toBe('free');
      expect(cap.estimatedLatencyMs).toBe(0);
      expect(cap.supportsPrompt).toBe(false);
      expect(cap.supportsScript).toBe(false);
    });
  });

  // ── no poll method ───────────────────────────────────────────

  describe('poll', () => {
    it('does not implement poll (synchronous tool)', () => {
      // UserUploadTool has no poll method — it completes immediately in generate
      expect((tool as unknown as Record<string, unknown>).poll).toBeUndefined();
    });
  });
});
