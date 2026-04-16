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

/**
 * Provider preference order, best quality first.
 *
 * Tool IDs are `<model>-<provider>` (e.g. `kling-kie`, `kling-piapi`). We
 * match by **model prefix** so whichever provider (KIE, PIAPI, Wavespeed,
 * Google direct) is configured gets picked up automatically — no need to
 * keep this list in lockstep with every provider variant.
 */
const DEFAULT_PREFERENCE = [
  'veo31',
  'veo3',
  'kling',
  'seedance',
  'wan',
  'hailuo',
  'hunyuan',
] as const;

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

  // Match each preference as a prefix against tool IDs. Example:
  // preference 'kling' matches 'kling-kie', 'kling-piapi', 'kling-img2video-piapi'.
  // Preserves preference order (best model first), and within a model the
  // registry's tool order breaks ties.
  const availableTools = [];
  const seen = new Set<string>();
  for (const modelPrefix of preference) {
    const matches = manifest.tools.filter(
      (t) => t.available && (t.id === modelPrefix || t.id.startsWith(`${modelPrefix}-`))
    );
    for (const entry of matches) {
      if (seen.has(entry.id)) continue;
      const tool = registry.get(entry.id);
      if (tool) {
        availableTools.push(tool);
        seen.add(entry.id);
      }
    }
  }

  if (availableTools.length === 0) {
    const available = manifest.tools.filter((t) => t.available).map((t) => t.id);
    throw new Error(
      `No video generation tool available. Checked model prefixes: ${[...preference].join(', ')}. Available tools: ${available.join(', ') || 'none'}`
    );
  }

  log.info(
    { tools: availableTools.map((t) => t.id) },
    `Creating video generator with ${availableTools.length} tool(s) in fallback chain`
  );

  return createVideoGenerator(availableTools, options);
}
