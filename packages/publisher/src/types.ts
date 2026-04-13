export type Platform = 'tiktok' | 'instagram' | 'youtube-shorts' | 'facebook' | 'linkedin' | 'x';

export interface PublishRequest {
  readonly reelId: string;
  readonly videoUrl: string;
  readonly platforms: readonly Platform[];
  readonly caption: string;
  readonly hashtags?: readonly string[];
  readonly scheduleDate?: string; // ISO UTC, if absent = "now"
  readonly platformCaptions?: Partial<Record<Platform, string>>;
}

export interface PublishResult {
  readonly publishId: string;
  readonly platforms: readonly PlatformResult[];
}

export interface PlatformResult {
  readonly platform: Platform;
  readonly status: 'scheduled' | 'published' | 'failed';
  readonly postId?: string;
  readonly error?: string;
  readonly scheduledAt?: string;
}

export interface Publisher {
  publish(request: PublishRequest): Promise<PublishResult>;
  getStatus(publishId: string): Promise<PublishResult>;
  listIntegrations(): Promise<PlatformIntegration[]>;
}

export interface PlatformIntegration {
  readonly id: string;
  readonly platform: Platform;
  readonly name: string;
  readonly connected: boolean;
}

export const PLATFORM_LIMITS: Record<Platform, { maxCaptionLength: number; maxHashtags: number }> =
  {
    tiktok: { maxCaptionLength: 2200, maxHashtags: 30 },
    instagram: { maxCaptionLength: 2200, maxHashtags: 30 },
    'youtube-shorts': { maxCaptionLength: 5000, maxHashtags: 15 },
    facebook: { maxCaptionLength: 63206, maxHashtags: 30 },
    linkedin: { maxCaptionLength: 3000, maxHashtags: 10 },
    x: { maxCaptionLength: 280, maxHashtags: 5 },
  };
