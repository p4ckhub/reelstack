import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetReelJobInternal = vi.fn();
const mockUpdateReelJobStatus = vi.fn();

vi.mock('@reelstack/database', () => ({
  getReelJobInternal: (...args: unknown[]) => mockGetReelJobInternal(...args),
  updateReelJobStatus: (...args: unknown[]) => mockUpdateReelJobStatus(...args),
}));

const mockPublish = vi.fn();
vi.mock('@reelstack/publisher', () => ({
  createPublisher: () => ({ publish: mockPublish }),
}));

const { processReelPublishJob } = await import('../reel-publish-worker');

const publishConfig = {
  platforms: ['tiktok' as const, 'instagram' as const],
  caption: 'Check this out!',
  hashtags: ['#reel'],
  scheduleDate: '2026-03-05T10:00:00Z',
};

describe('processReelPublishJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateReelJobStatus.mockResolvedValue({});
  });

  it('throws when job not found', async () => {
    mockGetReelJobInternal.mockResolvedValue(null);
    await expect(processReelPublishJob('nonexistent', publishConfig)).rejects.toThrow('not found');
  });

  it('throws when job has no output URL', async () => {
    mockGetReelJobInternal.mockResolvedValue({ id: 'reel-1', outputUrl: null });
    await expect(processReelPublishJob('reel-1', publishConfig)).rejects.toThrow('no output URL');
  });

  it('calls publisher with correct params', async () => {
    mockGetReelJobInternal.mockResolvedValue({ id: 'reel-1', outputUrl: 'https://storage.example.com/reel.mp4' });
    mockPublish.mockResolvedValue({ publishId: 'pub-1', platforms: [{ platform: 'tiktok', status: 'scheduled' }] });

    await processReelPublishJob('reel-1', publishConfig);

    expect(mockPublish).toHaveBeenCalledWith({
      reelId: 'reel-1',
      videoUrl: 'https://storage.example.com/reel.mp4',
      platforms: ['tiktok', 'instagram'],
      caption: 'Check this out!',
      hashtags: ['#reel'],
      scheduleDate: '2026-03-05T10:00:00Z',
    });
  });

  it('updates job status with publish result', async () => {
    mockGetReelJobInternal.mockResolvedValue({ id: 'reel-1', outputUrl: 'https://storage.example.com/reel.mp4' });
    mockPublish.mockResolvedValue({
      publishId: 'pub-1',
      platforms: [{ platform: 'tiktok', status: 'scheduled' }, { platform: 'instagram', status: 'scheduled' }],
    });

    await processReelPublishJob('reel-1', publishConfig);

    expect(mockUpdateReelJobStatus).toHaveBeenCalledWith('reel-1', {
      publishStatus: expect.objectContaining({
        publishId: 'pub-1',
        platforms: expect.arrayContaining(['tiktok', 'instagram']),
        publishedAt: expect.any(String),
      }),
    });
  });

  it('works without optional fields', async () => {
    mockGetReelJobInternal.mockResolvedValue({ id: 'reel-1', outputUrl: 'https://storage.example.com/reel.mp4' });
    mockPublish.mockResolvedValue({ publishId: 'pub-2', platforms: [] });

    await processReelPublishJob('reel-1', {
      platforms: ['tiktok' as const],
      caption: 'Hi',
    });

    expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({
      hashtags: undefined,
      scheduleDate: undefined,
    }));
  });
});
