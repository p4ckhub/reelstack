import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeyGenTool, HeyGenV3Tool } from '../tools/heygen-tool';

// Mock fetch with proper restore
const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

describe('HeyGenTool', () => {
  const tool = new HeyGenTool();

  beforeEach(() => {
    globalThis.fetch = mockFetch as typeof fetch;
    mockFetch.mockReset();
    process.env.HEYGEN_API_KEY = 'test-key';
    delete process.env.HEYGEN_AVATAR_ID;
    delete process.env.HEYGEN_VOICE_ID;
    delete process.env.HEYGEN_TEST_MODE;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.HEYGEN_API_KEY;
  });

  describe('generate', () => {
    it('sends correct default character and voice', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'vid-123' } }),
      });

      await tool.generate({ purpose: 'test', script: 'Hello world' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const char = body.video_inputs[0].character;
      const voice = body.video_inputs[0].voice;

      expect(char.type).toBe('avatar');
      expect(char.avatar_id).toBe('Abigail_expressive_2024112501');
      expect(char.avatar_style).toBe('normal');
      expect(voice.type).toBe('text');
      expect(voice.voice_id).toBe('0cbf3f0556f74c84abdf598a297ae810');
      expect(voice.input_text).toBe('Hello world');
    });

    it('uses env var defaults for avatar_id and voice_id', async () => {
      process.env.HEYGEN_AVATAR_ID = 'my-avatar';
      process.env.HEYGEN_VOICE_ID = 'my-voice';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'vid-456' } }),
      });

      await tool.generate({ purpose: 'test', script: 'Test' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.video_inputs[0].character.avatar_id).toBe('my-avatar');
      expect(body.video_inputs[0].voice.voice_id).toBe('my-voice');
    });

    it('spreads heygen_character directly onto defaults', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'vid-iv' } }),
      });

      await tool.generate({
        purpose: 'test',
        script: 'Avatar IV test',
        heygen_character: {
          use_avatar_iv_model: true,
          prompt: 'gestures enthusiastically',
          keep_original_prompt: false,
        },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const char = body.video_inputs[0].character;

      expect(char.type).toBe('avatar'); // default preserved
      expect(char.use_avatar_iv_model).toBe(true);
      expect(char.prompt).toBe('gestures enthusiastically');
      expect(char.keep_original_prompt).toBe(false);
    });

    it('heygen_character can override type to talking_photo', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'vid-tp' } }),
      });

      await tool.generate({
        purpose: 'test',
        script: 'Talking photo',
        heygen_character: {
          type: 'talking_photo',
          talking_photo_id: 'photo-abc',
        },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const char = body.video_inputs[0].character;

      expect(char.type).toBe('talking_photo');
      expect(char.talking_photo_id).toBe('photo-abc');
    });

    it('spreads heygen_voice directly onto defaults', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'vid-v' } }),
      });

      await tool.generate({
        purpose: 'test',
        script: 'Voice test',
        heygen_voice: { emotion: 'Excited', speed: 1.2, pitch: 5 },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const voice = body.video_inputs[0].voice;

      expect(voice.type).toBe('text'); // default preserved
      expect(voice.input_text).toBe('Voice test');
      expect(voice.emotion).toBe('Excited');
      expect(voice.speed).toBe(1.2);
      expect(voice.pitch).toBe(5);
    });

    it('sets correct dimension for 9:16', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'vid-d' } }),
      });

      await tool.generate({ purpose: 'test', script: 'T', aspectRatio: '9:16' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.dimension).toEqual({ width: 1080, height: 1920 });
    });

    it('sets correct dimension for 16:9', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'vid-d2' } }),
      });

      await tool.generate({ purpose: 'test', script: 'T', aspectRatio: '16:9' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.dimension).toEqual({ width: 1920, height: 1080 });
    });

    it('sets test mode from env', async () => {
      process.env.HEYGEN_TEST_MODE = 'true';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'vid-t' } }),
      });

      await tool.generate({ purpose: 'test', script: 'T' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.test).toBe(true);
    });

    it('returns processing status with video_id as jobId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { video_id: 'heygen-job-789' } }),
      });

      const result = await tool.generate({ purpose: 'test', script: 'Hello' });

      expect(result.status).toBe('processing');
      expect(result.jobId).toBe('heygen-job-789');
      expect(result.toolId).toBe('heygen');
    });

    it('returns failed when script missing', async () => {
      const result = await tool.generate({ purpose: 'test' });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Script is required');
    });

    it('returns failed when API key missing', async () => {
      delete process.env.HEYGEN_API_KEY;
      const result = await tool.generate({ purpose: 'test', script: 'Hello' });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('HEYGEN_API_KEY');
    });

    it('returns failed with error body on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"error":{"message":"invalid avatar_id"}}',
      });

      const result = await tool.generate({ purpose: 'test', script: 'Hello' });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('400');
      expect(result.error).toContain('invalid avatar_id');
    });
  });

  describe('poll', () => {
    it('returns completed with url and duration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { status: 'completed', video_url: 'https://heygen.ai/video.mp4', duration: 5.5 },
        }),
      });

      const result = await tool.poll('job-123');
      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://heygen.ai/video.mp4');
      expect(result.durationSeconds).toBe(5.5);
    });

    it('uses v2 endpoint for polling', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: 'processing' } }),
      });

      await tool.poll('job-456');
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.heygen.com/v2/videos/job-456');
    });

    it('returns processing for pending status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: 'pending' } }),
      });

      const result = await tool.poll('job-789');
      expect(result.status).toBe('processing');
    });

    it('returns failed with error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: 'failed', error: 'Rendering timeout' } }),
      });

      const result = await tool.poll('job-fail');
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Rendering timeout');
    });

    it('rejects invalid jobId format', async () => {
      const result = await tool.poll('../../etc/passwd');
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Invalid jobId');
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

    it('uses v2 endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { remaining_quota: 100 } }),
      });

      await tool.healthCheck();
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.heygen.com/v2/user/remaining_quota');
    });

    it('returns unavailable when quota exhausted', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { remaining_quota: 0 } }),
      });

      const result = await tool.healthCheck();
      expect(result.available).toBe(false);
      expect(result.reason).toContain('quota');
    });

    it('returns unavailable when no API key', async () => {
      delete process.env.HEYGEN_API_KEY;
      const result = await tool.healthCheck();
      expect(result.available).toBe(false);
    });
  });
});

// ── HeyGen V3 (Avatar V) ─────────────────────────────────────

describe('HeyGenV3Tool', () => {
  const v3tool = new HeyGenV3Tool();

  beforeEach(() => {
    globalThis.fetch = mockFetch as typeof fetch;
    mockFetch.mockReset();
    process.env.HEYGEN_API_KEY = 'test-key';
    process.env.HEYGEN_AVATAR_V_ID = 'avatar-v-look-123';
    delete process.env.HEYGEN_VOICE_ID;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.HEYGEN_API_KEY;
    delete process.env.HEYGEN_AVATAR_V_ID;
  });

  describe('generate', () => {
    it('uses /v3/videos endpoint with flat body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'v3-vid-1' } }),
      });

      await v3tool.generate({ purpose: 'test', script: 'Hello from Avatar V' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.heygen.com/v3/videos');

      const body = JSON.parse(options.body);
      expect(body.type).toBe('avatar');
      expect(body.avatar_id).toBe('avatar-v-look-123');
      expect(body.script).toBe('Hello from Avatar V');
      expect(body.aspect_ratio).toBe('9:16');
      expect(body.resolution).toBe('1080p');
      // Flat body - no video_inputs wrapper
      expect(body.video_inputs).toBeUndefined();
    });

    it('extracts id (not video_id) from v3 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'v3-vid-abc' } }),
      });

      const result = await v3tool.generate({ purpose: 'test', script: 'Test' });
      expect(result.jobId).toBe('v3-vid-abc');
      expect(result.toolId).toBe('heygen-v3');
    });

    it('returns failed when no avatar ID available', async () => {
      delete process.env.HEYGEN_AVATAR_V_ID;
      delete process.env.HEYGEN_AVATAR_ID;

      const result = await v3tool.generate({ purpose: 'test', script: 'Test' });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('avatar_id');
    });

    it('falls back to HEYGEN_AVATAR_ID when HEYGEN_AVATAR_V_ID not set', async () => {
      delete process.env.HEYGEN_AVATAR_V_ID;
      process.env.HEYGEN_AVATAR_ID = 'fallback-avatar';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'v3-vid-fb' } }),
      });

      await v3tool.generate({ purpose: 'test', script: 'Test' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.avatar_id).toBe('fallback-avatar');
    });

    it('passes motion_prompt from heygen_character', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 'v3-vid-mp' } }),
      });

      await v3tool.generate({
        purpose: 'test',
        script: 'Test',
        heygen_character: { motion_prompt: 'speaks with hand gestures' },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.motion_prompt).toBe('speaks with hand gestures');
    });

    it('returns failed when script missing', async () => {
      const result = await v3tool.generate({ purpose: 'test' });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Script is required');
    });
  });

  describe('poll', () => {
    it('uses /v3/videos/{id} endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: 'processing' } }),
      });

      await v3tool.poll('v3-job-1');
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.heygen.com/v3/videos/v3-job-1');
    });

    it('returns completed with video_url', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { status: 'completed', video_url: 'https://heygen.ai/v3-out.mp4', duration: 8 },
        }),
      });

      const result = await v3tool.poll('v3-job-2');
      expect(result.status).toBe('completed');
      expect(result.url).toBe('https://heygen.ai/v3-out.mp4');
      expect(result.durationSeconds).toBe(8);
    });

    it('returns failed with failure_message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { status: 'failed', failure_message: 'Avatar V rendering error' },
        }),
      });

      const result = await v3tool.poll('v3-job-fail');
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Avatar V rendering error');
    });
  });
});
