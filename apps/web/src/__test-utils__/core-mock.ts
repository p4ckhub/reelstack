/**
 * Shared @reelstack/core mock factory for apps/web tests.
 *
 * Same pattern as database-mock.ts — prevents vi.mock cross-contamination
 * in bun's single-process test runner.
 */

export const MOCK_BUILT_IN_TEMPLATES = [
  {
    id: 'built-in-1',
    name: 'Default',
    description: 'Default template',
    style: { fontSize: 24 },
    category: 'minimal',
    isBuiltIn: true,
    isPublic: true,
    usageCount: 100,
  },
];

export function coreMockFactory() {
  return {
    sanitizeStyle: (s: unknown) => s,
    BUILT_IN_TEMPLATES: MOCK_BUILT_IN_TEMPLATES,
  };
}
