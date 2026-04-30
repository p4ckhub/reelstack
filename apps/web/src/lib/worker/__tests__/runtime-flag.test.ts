import { describe, expect, it } from 'vitest';
import { applyRuntimeFlag } from '../runtime-flag';

describe('applyRuntimeFlag', () => {
  const supportedBoth = ['remotion', 'hyperframes'] as const;

  it('returns requested runtime untouched when caller is explicit', () => {
    const out = applyRuntimeFlag({
      mode: 'slideshow',
      jobId: 'job-1',
      supported: supportedBoth,
      requested: 'remotion',
      env: { RUNTIME_OVERRIDE_PCT_SLIDESHOW: '100' },
    });
    expect(out).toEqual({ runtime: 'remotion', overridden: false });
  });

  it('returns undefined when no env var is set', () => {
    const out = applyRuntimeFlag({
      mode: 'slideshow',
      jobId: 'job-1',
      supported: supportedBoth,
      env: {},
    });
    expect(out).toEqual({ runtime: undefined, overridden: false });
  });

  it('returns undefined when pct is 0 or invalid', () => {
    for (const pct of ['0', 'nope', '-5']) {
      const out = applyRuntimeFlag({
        mode: 'slideshow',
        jobId: 'job-1',
        supported: supportedBoth,
        env: { RUNTIME_OVERRIDE_PCT_SLIDESHOW: pct },
      });
      expect(out).toEqual({ runtime: undefined, overridden: false });
    }
  });

  it('skips override when module does not support hyperframes', () => {
    const out = applyRuntimeFlag({
      mode: 'slideshow',
      jobId: 'job-1',
      supported: ['remotion'],
      env: { RUNTIME_OVERRIDE_PCT_SLIDESHOW: '100' },
    });
    expect(out).toEqual({ runtime: undefined, overridden: false });
  });

  it('overrides every job when pct=100', () => {
    for (const jobId of ['a', 'b', 'c', 'd', 'e']) {
      const out = applyRuntimeFlag({
        mode: 'slideshow',
        jobId,
        supported: supportedBoth,
        env: { RUNTIME_OVERRIDE_PCT_SLIDESHOW: '100' },
      });
      expect(out).toEqual({ runtime: 'hyperframes', overridden: true });
    }
  });

  it('is deterministic — same jobId+mode lands in the same bucket across runs', () => {
    const args = {
      mode: 'slideshow',
      jobId: 'stable-job',
      supported: supportedBoth,
      env: { RUNTIME_OVERRIDE_PCT_SLIDESHOW: '50' },
    } as const;
    const a = applyRuntimeFlag(args);
    const b = applyRuntimeFlag(args);
    expect(a).toEqual(b);
  });

  it('approximates the configured percentage at scale', () => {
    let overridden = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const out = applyRuntimeFlag({
        mode: 'slideshow',
        jobId: `job-${i}`,
        supported: supportedBoth,
        env: { RUNTIME_OVERRIDE_PCT_SLIDESHOW: '25' },
      });
      if (out.overridden) overridden++;
    }
    // 25% target, ±5% slack on 1000 samples is comfortable.
    expect(overridden / N).toBeGreaterThan(0.2);
    expect(overridden / N).toBeLessThan(0.3);
  });

  it('hyphenated mode names map to underscored env vars', () => {
    const out = applyRuntimeFlag({
      mode: 'n8n-explainer',
      jobId: 'job-1',
      supported: supportedBoth,
      env: { RUNTIME_OVERRIDE_PCT_N8N_EXPLAINER: '100' },
    });
    expect(out).toEqual({ runtime: 'hyperframes', overridden: true });
  });
});
