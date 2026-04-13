import type { ProductionTool } from './tool-interface';
import type { AssetType, ToolManifest, ToolManifestEntry } from '../types';
import { createLogger } from '@reelstack/logger';
import { setToolRegistryRef } from '../config/pricing';

const log = createLogger('tool-registry');

/**
 * Registry that discovers and manages available production tools.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ProductionTool>();
  private readonly availability = new Map<string, boolean>();

  register(tool: ProductionTool): void {
    this.tools.set(tool.id, tool);
    // Let pricing module resolve tool-declared pricing
    setToolRegistryRef(this);
  }

  /** Run healthCheck on all registered tools, mark available/unavailable */
  async discover(): Promise<void> {
    const checks = [...this.tools.values()].map(async (tool) => {
      try {
        const result = await tool.healthCheck();
        this.availability.set(tool.id, result.available);
        if (result.available) {
          log.info({ toolId: tool.id }, 'Tool available');
        } else {
          log.info({ toolId: tool.id, reason: result.reason }, 'Tool unavailable');
        }
      } catch (err) {
        this.availability.set(tool.id, false);
        log.warn({ toolId: tool.id, err }, 'Tool health check failed');
      }
    });

    await Promise.all(checks);
  }

  /** Get all available tools that produce a given asset type */
  getByCapability(assetType: AssetType): ProductionTool[] {
    return [...this.tools.values()].filter(
      (tool) =>
        this.availability.get(tool.id) === true &&
        tool.capabilities.some((c) => c.assetType === assetType)
    );
  }

  /** Get a specific tool by ID (only if available) */
  get(toolId: string): ProductionTool | undefined {
    const tool = this.tools.get(toolId);
    if (!tool || !this.availability.get(toolId)) return undefined;
    return tool;
  }

  /** Get all registered tools (regardless of availability) */
  getAll(): ProductionTool[] {
    return [...this.tools.values()];
  }

  /** Get all available tools */
  getAvailable(): ProductionTool[] {
    return [...this.tools.values()].filter((t) => this.availability.get(t.id) === true);
  }

  /** Build a manifest for the LLM planner describing available tools */
  getToolManifest(): ToolManifest {
    const tools: ToolManifestEntry[] = [...this.tools.values()].map((tool) => ({
      id: tool.id,
      name: tool.name,
      available: this.availability.get(tool.id) ?? false,
      capabilities: tool.capabilities,
      promptGuidelines: tool.promptGuidelines,
    }));

    const available = tools.filter((t) => t.available);
    const summary =
      available.length === 0
        ? 'No production tools available. Only stock footage from Pexels can be used.'
        : `Available tools: ${available.map((t) => `${t.name} (${t.capabilities.map((c) => c.assetType).join(', ')})`).join('; ')}`;

    return { tools, summary };
  }
}
