import { describe, it, expect, beforeAll } from 'vitest';
import type { ReelModule } from '../module-interface';

// Import from the barrel to get registry API
import {
  registerModule,
  getModule,
  listModules,
  isModuleMode,
  isCoreMode,
  resolveRuntime,
  getRuntimeImpl,
  CORE_MODES,
} from '..';

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

  // ── Dual-runtime + BC ──────────────────────────────────────

  describe('dual-runtime', () => {
    it('legacy module (only `runtime` + `compositionId`) is auto-promoted to runtimes shape', () => {
      const legacy: ReelModule = {
        id: 'legacy-bc',
        name: 'Legacy BC',
        runtime: 'remotion',
        compositionId: 'LegacyComp',
        configFields: [],
        progressSteps: { Step: 100 },
        orchestrate: async () => ({ outputPath: '/x.mp4', durationSeconds: 1 }),
      };
      registerModule(legacy);
      const stored = getModule('legacy-bc')!;
      expect(stored.runtimes).toBeDefined();
      expect(stored.runtimes!.remotion?.compositionId).toBe('LegacyComp');
      expect(stored.defaultRuntime).toBe('remotion');
    });

    it('legacy module without `runtime` defaults to remotion', () => {
      const legacy: ReelModule = {
        id: 'legacy-default-rt',
        name: 'Legacy Default Runtime',
        compositionId: 'LegacyDefault',
        configFields: [],
        progressSteps: { Step: 100 },
        orchestrate: async () => ({ outputPath: '/x.mp4', durationSeconds: 1 }),
      };
      registerModule(legacy);
      expect(getModule('legacy-default-rt')!.defaultRuntime).toBe('remotion');
    });

    it('dual-runtime module preserves both runtime impls', () => {
      const dual: ReelModule = {
        id: 'dual-test',
        name: 'Dual Test',
        compositionId: 'DualRemotion', // unused once runtimes is set, kept for legacy field
        runtimes: {
          remotion: { compositionId: 'DualRemotion' },
          hyperframes: { compositionId: '/path/to/dual-hf' },
        },
        defaultRuntime: 'remotion',
        configFields: [],
        progressSteps: { Step: 100 },
        orchestrate: async () => ({ outputPath: '/x.mp4', durationSeconds: 1 }),
      };
      registerModule(dual);
      const stored = getModule('dual-test')!;
      expect(stored.runtimes!.remotion?.compositionId).toBe('DualRemotion');
      expect(stored.runtimes!.hyperframes?.compositionId).toBe('/path/to/dual-hf');
    });

    it('resolveRuntime returns requested when supported', () => {
      const mod = getModule('dual-test')!;
      expect(resolveRuntime(mod, 'hyperframes')).toBe('hyperframes');
      expect(resolveRuntime(mod, 'remotion')).toBe('remotion');
    });

    it('resolveRuntime falls back to defaultRuntime when no request', () => {
      const mod = getModule('dual-test')!;
      expect(resolveRuntime(mod)).toBe('remotion');
    });

    it('resolveRuntime throws when requested runtime is not supported', () => {
      const mod = getModule('legacy-bc')!;
      expect(() => resolveRuntime(mod, 'hyperframes')).toThrow(
        /does not support runtime "hyperframes"/
      );
    });

    it('getRuntimeImpl returns the impl for the runtime', () => {
      const mod = getModule('dual-test')!;
      expect(getRuntimeImpl(mod, 'remotion').compositionId).toBe('DualRemotion');
      expect(getRuntimeImpl(mod, 'hyperframes').compositionId).toBe('/path/to/dual-hf');
    });

    it('registerModule rejects empty compositionId (legacy + new shape)', () => {
      // Legacy path: empty compositionId synthesized into runtimes.
      const badLegacy: ReelModule = {
        id: 'bad-legacy-empty',
        name: 'Bad Legacy Empty',
        compositionId: '',
        configFields: [],
        progressSteps: { Step: 100 },
        orchestrate: async () => ({ outputPath: '/x.mp4', durationSeconds: 1 }),
      };
      expect(() => registerModule(badLegacy)).toThrow(/missing compositionId/);
    });

    it('registerModule rejects defaultRuntime not in runtimes', () => {
      const bad: ReelModule = {
        id: 'bad-default-mismatch',
        name: 'Bad Default',
        compositionId: '',
        runtimes: { remotion: { compositionId: 'X' } },
        defaultRuntime: 'hyperframes',
        configFields: [],
        progressSteps: { Step: 100 },
        orchestrate: async () => ({ outputPath: '/x.mp4', durationSeconds: 1 }),
      };
      expect(() => registerModule(bad)).toThrow(/not in runtimes/);
    });

    it('registerModule rejects runtime impl with empty compositionId', () => {
      const bad: ReelModule = {
        id: 'bad-empty-comp',
        name: 'Bad Empty Comp',
        compositionId: '',
        runtimes: { remotion: { compositionId: '' } },
        defaultRuntime: 'remotion',
        configFields: [],
        progressSteps: { Step: 100 },
        orchestrate: async () => ({ outputPath: '/x.mp4', durationSeconds: 1 }),
      };
      expect(() => registerModule(bad)).toThrow(/missing compositionId/);
    });
  });
});
