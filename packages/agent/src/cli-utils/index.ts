/**
 * Shared CLI utilities. DRY extraction from cli.ts.
 * Used by all command modules in commands/*.ts.
 */
export { setupRegistry, loadPrivateModules } from './registry';
export { uploadToR2, downloadFile, createStorageClient } from './storage';
export { pollUntilDone, type PollableTool } from './polling';
export {
  flag,
  opt,
  positional,
  save,
  elapsed,
  outDir,
  B,
  G,
  Y,
  R,
  D,
  X,
  cleanScriptFile,
  requireFile,
  loadJSON,
} from './cli-helpers';
