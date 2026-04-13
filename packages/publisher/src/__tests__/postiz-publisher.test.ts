import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PostizPublisher } from '../postiz-publisher';
import type { PublishRequest } from '../types';

describe('PostizPublisher', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('throws if apiKey is empty', () => {
      delete process.env.POSTIZ_API_KEY;
      expect(() => new PostizPublisher({ apiKey: '' })).toThrow('Postiz API key is required');
    });

    it('throws if apiKey is not provided and env is missing', () => {
      delete process.env.POSTIZ_API_KEY;
      delete process.env.POSTIZ_API_URL;
      expect(() => new PostizPublisher()).toThrow('Postiz API key is required');
    });

    it('accepts apiKey via options', () => {
      const publisher = new PostizPublisher({ apiKey: 'test-key' });
      expect(publisher).toBeInstanceOf(PostizPublisher);
    });
  });

  describe('publish', () => {
    let publisher: PostizPublisher;

    beforeEach(() => {
      publisher = new PostizPublisher({ baseUrl: 'https://postiz.test', apiKey: 'test-key' });
    });

    const makeRequest = (overrides?: Partial<PublishRequest>): PublishRequest => ({
      reelId: 'reel-1',
      videoUrl: 'https://example.com/video.mp4',
      platforms: ['tiktok'],
      caption: 'Test caption',
      ...overrides,
    });

    it('returns failed status when no integration found', async () => {
      // Mock listIntegrations returning empty
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const result = await publisher.publish(makeRequest());

      expect(result.platforms).toHaveLength(1);
      expect(result.platforms[0]!.status).toBe('failed');
      expect(result.platforms[0]!.error).toContain('No connected tiktok integration');
    });

    it('publishes successfully when integration exists', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/integrations')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { id: 'int-1', providerIdentifier: 'tiktok', name: 'TikTok', disabled: false },
              ]),
          });
        }
        // POST /api/posts
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'post-123' }),
        });
      });

      const result = await publisher.publish(makeRequest());

      expect(result.platforms).toHaveLength(1);
      expect(result.platforms[0]!.status).toBe('published');
      expect(result.platforms[0]!.postId).toBe('post-123');
    });

    it('returns "scheduled" status when scheduleDate is provided', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/integrations')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { id: 'int-1', providerIdentifier: 'tiktok', name: 'TikTok', disabled: false },
              ]),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'post-456' }),
        });
      });

      const result = await publisher.publish(makeRequest({ scheduleDate: '2026-04-01T10:00:00Z' }));

      expect(result.platforms[0]!.status).toBe('scheduled');
      expect(result.platforms[0]!.scheduledAt).toBe('2026-04-01T10:00:00Z');
    });

    it('returns failed status on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/integrations')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { id: 'int-1', providerIdentifier: 'tiktok', name: 'TikTok', disabled: false },
              ]),
          });
        }
        return Promise.resolve({
          ok: false,
          text: () => Promise.resolve('Internal Server Error'),
        });
      });

      const result = await publisher.publish(makeRequest());

      expect(result.platforms[0]!.status).toBe('failed');
      expect(result.platforms[0]!.error).toBe('Internal Server Error');
    });

    it('handles JSON parse error on post response', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/integrations')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { id: 'int-1', providerIdentifier: 'tiktok', name: 'TikTok', disabled: false },
              ]),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.reject(new SyntaxError('Unexpected token')),
        });
      });

      const result = await publisher.publish(makeRequest());

      expect(result.platforms[0]!.status).toBe('failed');
      expect(result.platforms[0]!.error).toBe('Failed to parse response from Postiz');
    });
  });

  describe('listIntegrations', () => {
    let publisher: PostizPublisher;

    beforeEach(() => {
      publisher = new PostizPublisher({ baseUrl: 'https://postiz.test', apiKey: 'test-key' });
    });

    it('returns mapped integrations on success', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: '1', providerIdentifier: 'tiktok', name: 'My TikTok', disabled: false },
            { id: '2', providerIdentifier: 'youtube', name: 'My YouTube', disabled: true },
          ]),
      });

      const integrations = await publisher.listIntegrations();

      expect(integrations).toHaveLength(2);
      expect(integrations[0]).toEqual({
        id: '1',
        platform: 'tiktok',
        name: 'My TikTok',
        connected: true,
      });
      expect(integrations[1]).toEqual({
        id: '2',
        platform: 'youtube-shorts',
        name: 'My YouTube',
        connected: false,
      });
    });

    it('returns empty array on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      const integrations = await publisher.listIntegrations();
      expect(integrations).toEqual([]);
    });

    it('returns empty array on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const integrations = await publisher.listIntegrations();
      expect(integrations).toEqual([]);
    });

    it('returns empty array on JSON parse error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError('Bad JSON')),
      });

      // The inner catch in listIntegrations throws, but the outer catch returns []
      const integrations = await publisher.listIntegrations();
      expect(integrations).toEqual([]);
    });
  });
});
