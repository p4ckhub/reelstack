/**
 * Shared tool discovery helpers used by module descriptors.
 *
 * Modules need to discover specific tools by ID (e.g., image/video generators).
 * This extracts the common pattern of: create registry -> register all -> discover -> filter by ID.
 */
import type { ProductionTool } from './tool-interface';
import { ToolRegistry } from './tool-registry';
import { discoverTools } from './discovery';

/**
 * Discover available tools by ID list.
 * Creates a fresh ToolRegistry, runs health checks, and returns only
 * tools that are both registered and available (health check passed).
 *
 * @param toolIds - ordered list of tool IDs to look for
 * @returns resolved tools in the same order as toolIds (unavailable ones filtered out)
 */
export async function discoverAvailableTools(toolIds: string[]): Promise<ProductionTool[]> {
  const registry = new ToolRegistry();
  for (const tool of discoverTools()) {
    registry.register(tool);
  }
  await registry.discover();
  return toolIds.map((id) => registry.get(id)).filter(Boolean) as ProductionTool[];
}

/**
 * Find first available tool from an ordered ID list.
 * Convenience wrapper for cases that need a single tool with fallback priority.
 *
 * @param toolIds - ordered list of tool IDs (first available wins)
 * @returns the first available tool, or null if none are available
 */
export async function findFirstAvailableTool(toolIds: string[]): Promise<ProductionTool | null> {
  const tools = await discoverAvailableTools(toolIds);
  return tools[0] ?? null;
}
