#!/usr/bin/env bun
/**
 * Director-only replay — runs the short-film director LLM with the same
 * topic as `e2e-short-film.ts` and prints the full JSON plan. Cheap way
 * to inspect what the director produced without burning FAL credits on
 * video generation.
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
loadEnv({ path: path.join(repoRoot, '.env'), override: true });

const { callLLMWithSystem, detectProvider, renderPrompt } = await import('@reelstack/agent');

const provider = detectProvider();
if (!provider) {
  console.error('✗ No LLM provider');
  process.exit(1);
}

const systemPrompt = renderPrompt('short-film-director');
const topic =
  'A weary senior developer on night shift realises the broken deploy was their own typo. They push a single-line fix, watch the green CI badge, and lean back smiling at the empty office.';
const userMessage = [
  `Topic: ${topic}`,
  `Target scene count: 4 (3-10).`,
  `Character seed: Late-30s man, short salt-and-pepper beard, wire-frame glasses, dark grey hoodie.`,
  'Return the JSON plan now.',
].join('\n');

const raw = await callLLMWithSystem(provider, systemPrompt, userMessage, {
  modelRole: 'planner',
  maxTokens: 4096,
  timeoutMs: 60_000,
  jsonMode: true,
});

const jsonMatch = raw.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.error('No JSON in response');
  console.error(raw.substring(0, 500));
  process.exit(1);
}

const plan = JSON.parse(jsonMatch[0]);
console.log(JSON.stringify(plan, null, 2));
