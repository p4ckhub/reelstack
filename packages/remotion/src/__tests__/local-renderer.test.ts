import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockExecFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockStatSync = vi.fn();
const mockExistsSync = vi.fn();
const mockRmSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockUnlinkSync = vi.fn();

vi.mock('child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

vi.mock('fs', () => {
  const fsMock = {
    mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
    statSync: (...args: unknown[]) => mockStatSync(...args),
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    rmSync: (...args: unknown[]) => mockRmSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
    readFileSync: () => '',
  };
  return { ...fsMock, default: fsMock };
});

const { LocalRenderer } = await import('../render/local-renderer');

const minimalProps = {
  layout: 'fullscreen' as const,
  cues: [],
  bRollSegments: [],
  musicVolume: 0,
  showProgressBar: false,
  backgroundColor: '#000',
};

describe('LocalRenderer', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv.REMOTION_BUNDLE_PATH = process.env.REMOTION_BUNDLE_PATH;
    savedEnv.REMOTION_CONCURRENCY = process.env.REMOTION_CONCURRENCY;

    mockStatSync.mockReturnValue({ size: 50000 });
    mockExistsSync.mockReturnValue(true); // cached bundle exists
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('uses pre-built bundle when REMOTION_BUNDLE_PATH set', async () => {
    process.env.REMOTION_BUNDLE_PATH = '/app/remotion-bundle';
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4' });

    // Should NOT call bundle CLI
    const bundleCalls = mockExecFileSync.mock.calls.filter(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes('bundle')
    );
    expect(bundleCalls).toHaveLength(0);

    // Should call render CLI with the pre-built path
    const renderCall = mockExecFileSync.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes('render')
    );
    expect(renderCall).toBeDefined();
    expect((renderCall![1] as string[])[2]).toBe('/app/remotion-bundle');
  });

  it('bundles via CLI when REMOTION_BUNDLE_PATH not set', async () => {
    delete process.env.REMOTION_BUNDLE_PATH;
    mockExistsSync.mockReturnValue(false); // no cached bundle
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4' });

    const bundleCalls = mockExecFileSync.mock.calls.filter(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes('bundle')
    );
    expect(bundleCalls).toHaveLength(1);
  });

  it('passes concurrency option to CLI', async () => {
    delete process.env.REMOTION_CONCURRENCY;
    process.env.REMOTION_BUNDLE_PATH = '/app/bundle';
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4', concurrency: 3 });

    const renderCall = mockExecFileSync.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes('render')
    );
    expect(renderCall![1] as string[]).toContain('--concurrency=3');
  });

  it('respects REMOTION_CONCURRENCY env var', async () => {
    process.env.REMOTION_CONCURRENCY = '2';
    process.env.REMOTION_BUNDLE_PATH = '/app/bundle';
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4' });

    const renderCall = mockExecFileSync.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes('render')
    );
    expect(renderCall![1] as string[]).toContain('--concurrency=2');
  });

  it('selects h264 codec by default', async () => {
    process.env.REMOTION_BUNDLE_PATH = '/app/bundle';
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4' });

    const renderCall = mockExecFileSync.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes('render')
    );
    expect(renderCall![1] as string[]).toContain('--codec=h264');
  });

  it('selects h265 when requested', async () => {
    process.env.REMOTION_BUNDLE_PATH = '/app/bundle';
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4', codec: 'h265' });

    const renderCall = mockExecFileSync.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[1]) && (c[1] as string[]).includes('render')
    );
    expect(renderCall![1] as string[]).toContain('--codec=h265');
  });

  it('returns correct render result', async () => {
    process.env.REMOTION_BUNDLE_PATH = '/app/bundle';
    mockStatSync.mockReturnValue({ size: 123456 });
    const renderer = new LocalRenderer();
    const result = await renderer.render(minimalProps, { outputPath: '/tmp/out.mp4' });

    expect(result.outputPath).toBe('/tmp/out.mp4');
    expect(result.sizeBytes).toBe(123456);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('creates output directory', async () => {
    process.env.REMOTION_BUNDLE_PATH = '/app/bundle';
    const renderer = new LocalRenderer();
    await renderer.render(minimalProps, { outputPath: '/tmp/deep/dir/out.mp4' });

    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/deep/dir', { recursive: true });
  });
});
