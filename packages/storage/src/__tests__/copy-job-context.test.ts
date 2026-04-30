/**
 * `copyJobContext` clones an entire pipeline-context tree from one job
 * id to another in MinIO/Supabase. Used by the resume API's fork flow
 * so the child ReelJob inherits all cached step outputs (workflow JSON,
 * generated script, voiceover URLs, screenshot, etc.) and only re-runs
 * the steps from `fromStepId` onwards.
 *
 * Critical contract: applies `contextOverrides` to `context.input`
 * BEFORE writing the target's `context.json`, so the resumed pipeline
 * picks up the new endCard / captionStyle / etc. without further
 * orchestrator changes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { copyJobContext } from '../copy-job-context';
import type { StorageAdapter } from '@reelstack/types';

class InMemoryStorage implements StorageAdapter {
  files = new Map<string, Buffer>();

  async upload(file: Buffer, path: string): Promise<string> {
    this.files.set(path, file);
    return path;
  }

  async download(path: string): Promise<Buffer> {
    const file = this.files.get(path);
    if (!file) throw new Error(`Not found: ${path}`);
    return file;
  }

  async getSignedUrl(path: string): Promise<string> {
    return `mock://${path}`;
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }
}

let storage: InMemoryStorage;

beforeEach(() => {
  storage = new InMemoryStorage();

  // Seed: a typical n8n-explainer context with 7 step outputs.
  const sourceContext = {
    jobId: 'src-1',
    input: {
      mode: 'n8n-explainer',
      workflowUrl: 'https://n8n.io/workflows/2813',
      language: 'pl',
      endCard: { platform: 'ig', enabled: true, durationSeconds: 4 },
      tts: { provider: 'gemini-tts', voice: 'Charon' },
    },
    results: {
      'fetch-workflow': { workflow: { id: '2813', name: 'WP DeepSeek' } },
      'generate-script': { script: 'PL script text' },
      'review-script': { script: 'PL script text reviewed' },
      'capture-screenshot': { screenshotUrl: 'https://r2/shot.png' },
      'tts-pipeline': { voiceoverUrl: 'https://r2/voice.mp3', durationSeconds: 60 },
      'assemble-props': { props: { compositionId: 'n8n-explainer' } },
      render: { outputUrl: 'https://r2/parent.mp4' },
    },
  };
  storage.files.set('jobs/src-1/context.json', Buffer.from(JSON.stringify(sourceContext)));
  for (const stepId of Object.keys(sourceContext.results)) {
    storage.files.set(
      `jobs/src-1/steps/${stepId}.json`,
      Buffer.from(JSON.stringify((sourceContext.results as Record<string, unknown>)[stepId]))
    );
  }
});

describe('copyJobContext', () => {
  it('copies context.json + every step file to the target job path', async () => {
    await copyJobContext({ sourceJobId: 'src-1', targetJobId: 'child-1', storage });

    expect(storage.files.has('jobs/child-1/context.json')).toBe(true);
    expect(storage.files.has('jobs/child-1/steps/fetch-workflow.json')).toBe(true);
    expect(storage.files.has('jobs/child-1/steps/generate-script.json')).toBe(true);
    expect(storage.files.has('jobs/child-1/steps/review-script.json')).toBe(true);
    expect(storage.files.has('jobs/child-1/steps/capture-screenshot.json')).toBe(true);
    expect(storage.files.has('jobs/child-1/steps/tts-pipeline.json')).toBe(true);
    expect(storage.files.has('jobs/child-1/steps/assemble-props.json')).toBe(true);
    expect(storage.files.has('jobs/child-1/steps/render.json')).toBe(true);
  });

  it('rewrites jobId in target context.json so the engine loads the right context', async () => {
    await copyJobContext({ sourceJobId: 'src-1', targetJobId: 'child-1', storage });

    const tgt = JSON.parse(storage.files.get('jobs/child-1/context.json')!.toString());
    expect(tgt.jobId).toBe('child-1');
  });

  it('applies contextOverrides via deep merge into context.input', async () => {
    await copyJobContext({
      sourceJobId: 'src-1',
      targetJobId: 'child-1',
      storage,
      contextOverrides: { endCard: { platform: 'fb' } },
    });

    const tgt = JSON.parse(storage.files.get('jobs/child-1/context.json')!.toString());
    expect(tgt.input.endCard).toEqual({
      platform: 'fb', // overridden
      enabled: true, // preserved
      durationSeconds: 4, // preserved
    });
    // Untouched fields stay
    expect(tgt.input.workflowUrl).toBe('https://n8n.io/workflows/2813');
    expect(tgt.input.tts).toEqual({ provider: 'gemini-tts', voice: 'Charon' });
  });

  it('preserves step results verbatim (cached outputs are immutable)', async () => {
    await copyJobContext({
      sourceJobId: 'src-1',
      targetJobId: 'child-1',
      storage,
      contextOverrides: { endCard: { platform: 'fb' } },
    });

    const tgt = JSON.parse(storage.files.get('jobs/child-1/context.json')!.toString());
    expect(tgt.results['fetch-workflow']).toEqual({
      workflow: { id: '2813', name: 'WP DeepSeek' },
    });
    expect(tgt.results['tts-pipeline']).toEqual({
      voiceoverUrl: 'https://r2/voice.mp3',
      durationSeconds: 60,
    });
  });

  it('throws when source context.json is missing', async () => {
    await expect(
      copyJobContext({ sourceJobId: 'never-existed', targetJobId: 'child-1', storage })
    ).rejects.toThrow();
  });

  it('skips per-step copy when context has no results (legacy / failed jobs)', async () => {
    storage.files.set(
      'jobs/empty/context.json',
      Buffer.from(JSON.stringify({ jobId: 'empty', input: {}, results: {} }))
    );

    await copyJobContext({ sourceJobId: 'empty', targetJobId: 'child-2', storage });

    expect(storage.files.has('jobs/child-2/context.json')).toBe(true);
    // No `steps/` files because results was empty.
    const stepFiles = [...storage.files.keys()].filter((k) => k.startsWith('jobs/child-2/steps/'));
    expect(stepFiles).toHaveLength(0);
  });

  it('treats null override values as removals from context.input', async () => {
    // Null-as-delete semantic lets callers wipe a field instead of merging.
    // E.g. `endCard: null` → drop the end card entirely.
    await copyJobContext({
      sourceJobId: 'src-1',
      targetJobId: 'child-1',
      storage,
      contextOverrides: { endCard: null },
    });

    const tgt = JSON.parse(storage.files.get('jobs/child-1/context.json')!.toString());
    expect(tgt.input.endCard).toBeNull();
  });
});
