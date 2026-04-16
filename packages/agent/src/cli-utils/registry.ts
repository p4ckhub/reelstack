/**
 * Tool registry setup and private module loading.
 * Consolidates 4x duplicated patterns from cli.ts.
 */
import { D, X } from './cli-helpers';

/**
 * Load private modules (reelstack-modules repo).
 * Silently skips if not available.
 */
export async function loadPrivateModules(): Promise<void> {
  try {
    // Private module with no type declarations — tolerate when it resolves.
    // @ts-ignore
    await import('@reelstack/modules');
  } catch {
    try {
      await import('../../../modules/src/index');
    } catch {
      /* no private modules available */
    }
  }
}

/**
 * Create a fully initialized tool registry: load modules, register tools, run health checks.
 * Returns the registry ready for use.
 */
export async function setupRegistry(): Promise<import('../registry/tool-registry').ToolRegistry> {
  await loadPrivateModules();

  const { ToolRegistry } = await import('../registry/tool-registry');
  const { discoverTools } = await import('../registry/discovery');

  const registry = new ToolRegistry();
  for (const tool of discoverTools()) registry.register(tool);
  await registry.discover();

  const available = registry
    .getToolManifest()
    .tools.filter((t: { available: boolean }) => t.available);
  console.log(`${D}${available.length} tools available${X}`);

  return registry;
}
