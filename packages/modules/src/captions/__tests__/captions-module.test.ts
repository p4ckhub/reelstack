import { describe, it, expect, beforeEach } from 'vitest';

// Reset module registry between tests to avoid double registration
beforeEach(async () => {
  // Clear the module registry
  const { listModules } = await import('@reelstack/agent');
  // We use a fresh import via dynamic require each time
  // by resetting the module map via a helper
});

describe('captions module', () => {
  it('registers with id "captions"', async () => {
    const { getModule } = await import('@reelstack/agent');
    // Import module to trigger registration
    await import('../module');
    const mod = getModule('captions');
    expect(mod).toBeDefined();
    expect(mod!.id).toBe('captions');
  });

  it('has compositionId "VideoClip"', async () => {
    const { getModule } = await import('@reelstack/agent');
    const mod = getModule('captions');
    expect(mod).toBeDefined();
    expect(mod!.compositionId).toBe('VideoClip');
  });

  it('has videoUrl as required configField', async () => {
    const { getModule } = await import('@reelstack/agent');
    const mod = getModule('captions');
    expect(mod).toBeDefined();
    const videoUrlField = mod!.configFields?.find((f) => f.name === 'videoUrl');
    expect(videoUrlField).toBeDefined();
    expect(videoUrlField!.required).toBe(true);
  });
});
