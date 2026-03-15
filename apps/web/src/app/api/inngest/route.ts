import { serve } from 'inngest/next';
import { inngest, renderJobHandler } from '@/lib/worker/inngest';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [renderJobHandler],
});
