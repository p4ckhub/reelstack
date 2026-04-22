import { describe, it, expect } from 'vitest';
import {
  RendererDispatcher,
  RemotionRendererAdapter,
  HyperframesRenderer,
  createDispatcher,
  type Renderer,
  type RenderInput,
  type RenderOptions,
  type RenderResult,
} from '../index';

function fakeRenderer(runtime: 'remotion' | 'hyperframes'): Renderer {
  return {
    runtime,
    async render(input: RenderInput, options: RenderOptions): Promise<RenderResult> {
      return {
        outputPath: options.outputPath,
        sizeBytes: input.composition.length,
        durationMs: 1,
      };
    },
  };
}

describe('RendererDispatcher', () => {
  it('routes by runtime', async () => {
    const d = new RendererDispatcher()
      .register(fakeRenderer('remotion'))
      .register(fakeRenderer('hyperframes'));

    const r1 = await d.render(
      'remotion',
      { composition: 'Reel', variables: {} },
      { outputPath: '/tmp/a.mp4' }
    );
    const r2 = await d.render(
      'hyperframes',
      { composition: 'hello.html', variables: {} },
      { outputPath: '/tmp/b.mp4' }
    );

    expect(r1.outputPath).toBe('/tmp/a.mp4');
    expect(r2.outputPath).toBe('/tmp/b.mp4');
    expect(r1.sizeBytes).toBe(4);
    expect(r2.sizeBytes).toBe(10);
  });

  it('throws when runtime is missing', () => {
    const d = new RendererDispatcher().register(fakeRenderer('remotion'));
    expect(() => d.get('hyperframes')).toThrow(/No renderer registered/);
  });

  it('has() reports registration', () => {
    const d = new RendererDispatcher().register(fakeRenderer('remotion'));
    expect(d.has('remotion')).toBe(true);
    expect(d.has('hyperframes')).toBe(false);
  });

  it('createDispatcher() pre-registers both runtimes', () => {
    const d = createDispatcher();
    expect(d.has('remotion')).toBe(true);
    expect(d.has('hyperframes')).toBe(true);
  });
});

describe('HyperframesRenderer lazy adapter', () => {
  it('forwards to the real implementation in @reelstack/hyperframes', async () => {
    // Real implementation requires a valid composition directory and
    // the hyperframes CLI. Here we just verify the adapter doesn't
    // throw "not implemented" — it delegates, then fails at the real
    // renderer's own validation (missing composition dir).
    const hf = new HyperframesRenderer();
    await expect(
      hf.render(
        { composition: '/definitely-not-a-dir', variables: {} },
        { outputPath: '/tmp/x.mp4' }
      )
    ).rejects.toThrow(/not a directory/);
  });

  it('advertises its runtime tag', () => {
    expect(new HyperframesRenderer().runtime).toBe('hyperframes');
  });
});

describe('RemotionRendererAdapter', () => {
  it('delegates to the inner factory with composition as compositionId', async () => {
    const captured: { props?: Record<string, unknown>; compositionId?: string } = {};

    const adapter = new RemotionRendererAdapter(() => ({
      async render(
        props: Record<string, unknown>,
        opts: { outputPath: string; compositionId?: string }
      ) {
        captured.props = props;
        captured.compositionId = opts.compositionId;
        return { outputPath: opts.outputPath, sizeBytes: 123, durationMs: 42 };
      },
    }));

    const result = await adapter.render(
      { composition: 'Reel', variables: { headline: 'Test' } },
      { outputPath: '/tmp/out.mp4', codec: 'h264' }
    );

    expect(result.sizeBytes).toBe(123);
    expect(captured.props).toEqual({ headline: 'Test' });
    expect(captured.compositionId).toBe('Reel');
  });

  it('advertises its runtime tag', () => {
    const stub = { render: async () => ({ outputPath: '', sizeBytes: 0, durationMs: 0 }) };
    expect(new RemotionRendererAdapter(() => stub).runtime).toBe('remotion');
  });
});
