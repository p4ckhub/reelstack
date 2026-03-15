import {
  getReelJobInternal,
  updateReelJobStatus,
} from '@reelstack/database';
import { createPublisher } from '@reelstack/publisher';
import type { Platform } from '@reelstack/publisher';
import type { PublishStatus } from '@reelstack/types';

export async function processReelPublishJob(
  jobId: string,
  publishConfig: {
    platforms: Platform[];
    caption: string;
    hashtags?: string[];
    scheduleDate?: string;
  },
): Promise<void> {
  const job = await getReelJobInternal(jobId);
  if (!job) throw new Error(`Reel job ${jobId} not found`);
  if (!job.outputUrl) throw new Error(`Reel job ${jobId} has no output URL`);

  const publisher = createPublisher();

  const result = await publisher.publish({
    reelId: jobId,
    videoUrl: job.outputUrl,
    platforms: publishConfig.platforms,
    caption: publishConfig.caption,
    hashtags: publishConfig.hashtags,
    scheduleDate: publishConfig.scheduleDate,
  });

  const publishStatus: PublishStatus = {
    publishId: result.publishId,
    platforms: result.platforms.map((p) => p.platform),
    publishedAt: new Date().toISOString(),
  };

  await updateReelJobStatus(jobId, { publishStatus });
}
