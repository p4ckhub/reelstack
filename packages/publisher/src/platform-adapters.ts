import type { Platform } from './types';
import { PLATFORM_LIMITS } from './types';

/**
 * Adapts caption text for a specific platform's constraints.
 */
export function adaptCaption(
  caption: string,
  platform: Platform,
  hashtags?: readonly string[],
): string {
  const limits = PLATFORM_LIMITS[platform];
  const hashtagStr = hashtags?.length
    ? '\n\n' + hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).slice(0, limits.maxHashtags).join(' ')
    : '';

  const maxLen = limits.maxCaptionLength - hashtagStr.length;
  const trimmedCaption = caption.length > maxLen
    ? caption.slice(0, maxLen - 3) + '...'
    : caption;

  return trimmedCaption + hashtagStr;
}

/**
 * Maps our platform names to Postiz integration identifiers.
 */
export function toPostizPlatform(platform: Platform): string {
  switch (platform) {
    case 'tiktok': return 'tiktok';
    case 'instagram': return 'instagram';
    case 'youtube-shorts': return 'youtube';
    case 'facebook': return 'facebook';
    case 'linkedin': return 'linkedin';
    case 'x': return 'x';
  }
}
