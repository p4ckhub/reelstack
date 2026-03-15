import { Queue } from 'bullmq';
import type { QueueAdapter, JobStatus, QueueName } from '@reelstack/types';
import { QueueError } from '@reelstack/types';

export class BullMQQueueAdapter implements QueueAdapter {
  private queues: Map<string, Queue> = new Map();
  private connectionConfig: { host: string; port: number; password?: string };

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const url = new URL(redisUrl);

    this.connectionConfig = {
      host: url.hostname,
      port: parseInt(url.port || '6379', 10) || 6379,
      password: url.password || undefined,
    };
  }

  private getQueue(name: QueueName = 'render'): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connectionConfig });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async enqueue(jobId: string, payload: Record<string, unknown>, queueName?: QueueName): Promise<void> {
    const queue = this.getQueue(queueName);
    try {
      await queue.add(queueName ?? 'render', payload, {
        jobId,
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      });
    } catch (err) {
      throw new QueueError('Failed to enqueue job', {
        queueName: queueName ?? 'render',
        jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async getStatus(jobId: string, queueName?: QueueName): Promise<JobStatus> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) return 'queued';

    const state = await job.getState();
    switch (state) {
      case 'waiting':
      case 'delayed':
        return 'queued';
      case 'active':
        return 'processing';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      default:
        return 'queued';
    }
  }

  async close(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map(q => q.close());
    await Promise.all(closePromises);
    this.queues.clear();
  }
}
