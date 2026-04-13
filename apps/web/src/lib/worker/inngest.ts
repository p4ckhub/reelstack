import { Inngest } from 'inngest';
import { processRenderJob } from './render-worker';

export const inngest = new Inngest({ id: 'reelstack' });

export const renderJobHandler = inngest.createFunction(
  { id: 'render-video', retries: 1 },
  { event: 'render/job.queued' },
  async ({ event }) => {
    const { jobId } = event.data;
    await processRenderJob(jobId);
    return { jobId, status: 'completed' };
  }
);
