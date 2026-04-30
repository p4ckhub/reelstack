/**
 * Global module registry for ReelStack reel type modules.
 *
 * Modules register themselves at import time via registerModule().
 * The worker discovers modules via getModule() or listModules().
 *
 * For open source core: only core modes (generate, compose) are built-in.
 * Closed modules (n8n-explainer, ai-tips, etc.) register themselves when imported.
 */

import type { ModuleRuntime, ReelModule, RuntimeImpl } from './module-interface';
import { createLogger } from '@reelstack/logger';

const log = createLogger('module-registry');

const MODULES = new Map<string, ReelModule>();

/**
 * Register a reel type module. Throws if ID already registered or if the
 * runtime declaration is invalid.
 *
 * Backward-compat: modules that omit `runtimes` are auto-promoted to a
 * single-runtime descriptor derived from `runtime` (default 'remotion')
 * + `compositionId`. Existing modules don't need a code change.
 */
export function registerModule(module: ReelModule): void {
  if (MODULES.has(module.id)) {
    throw new Error(`Module "${module.id}" is already registered`);
  }

  // BC: derive runtimes/defaultRuntime from legacy fields when missing.
  const promoted = withDerivedRuntimes(module);
  validateRuntimeDeclaration(promoted);

  MODULES.set(promoted.id, promoted);
  log.info(
    {
      moduleId: promoted.id,
      defaultRuntime: promoted.defaultRuntime,
      runtimes: Object.keys(promoted.runtimes ?? {}),
    },
    'Module registered'
  );
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

/**
 * Resolve which runtime to use for a request. Order:
 * 1. The explicitly requested runtime — must be supported by the module.
 * 2. The module's `defaultRuntime`.
 * Throws when the requested runtime isn't declared by the module.
 */
export function resolveRuntime(module: ReelModule, requested?: ModuleRuntime): ModuleRuntime {
  const supported = Object.keys(module.runtimes ?? {}) as ModuleRuntime[];
  if (requested) {
    if (!supported.includes(requested)) {
      throw new Error(
        `Module "${module.id}" does not support runtime "${requested}". Available: ${supported.join(', ')}`
      );
    }
    return requested;
  }
  if (!module.defaultRuntime) {
    throw new Error(`Module "${module.id}" has no defaultRuntime`);
  }
  return module.defaultRuntime;
}

/**
 * Get the per-runtime implementation for a module. Throws when the
 * module doesn't declare an impl for the runtime.
 */
export function getRuntimeImpl(module: ReelModule, runtime: ModuleRuntime): RuntimeImpl {
  const impl = module.runtimes?.[runtime];
  if (!impl) {
    throw new Error(`Module "${module.id}" has no impl for runtime "${runtime}"`);
  }
  return impl;
}

/** Core modes handled directly by the worker (not via modules). */
export const CORE_MODES = ['generate', 'compose'] as const;
export type CoreMode = (typeof CORE_MODES)[number];

/** Check if a mode is a core mode. */
export function isCoreMode(mode: string): mode is CoreMode {
  return (CORE_MODES as readonly string[]).includes(mode);
}

// ── internals ──────────────────────────────────────────────────

/**
 * Promote a legacy module (single `runtime` + `compositionId`) to the
 * new dual-runtime shape. Idempotent: modules already declaring
 * `runtimes` pass through unchanged (with `defaultRuntime` filled in
 * from `runtime` if missing).
 */
function withDerivedRuntimes(module: ReelModule): ReelModule {
  if (module.runtimes && Object.keys(module.runtimes).length > 0) {
    // New-style — make sure defaultRuntime is set.
    const defaultRuntime =
      module.defaultRuntime ?? module.runtime ?? firstRuntime(module.runtimes) ?? 'remotion';
    return { ...module, defaultRuntime };
  }

  // Legacy — synthesize runtimes from `runtime` + `compositionId`.
  const runtime: ModuleRuntime = module.runtime ?? 'remotion';
  return {
    ...module,
    runtimes: {
      [runtime]: { compositionId: module.compositionId },
    },
    defaultRuntime: runtime,
  };
}

function firstRuntime(
  runtimes: Partial<Record<ModuleRuntime, RuntimeImpl>>
): ModuleRuntime | undefined {
  return (Object.keys(runtimes) as ModuleRuntime[])[0];
}

function validateRuntimeDeclaration(module: ReelModule): void {
  if (!module.runtimes || Object.keys(module.runtimes).length === 0) {
    throw new Error(`Module "${module.id}" must declare at least one runtime`);
  }
  if (!module.defaultRuntime) {
    throw new Error(`Module "${module.id}" must declare defaultRuntime`);
  }
  if (!module.runtimes[module.defaultRuntime]) {
    throw new Error(
      `Module "${module.id}" defaultRuntime "${module.defaultRuntime}" not in runtimes`
    );
  }
  for (const [runtime, impl] of Object.entries(module.runtimes)) {
    if (!impl?.compositionId) {
      throw new Error(`Module "${module.id}" runtime "${runtime}" missing compositionId`);
    }
  }
}
