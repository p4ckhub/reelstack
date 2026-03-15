import type { QueueAdapter, DeploymentMode } from '@reelstack/types';

export function detectDeploymentMode(): DeploymentMode {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.INNGEST_EVENT_KEY) {
    return 'cloud';
  }
  return 'vps';
}

export async function createQueue(): Promise<QueueAdapter> {
  const mode = detectDeploymentMode();

  if (mode === 'cloud') {
    const { InngestQueueAdapter } = await import('./inngest-adapter');
    return new InngestQueueAdapter();
  }

  const { BullMQQueueAdapter } = await import('./bullmq-adapter');
  return new BullMQQueueAdapter();
}

export { InngestQueueAdapter } from './inngest-adapter';
export { BullMQQueueAdapter } from './bullmq-adapter';
export type { QueueAdapter, DeploymentMode };
