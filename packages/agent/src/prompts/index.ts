/**
 * Public API for the prompt template system.
 *
 * Usage:
 *   import { renderPrompt, loadTemplate, loadGuideline } from './prompts';
 *
 *   const prompt = renderPrompt('planner', { toolSection, effectSection });
 */
export { renderTemplate } from './renderer';
export { loadTemplate, loadPartial, loadGuideline, loadAllPartials, clearCache } from './loader';

import { renderTemplate } from './renderer';
import { loadTemplate, loadAllPartials } from './loader';

/**
 * Load a named template and render it with variables and all available partials.
 *
 * Convenience function that combines loadTemplate + loadAllPartials + renderTemplate.
 */
export function renderPrompt(templateName: string, variables: Record<string, string> = {}): string {
  const template = loadTemplate(templateName);
  const partials = loadAllPartials();
  return renderTemplate(template, variables, partials);
}
