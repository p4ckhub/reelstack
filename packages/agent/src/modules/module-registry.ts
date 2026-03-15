/**
 * Global module registry for ReelStack reel type modules.
 *
 * Modules register themselves at import time via registerModule().
 * The worker discovers modules via getModule() or listModules().
 *
 * For open source core: only core modes (generate, compose, captions) are built-in.
 * Closed modules (n8n-explainer, ai-tips, etc.) register themselves when imported.
 */

import type { ReelModule } from './module-interface';
import { createLogger } from '@reelstack/logger';

const log = createLogger('module-registry');

const MODULES = new Map<string, ReelModule>();

/** Register a reel type module. Throws if ID already registered. */
export function registerModule(module: ReelModule): void {
  if (MODULES.has(module.id)) {
    throw new Error(`Module "${module.id}" is already registered`);
  }
  MODULES.set(module.id, module);
  log.info({ moduleId: module.id, compositionId: module.compositionId }, 'Module registered');
}

/** Get a module by its ID (= API mode). Returns undefined if not found. */
export function getModule(id: string): ReelModule | undefined {
  return MODULES.get(id);
}

/** List all registered modules. */
export function listModules(): ReelModule[] {
  return Array.from(MODULES.values());
}

/** Check if a mode corresponds to a registered module. */
export function isModuleMode(mode: string): boolean {
  return MODULES.has(mode);
}

/** Core modes handled directly by the worker (not via modules). */
export const CORE_MODES = ['generate', 'compose'] as const;
export type CoreMode = (typeof CORE_MODES)[number];

/** Check if a mode is a core mode. */
export function isCoreMode(mode: string): mode is CoreMode {
  return (CORE_MODES as readonly string[]).includes(mode);
}
