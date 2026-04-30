/**
 * Image- and video-tool default resolver.
 *
 * Tool *availability* is decided by env keys in `discovery.ts` (e.g.
 * FAL_KEY → fal tools register). This module decides the *default
 * pick* from whatever ended up available — quality-first, with two
 * escape hatches:
 *
 *   1. Caller passes `preferredToolIds` (typically from
 *      `users.toolPreferences`) and we honor the first match.
 *   2. Ops sets `IMAGE_PROVIDER_PRIORITY` / `VIDEO_PROVIDER_PRIORITY`
 *      env vars (comma-separated) to test alternatives without code
 *      changes.
 *
 * Both knobs are advisory: a tool ID that isn't currently available
 * is silently dropped, and we always fall back to the canonical
 * priority list so a typo never disables generation entirely.
 */

export type AssetMediaType = 'image' | 'video';

/**
 * Image providers in quality-first order. Tail entries kick in only
 * when nothing better is registered.
 *
 * Top picks (April 2026):
 *   - `nanobanana2-kie` — Gemini 3.1 Flash Image via kie.ai. Best
 *     prompt-fidelity at the lowest cost; no rate limits in our tier.
 *   - `nanobanana` — direct Google Gemini Image API. Equivalent
 *     quality, slower (no kie.ai pooling).
 *   - `flux-kie` / `flux-piapi` — Flux 1.1 Pro Ultra. Used for
 *     photoreal / texture-heavy prompts where Gemini stylizes.
 *   - `gpt-image-2` / `gpt-image-1` — OpenAI's image API. Reliable
 *     fallback when Gemini is rate-limited.
 *   - `seedream-piapi` / `recraft-piapi` / `imagen-piapi` /
 *     `ideogram-piapi` — niche fallbacks (typography, illustration).
 */
export const IMAGE_TOOL_PRIORITY = [
  'nanobanana2-kie',
  'nanobanana',
  'flux-kie',
  'flux-piapi',
  'gpt-image-2',
  'gpt-image-1',
  'seedream-piapi',
  'recraft-piapi',
  'imagen-piapi',
  'ideogram-piapi',
] as const;

/**
 * Video providers in quality-first order (April 2026). Order mirrors
 * what the production-planner used to hardcode — seedance2 family
 * leads on price/quality balance for short-form. Veo 3.1 sits behind
 * because it requires VERTEX_PROJECT_ID + gcloud auth (operationally
 * heavier).
 *
 *   - `seedance2-kie` / `seedance2-fast-kie` / `seedance2-piapi` —
 *     ByteDance Seedance 2.0. Cheapest top-tier video. Fast variant
 *     trades a bit of motion fidelity for ~2× speed.
 *   - `veo31-gemini` — Veo 3.1 via Vertex AI. Best motion + native
 *     audio. Heavier setup.
 *   - `kling-piapi` / `kling-kie` — Kling 3.0 Omni. Best for
 *     talking-head / lip-sync.
 *   - `seedance-piapi` / `seedance-kie` — Seedance 1.x fallbacks.
 *   - `wan-kie` / `hunyuan-piapi` / `hailuo-piapi` — situational
 *     fallbacks (effects, anime).
 *   - `humo` — self-hosted on RunPod, cheapest path for talking-head
 *     when latency isn't critical.
 */
export const VIDEO_TOOL_PRIORITY = [
  'seedance2-kie',
  'seedance2-fast-kie',
  'seedance2-piapi',
  'veo31-gemini',
  'kling-piapi',
  'seedance-piapi',
  'kling-kie',
  'wan-kie',
  'hunyuan-piapi',
  'hailuo-piapi',
  'seedance-kie',
  'humo',
] as const;

// ── Classifier ────────────────────────────────────────────────

const IMAGE_PATTERN = /banana|flux|gpt-image|seedream|recraft|imagen|ideogram|sd35/;
const VIDEO_PATTERN = /veo|kling|seedance|wan|hunyuan|hailuo|minimax|humo|runway/;

/**
 * Classify a tool ID as image / video / null. Used by the planner to
 * apply the right priority list when enforcing user preferences. Both
 * the priority lists *and* the regex are consulted so non-listed
 * provider variants (e.g. `flux-something-new`) classify correctly.
 */
export function classifyAssetTool(toolId: string): AssetMediaType | null {
  if ((IMAGE_TOOL_PRIORITY as readonly string[]).includes(toolId)) return 'image';
  if ((VIDEO_TOOL_PRIORITY as readonly string[]).includes(toolId)) return 'video';
  if (IMAGE_PATTERN.test(toolId)) return 'image';
  if (VIDEO_PATTERN.test(toolId)) return 'video';
  return null;
}

// ── Priority list resolution ──────────────────────────────────

function parseEnvPriority(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolvePriorityList(
  base: readonly string[],
  envOverride: string | undefined
): readonly string[] {
  const override = parseEnvPriority(envOverride);
  if (override.length === 0) return base;
  // Env override fully replaces the priority chain — an op that wants
  // to test "nothing but flux-kie" should be able to do so.
  return override;
}

// ── Resolver shared between image + video ─────────────────────

interface ResolveOptions {
  preferredToolIds?: readonly string[];
  env?: NodeJS.ProcessEnv;
}

function resolveTool(
  basePriority: readonly string[],
  envKey: 'IMAGE_PROVIDER_PRIORITY' | 'VIDEO_PROVIDER_PRIORITY',
  availableToolIds: readonly string[],
  opts?: ResolveOptions
): string | null {
  const env = opts?.env ?? process.env;
  const available = new Set(availableToolIds);

  // 1. Caller-supplied preference wins when available.
  for (const pref of opts?.preferredToolIds ?? []) {
    if (available.has(pref)) return pref;
  }

  // 2. Walk the priority list (base or env-override) and pick the
  //    first available entry.
  const priority = resolvePriorityList(basePriority, env[envKey]);
  for (const id of priority) {
    if (available.has(id)) return id;
  }

  return null;
}

export function resolveDefaultImageTool(
  availableToolIds: readonly string[],
  opts?: ResolveOptions
): string | null {
  return resolveTool(IMAGE_TOOL_PRIORITY, 'IMAGE_PROVIDER_PRIORITY', availableToolIds, opts);
}

export function resolveDefaultVideoTool(
  availableToolIds: readonly string[],
  opts?: ResolveOptions
): string | null {
  return resolveTool(VIDEO_TOOL_PRIORITY, 'VIDEO_PROVIDER_PRIORITY', availableToolIds, opts);
}
