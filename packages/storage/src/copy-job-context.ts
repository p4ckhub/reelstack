/**
 * Clone a pipeline-context tree from one job id to another.
 *
 * Used by the resume API's fork flow: a child ReelJob inherits the
 * source's `jobs/{sourceId}/context.json` + `jobs/{sourceId}/steps/*.json`
 * (cached step outputs — workflow JSON, generated script, voiceover URL,
 * etc.) so the new job can resume from a chosen step without re-running
 * the upstream pipeline.
 *
 * `contextOverrides` is deep-merged into `context.input` before writing
 * the target's `context.json`. The pipeline engine's `loadContext` reads
 * `input` to feed orchestrator step builders, so overriding here is what
 * lets the resumed render pick up a new endCard / captionStyle / etc.
 *
 * Step results are copied verbatim — they're cache outputs, immutable.
 */
import type { StorageAdapter } from '@reelstack/types';

interface CopyJobContextInput {
  sourceJobId: string;
  targetJobId: string;
  storage: StorageAdapter;
  /** Deep-merged into `context.input`. `null` values clear the key. */
  contextOverrides?: Record<string, unknown>;
}

function deepMerge(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    // null = delete-the-key intent. Callers that need an actual `null`
    // value in input can wrap it (no current callsite does).
    if (value === null) {
      out[key] = null;
      continue;
    }
    const baseValue = out[key];
    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseValue !== null &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      out[key] = deepMerge(baseValue as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function copyJobContext(input: CopyJobContextInput): Promise<void> {
  const { sourceJobId, targetJobId, storage, contextOverrides } = input;

  const srcContextBuf = await storage.download(`jobs/${sourceJobId}/context.json`);
  const srcContext = JSON.parse(srcContextBuf.toString()) as {
    jobId?: string;
    input?: Record<string, unknown>;
    results?: Record<string, unknown>;
  };

  const mergedInput =
    contextOverrides && srcContext.input
      ? deepMerge(srcContext.input, contextOverrides)
      : (srcContext.input ?? {});

  const tgtContext = {
    ...srcContext,
    jobId: targetJobId,
    input: mergedInput,
  };

  await storage.upload(Buffer.from(JSON.stringify(tgtContext)), `jobs/${targetJobId}/context.json`);

  // Copy each step output. context.results keys ARE the step IDs, so we
  // don't need a list-objects API on StorageAdapter — the context tells
  // us what files exist under `jobs/{src}/steps/`.
  const stepIds = Object.keys(srcContext.results ?? {});
  for (const stepId of stepIds) {
    const stepBuf = await storage.download(`jobs/${sourceJobId}/steps/${stepId}.json`);
    await storage.upload(stepBuf, `jobs/${targetJobId}/steps/${stepId}.json`);
  }
}
