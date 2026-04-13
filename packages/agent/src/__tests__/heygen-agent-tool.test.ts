import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeyGenAgentTool } from '../tools/heygen-tool';

const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

describe('HeyGenAgentTool', () => {
  const tool = new HeyGenAgentTool();

  beforeEach(() => {
    globalThis.fetch = mockFetch as typeof fetch;
    mockFetch.mockReset();
    process.env.HEYGEN_API_KEY = 'test-key';
    delete process.env.HEYGEN_AVATAR_ID;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.HEYGEN_API_KEY;
  });

  it('has correct id and name', () => {
    expect(tool.id).toBe('heygen-agent');
    expect(tool.name).toBe('HeyGen Video Agent');
  });

  it('supports prompt but not script', () => {
    const cap = tool.capabilities[0];
    expect(cap.supportsPrompt).toBe(true);
    expect(cap.supportsScript).toBe(false);
    expect(cap.assetType).toBe('avatar-video');
  });

  describe('generate', () => {
    it('sends prompt to /v1/video_agent/generate', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'va-123' } }),
      });

      await tool.generate({ purpose: 'test', prompt: 'A developer walks through a server room' });

      expect(mockFetch.mock.calls[0][0]).toBe('https://api.heygen.com/v1/video_agent/generate');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.prompt).toBe('A developer walks through a server room');
      expect(body.config.orientation).toBe('portrait');
    });

    it('sets landscape for 16:9', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'va-456' } }),
      });

      await tool.generate({ purpose: 'test', prompt: 'Test', aspectRatio: '16:9' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.config.orientation).toBe('landscape');
    });

    it('includes avatar_id from env', async () => {
      process.env.HEYGEN_AVATAR_ID = 'my-avatar';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'va-789' } }),
      });

      await tool.generate({ purpose: 'test', prompt: 'Test' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.config.avatar_id).toBe('my-avatar');
    });

    it('includes avatar_id from request over env', async () => {
      process.env.HEYGEN_AVATAR_ID = 'env-avatar';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'va-ovr' } }),
      });

      await tool.generate({ purpose: 'test', prompt: 'Test', avatarId: 'req-avatar' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.config.avatar_id).toBe('req-avatar');
    });

    it('omits avatar_id when not set', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'va-no-av' } }),
      });

      await tool.generate({ purpose: 'test', prompt: 'Test' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.config.avatar_id).toBeUndefined();
    });

    it('enforces minimum duration of 5 seconds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'va-dur' } }),
      });

      await tool.generate({ purpose: 'test', prompt: 'Test', durationSeconds: 2 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.config.duration_sec).toBe(5);
    });

    it('returns processing with video_id as jobId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'va-job' } }),
      });

      const result = await tool.generate({ purpose: 'test', prompt: 'Test' });

      expect(result.status).toBe('processing');
      expect(result.jobId).toBe('va-job');
      expect(result.toolId).toBe('heygen-agent');
    });

    it('returns failed when prompt missing', async () => {
      const result = await tool.generate({ purpose: 'test' });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Prompt is required');
    });

    it('returns failed when API key missing', async () => {
      delete process.env.HEYGEN_API_KEY;
      const result = await tool.generate({ purpose: 'test', prompt: 'Test' });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('HEYGEN_API_KEY');
    });

    it('returns failed with error body on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => '{"error":"rate limit exceeded"}',
      });

      const result = await tool.generate({ purpose: 'test', prompt: 'Test' });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('429');
    });
  });

  describe('poll', () => {
    it('uses /v1/video_agent/video_status.get endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: 'processing' } }),
      });

      await tool.poll('va-poll');
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.heygen.com/v1/video_agent/video_status.get?video_id=va-poll'
      );
    });

    it('returns completed with url and duration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            status: 'completed',
            video_url: 'https://heygen.ai/agent-video.mp4',
            duration: 28,
          },
        }),
      });

      const result = await tool.poll('va-done');
      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://heygen.ai/agent-video.mp4');
      expect(result.durationSeconds).toBe(28);
    });

    it('returns processing for pending status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: 'pending' } }),
      });

      const result = await tool.poll('va-pend');
      expect(result.status).toBe('processing');
    });

    it('returns failed with error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: 'failed', error: 'Generation timeout' } }),
      });

      const result = await tool.poll('va-fail');
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Generation timeout');
    });

    it('rejects invalid jobId format', async () => {
      const result = await tool.poll('../../etc/passwd');
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Invalid jobId');
    });

    it('returns failed when API key missing', async () => {
      delete process.env.HEYGEN_API_KEY;
      const result = await tool.poll('va-nokey');
      expect(result.status).toBe('failed');
      expect(result.error).toContain('HEYGEN_API_KEY');
    });
  });

  describe('healthCheck', () => {
    it('returns available when quota > 0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { remaining_quota: 600 } }),
      });

      const result = await tool.healthCheck();
      expect(result.available).toBe(true);
    });

    it('returns unavailable when no API key', async () => {
      delete process.env.HEYGEN_API_KEY;
      const result = await tool.healthCheck();
      expect(result.available).toBe(false);
    });
  });
});
