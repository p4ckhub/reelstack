export { HyperframesRenderer } from './renderer';
export type { HyperframesRendererOptions } from './renderer';
export { injectVariables } from './variable-injector';
export type { TemplateVariables } from './variable-injector';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Absolute filesystem path to a bundled composition directory.
 * Used by module descriptors: `compositionId: compositionPath('hello')`.
 */
export function compositionPath(name: string): string {
  return path.join(__dirname, 'compositions', name);
}
