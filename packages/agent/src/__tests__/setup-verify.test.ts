/**
 * Verify that test setup correctly protects against real API calls.
 * If this test fails, tests/setup.ts preload is not working.
 */
import { describe, it, expect } from 'vitest';
import { getModel, getActivePreset } from '../config/models';

describe('test safety', () => {
  it('MODEL_PRESET is set to testing', () => {
    expect(getActivePreset()).toBe('testing');
  });

  it('all LLM roles use Haiku (cheapest model)', () => {
    const roles = ['planner', 'supervisor', 'promptWriter', 'scriptReviewer', 'director'] as const;
    for (const role of roles) {
      const model = getModel(role, 'anthropic');
      expect(model).toContain('haiku');
    }
  });

  it('ANTHROPIC_API_KEY is not set', () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('OPENROUTER_API_KEY is not set', () => {
    expect(process.env.OPENROUTER_API_KEY).toBeUndefined();
  });
});
