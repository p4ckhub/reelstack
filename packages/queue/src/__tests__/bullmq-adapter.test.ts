import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==========================================
// Mock BullMQ Queue
// ==========================================
const mockAdd = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockGetJob = vi.fn();

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockAdd,
    close: mockClose,
    getJob: mockGetJob,
  })),
}));

import { BullMQQueueAdapter } from '../bullmq-adapter';

describe('BullMQQueueAdapter', () => {
  let adapter: BullMQQueueAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = 'redis://localhost:6379';
    adapter = new BullMQQueueAdapter();
  });

  describe('enqueue', () => {
    it('adds job to the queue with correct payload', async () => {
      const payload = { videoId: '123', format: 'mp4' };
      await adapter.enqueue('job-1', payload);

      expect(mockAdd).toHaveBeenCalledWith('render', payload, {
        jobId: 'job-1',
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      });
    });

    it('uses specified queue name', async () => {
      await adapter.enqueue('job-2', { data: 'test' }, 'reel-publish');

      expect(mockAdd).toHaveBeenCalledWith(
        'reel-publish',
        { data: 'test' },
        expect.objectContaining({ jobId: 'job-2' })
      );
    });

    it('configures retry with 3 attempts and exponential backoff', async () => {
      await adapter.enqueue('job-3', {});

      const opts = mockAdd.mock.calls[0][2];
      expect(opts.attempts).toBe(3);
      expect(opts.backoff).toEqual({ type: 'exponential', delay: 5000 });
    });
  });

  describe('getStatus', () => {
    it('returns "queued" when job is not found', async () => {
      mockGetJob.mockResolvedValue(null);
      const status = await adapter.getStatus('unknown');
      expect(status).toBe('queued');
    });

    it('maps "waiting" state to "queued"', async () => {
      mockGetJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('waiting') });
      expect(await adapter.getStatus('job-1')).toBe('queued');
    });

    it('maps "delayed" state to "queued"', async () => {
      mockGetJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('delayed') });
      expect(await adapter.getStatus('job-1')).toBe('queued');
    });

    it('maps "active" state to "processing"', async () => {
      mockGetJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('active') });
      expect(await adapter.getStatus('job-1')).toBe('processing');
    });

    it('maps "completed" state to "completed"', async () => {
      mockGetJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('completed') });
      expect(await adapter.getStatus('job-1')).toBe('completed');
    });

    it('maps "failed" state to "failed"', async () => {
      mockGetJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('failed') });
      expect(await adapter.getStatus('job-1')).toBe('failed');
    });

    it('maps unknown state to "queued"', async () => {
      mockGetJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('unknown-state') });
      expect(await adapter.getStatus('job-1')).toBe('queued');
    });
  });

  describe('close', () => {
    it('closes all queues', async () => {
      // Create queues by enqueuing to them
      await adapter.enqueue('j1', {}, 'render');
      await adapter.enqueue('j2', {}, 'reel-publish');

      await adapter.close();

      // close() is called on each Queue instance
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
