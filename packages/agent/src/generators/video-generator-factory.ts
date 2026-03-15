/**
 * Factory for creating VideoGenerator instances from available production tools.
 * Selects available video generation providers based on env vars and preferences,
 * then creates a VideoGenerator with a fallback chain of all available tools
 * (ordered by preference).
 */
import { createLogger } from '@reelstack/logger';
import { ToolRegistry } from '../registry/tool-registry';
import { discoverTools } from '../registry/discovery';
import { createVideoGenerator } from './video-generator';
import type { VideoGenerator, VideoGeneratorOptions } from './video-generator';

const log = createLogger('video-generator-factory');

/** Provider preference order (best quality/features first) */
const DEFAULT_PREFERENCE = ['veo3', 'veo31-gemini', 'kling', 'seedance'] as const;

export interface VideoGeneratorFactoryOptions extends VideoGeneratorOptions {
  /** Preferred provider order (default: veo3 > kling > seedance) */
  preferredProviders?: readonly string[];
}

/**
 * Create the best available VideoGenerator with a fallback chain.
 * Discovers tools, runs health checks, and returns a generator backed
 * by all available providers (ordered by preference). If the primary
 * provider fails at runtime, the generator automatically falls through
 * to the next available tool.
 *
 * Throws if no video generation tool is available.
 */
export async function createBestVideoGenerator(
  options?: VideoGeneratorFactoryOptions
): Promise<VideoGenerator> {
  const registry = new ToolRegistry();
  for (const tool of discoverTools()) {
    registry.register(tool);
  }
  await registry.discover();

  const preference = options?.preferredProviders ?? DEFAULT_PREFERENCE;
  const manifest = registry.getToolManifest();

  // Collect all available tools in preference order
  const availableTools = [];
  for (const providerId of preference) {
    const entry = manifest.tools.find((t) => t.id === providerId && t.available);
    if (entry) {
      const tool = registry.get(providerId);
      if (tool) {
        availableTools.push(tool);
      }
    }
  }

  if (availableTools.length === 0) {
    const available = manifest.tools.filter((t) => t.available).map((t) => t.id);
    throw new Error(
      `No video generation tool available. Checked: ${[...preference].join(', ')}. Available tools: ${available.join(', ') || 'none'}`
    );
  }

  log.info(
    { tools: availableTools.map((t) => t.id) },
    `Creating video generator with ${availableTools.length} tool(s) in fallback chain`
  );

  return createVideoGenerator(availableTools, options);
}
