import { Inngest } from 'inngest';
import type { QueueAdapter, JobStatus, QueueName } from '@reelstack/types';

const EVENT_MAP: Record<QueueName, string> = {
  'render': 'render/job.queued',
  'reel-render': 'reel/render.queued',
  'reel-publish': 'reel/publish.queued',
};

export class InngestQueueAdapter implements QueueAdapter {
  private client: Inngest;

  constructor() {
    this.client = new Inngest({ id: 'reelstack' });
  }

  async enqueue(jobId: string, payload: Record<string, unknown>, queueName?: QueueName): Promise<void> {
    const eventName = EVENT_MAP[queueName ?? 'render'];
    await this.client.send({
      name: eventName,
      data: { jobId, ...payload },
    });
  }

  async getStatus(_jobId: string, _queueName?: QueueName): Promise<JobStatus> {
    // Inngest doesn't provide direct job status lookup.
    // Status is tracked in the database by the worker function.
    // Callers should query the DB instead.
    return 'queued';
  }

  getClient(): Inngest {
    return this.client;
  }
}
