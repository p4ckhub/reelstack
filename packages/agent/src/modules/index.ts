/**
 * Module system barrel file.
 *
 * Exports the registry API and registers all built-in modules.
 *
 * When modules are extracted to a closed repo, this file will only
 * export the registry API. Module registration will happen in the
 * consuming app (e.g., worker) via explicit imports:
 *
 *   import '@reelstack-modules/n8n-explainer'; // self-registers
 *   import '@reelstack-modules/ai-tips';       // self-registers
 */

// Re-export registry API
export {
  registerModule,
  getModule,
  listModules,
  isModuleMode,
  isCoreMode,
  CORE_MODES,
} from './module-registry';

// Re-export types
export type {
  ReelModule,
  BaseModuleRequest,
  ModuleResult,
  ProgressCallback,
} from './module-interface';

// ── Module registration ───────────────────────────────────────
// Modules live in @reelstack/modules (private package).
// Registration is triggered by the consuming app (worker) importing that package:
//   import '@reelstack/modules';
