import { randomUUID } from 'node:crypto';
import type { ProductionTool } from '../registry/tool-interface';
import type { ToolCapability, AssetGenerationRequest, AssetGenerationJob } from '../types';
import { isPublicUrl } from '../planner/production-planner';

/**
 * Passthrough tool for user-provided recordings.
 * Always available - just returns the URL as-is.
 */
export class UserUploadTool implements ProductionTool {
  readonly id = 'user-upload';
  readonly name = 'User Upload';
  readonly capabilities: ToolCapability[] = [
    {
      assetType: 'user-recording',
      supportsPrompt: false,
      supportsScript: false,
      estimatedLatencyMs: 0,
      isAsync: false,
      costTier: 'free',
    },
  ];

  async healthCheck(): Promise<{ available: boolean }> {
    return { available: true };
  }

  async generate(request: AssetGenerationRequest): Promise<AssetGenerationJob> {
    if (!request.prompt) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'No URL provided' };
    }

    if (!isPublicUrl(request.prompt)) {
      return { jobId: randomUUID(), toolId: this.id, status: 'failed', error: 'URL must be a public HTTP(S) URL' };
    }

    return {
      jobId: randomUUID(),
      toolId: this.id,
      status: 'completed',
      url: request.prompt,
    };
  }
}
