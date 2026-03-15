/**
 * Pipeline helpers for API routes.
 *
 * Resolves the correct PipelineDefinition for a given mode.
 * Used by /steps, /retry, and /resume endpoints.
 *
 * IMPORTANT: This file runs in Next.js API context. It must NOT import
 * heavy agent modules that have side effects (path.resolve, fs, etc.).
 * Use lightweight step ID lists instead of full pipeline definitions.
 */
import type { PipelineDefinition, StepDefinition } from '@reelstack/agent/pipeline';

type LightStep = Pick<StepDefinition, 'id' | 'name' | 'dependsOn'>;

/** Lightweight step definitions (no execute functions -- just structure for status queries) */
const GENERATE_STEPS: LightStep[] = [
  { id: 'script-review', name: 'Script Review', dependsOn: [] },
  { id: 'discover-tools', name: 'Discover Tools', dependsOn: ['script-review'] },
  { id: 'tts', name: 'Text-to-Speech', dependsOn: ['script-review'] },
  { id: 'whisper-timing', name: 'Transcription & Timing', dependsOn: ['tts', 'discover-tools'] },
  { id: 'plan', name: 'AI Planning', dependsOn: ['whisper-timing'] },
  { id: 'supervisor', name: 'Plan Review', dependsOn: ['plan'] },
  { id: 'prompt-expansion', name: 'Prompt Expansion', dependsOn: ['supervisor'] },
  { id: 'asset-gen', name: 'Asset Generation', dependsOn: ['prompt-expansion'] },
  { id: 'asset-persist', name: 'Asset Upload', dependsOn: ['asset-gen'] },
  { id: 'composition', name: 'Composition Assembly', dependsOn: ['asset-persist'] },
];

/** Compose mode: single-step wrapper around produceComposition() */
const COMPOSE_STEPS: LightStep[] = [
  { id: 'compose', name: 'Run Compose Orchestrator', dependsOn: [] },
];

/** Module-based modes: single-step wrapper around module.orchestrate() */
const MODULE_SINGLE_STEP: LightStep[] = [{ id: 'orchestrate', name: 'Run Module', dependsOn: [] }];

const noop = () => Promise.resolve({} as never);

function toLightweightDefinition(id: string, steps: LightStep[]): PipelineDefinition {
  return {
    id,
    name: id,
    steps: steps.map((s) => ({ ...s, execute: noop })) as StepDefinition[],
  };
}

/**
 * Resolve pipeline definition for a given mode.
 * Returns a lightweight definition (execute stubs) for status queries.
 * Real execution deps are injected by the worker.
 *
 * All modes are supported:
 * - generate: full multi-step pipeline
 * - compose: single-step wrapper
 * - modules (captions, talking-object, n8n-explainer, etc.): single-step wrapper
 */
export function resolvePipelineDefinition(mode: string): PipelineDefinition | null {
  if (mode === 'generate') return toLightweightDefinition(mode, GENERATE_STEPS);
  if (mode === 'compose') return toLightweightDefinition(mode, COMPOSE_STEPS);

  // All module modes use a single orchestrate step
  // Known modules: captions, talking-object, n8n-explainer, presenter-explainer, slideshow
  // Unknown modes also get the single-step definition (the worker validates mode existence)
  return toLightweightDefinition(mode, MODULE_SINGLE_STEP);
}
