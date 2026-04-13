import type {
  Publisher,
  PublishRequest,
  PublishResult,
  PlatformResult,
  PlatformIntegration,
  Platform,
} from './types';
import { adaptCaption } from './platform-adapters';

/**
 * Publishes reels via Postiz API (self-hosted social media scheduler).
 *
 * Postiz is accessed via its REST API. In n8n/MCP contexts,
 * the MCP tools (integrationSchedulePostTool) handle it directly.
 * This publisher is for programmatic API access from our backend.
 */
export class PostizPublisher implements Publisher {
  private baseUrl: string;
  private apiKey: string;

  constructor(options?: { baseUrl?: string; apiKey?: string }) {
    this.baseUrl = options?.baseUrl ?? process.env.POSTIZ_API_URL ?? 'http://localhost:4200';
    this.apiKey = options?.apiKey ?? process.env.POSTIZ_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('Postiz API key is required');
    }
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const results: PlatformResult[] = [];

    // Get available integrations
    const integrations = await this.listIntegrations();

    for (const platform of request.platforms) {
      const integration = integrations.find((i) => i.platform === platform && i.connected);

      if (!integration) {
        results.push({
          platform,
          status: 'failed',
          error: `No connected ${platform} integration found in Postiz`,
        });
        continue;
      }

      try {
        const caption =
          request.platformCaptions?.[platform] ??
          adaptCaption(request.caption, platform, request.hashtags);

        const scheduleDate = request.scheduleDate ?? new Date().toISOString();

        const response = await fetch(`${this.baseUrl}/api/posts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            integrationId: integration.id,
            content: caption,
            media: [{ url: request.videoUrl, type: 'video' }],
            scheduledDate: scheduleDate,
            type: request.scheduleDate ? 'schedule' : 'now',
          }),
          signal: AbortSignal.timeout(30_000),
          redirect: 'error',
        });

        if (!response.ok) {
          const error = await response.text();
          results.push({ platform, status: 'failed', error });
          continue;
        }

        let data: { id?: string };
        try {
          data = await response.json();
        } catch {
          throw new Error('Failed to parse response from Postiz');
        }
        results.push({
          platform,
          status: request.scheduleDate ? 'scheduled' : 'published',
          postId: data.id,
          scheduledAt: scheduleDate,
        });
      } catch (err) {
        results.push({
          platform,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      publishId: `pub_${Date.now()}`,
      platforms: results,
    };
  }

  async getStatus(publishId: string): Promise<PublishResult> {
    // Postiz tracks status per-post, not per-batch
    // For now, return the stored status from our DB (handled by the API layer)
    return { publishId, platforms: [] };
  }

  async listIntegrations(): Promise<PlatformIntegration[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/integrations`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });

      if (!response.ok) return [];

      let data: Array<{
        id: string;
        providerIdentifier: string;
        name: string;
        disabled: boolean;
      }>;
      try {
        data = await response.json();
      } catch {
        throw new Error('Failed to parse response from Postiz');
      }

      return data.map((i) => ({
        id: i.id,
        platform: fromPostizPlatform(i.providerIdentifier),
        name: i.name,
        connected: !i.disabled,
      }));
    } catch {
      return [];
    }
  }
}

function fromPostizPlatform(provider: string): Platform {
  switch (provider) {
    case 'tiktok':
      return 'tiktok';
    case 'instagram':
      return 'instagram';
    case 'youtube':
      return 'youtube-shorts';
    case 'facebook':
      return 'facebook';
    case 'linkedin':
      return 'linkedin';
    case 'x':
      return 'x';
    default:
      return provider as Platform;
  }
}
