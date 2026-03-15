import { describe, it, expect, beforeAll } from 'vitest';
import type { ReelModule } from '../module-interface';

// Import from the barrel to get registry API
import { registerModule, getModule, listModules, isModuleMode, isCoreMode, CORE_MODES } from '..';

/**
 * These tests verify the module registry mechanism itself.
 * Private modules (n8n-explainer, ai-tips, presenter-explainer) live in
 * @reelstack/modules and are NOT auto-registered here — they register
 * themselves when the consuming app imports @reelstack/modules.
 */

describe('module-registry', () => {
  // Register a test module to verify the mechanism works
  const TEST_MODULE: ReelModule = {
    id: 'test-module',
    name: 'Test Module',
    compositionId: 'TestComposition',
    configFields: [{ name: 'param', type: 'string', required: true, description: 'Test param' }],
    progressSteps: { 'Step 1': 50, 'Step 2': 100 },
    orchestrate: async () => ({ outputPath: '/tmp/test.mp4', durationSeconds: 10, meta: {} }),
  };

  beforeAll(() => {
    registerModule(TEST_MODULE);
  });

  it('registerModule adds a module to the registry', () => {
    const mod = getModule('test-module');
    expect(mod).toBeDefined();
    expect(mod!.name).toBe('Test Module');
  });

  it('listModules returns registered modules', () => {
    const modules = listModules();
    const ids = modules.map((m) => m.id);
    expect(ids).toContain('test-module');
  });

  it('getModule returns undefined for unknown id', () => {
    expect(getModule('nonexistent')).toBeUndefined();
  });

  it('isModuleMode returns true for registered modules', () => {
    expect(isModuleMode('test-module')).toBe(true);
  });

  it('isModuleMode returns false for core and unknown modes', () => {
    expect(isModuleMode('generate')).toBe(false);
    expect(isModuleMode('compose')).toBe(false);
    expect(isModuleMode('unknown')).toBe(false);
  });

  it('isCoreMode identifies core modes', () => {
    expect(isCoreMode('generate')).toBe(true);
    expect(isCoreMode('compose')).toBe(true);
    expect(isCoreMode('captions')).toBe(false); // captions is now a module, not a core mode
    expect(isCoreMode('test-module')).toBe(false);
    expect(isCoreMode('n8n-explainer')).toBe(false);
  });

  it('CORE_MODES contains exactly 2 modes', () => {
    expect(CORE_MODES).toEqual(['generate', 'compose']);
  });

  it('each registered module has required fields', () => {
    for (const mod of listModules()) {
      expect(mod.id).toBeTruthy();
      expect(mod.name).toBeTruthy();
      expect(mod.compositionId).toBeTruthy();
      expect(mod.configFields).toBeInstanceOf(Array);
      expect(Object.keys(mod.progressSteps).length).toBeGreaterThan(0);
      expect(typeof mod.orchestrate).toBe('function');
    }
  });

  it('module progressSteps have numeric values', () => {
    for (const mod of listModules()) {
      for (const [step, value] of Object.entries(mod.progressSteps)) {
        expect(typeof step).toBe('string');
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});
