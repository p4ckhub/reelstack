import { PostizPublisher } from './postiz-publisher';
import type { Publisher } from './types';

export function createPublisher(options?: {
  baseUrl?: string;
  apiKey?: string;
}): Publisher {
  return new PostizPublisher(options);
}

export { PostizPublisher } from './postiz-publisher';
export { adaptCaption, toPostizPlatform } from './platform-adapters';
export type { Publisher, PublishRequest, PublishResult, PlatformResult, PlatformIntegration, Platform } from './types';
export { PLATFORM_LIMITS } from './types';
