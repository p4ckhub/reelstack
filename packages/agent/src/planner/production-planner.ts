import type {
  ToolManifest,
  ProductionPlan,
  ShotPlan,
  EffectPlan,
  UserAsset,
  ZoomSegmentPlan,
  LowerThirdPlan,
  CounterPlan,
  HighlightPlan,
  CtaPlan,
} from '../types';
import { buildPlannerPrompt, buildComposerPrompt, buildRevisionPrompt } from './prompt-builder';
import { TRANSITION_TYPES, CAPTION_PROPERTY_CATALOG } from '@reelstack/remotion/catalog';
import type { MontageProfileEntry } from '@reelstack/remotion/catalog';
import { PlanningError } from '../errors';
import { detectProvider, callLLMWithSystem } from '../llm';
import type { LLMProvider } from '../llm';
import { createLogger } from '@reelstack/logger';

const log = createLogger('production-planner');

export interface PlannerInput {
  readonly script: string;
  readonly durationEstimate: number;
  readonly style: 'dynamic' | 'calm' | 'cinematic' | 'educational';
  readonly toolManifest: ToolManifest;
  /** Pre-set primary video (user recording) */
  readonly primaryVideoUrl?: string;
  readonly layout?:
    | 'fullscreen'
    | 'split-screen'
    | 'picture-in-picture'
    | 'anchor-bottom'
    | 'hybrid-anchor'
    | 'comparison-split';
  /** Timestamped sentence breakdown from transcription (so LLM knows EXACTLY when each sentence is spoken) */
  readonly timingReference?: string;
  /** Montage profile for per-profile director rules, pacing, SFX, transitions */
  readonly montageProfile?: MontageProfileEntry;
}

// detectProvider is now imported from ../llm

/**
 * Uses an LLM to generate a ProductionPlan from script + available tools.
 * Falls back to a simple rule-based plan if no AI API key is configured.
 *
 * Provider priority: ANTHROPIC_API_KEY > OPENROUTER_API_KEY > OPENAI_API_KEY
 * Model override: PLANNER_MODEL env var (provider-specific format)
 *   - Anthropic:   claude-sonnet-4-6 (default)
 *   - OpenRouter:  anthropic/claude-sonnet-4-6 (default) — any model from openrouter.ai/models
 *   - OpenAI:      gpt-4o (default)
 */
export async function planProduction(input: PlannerInput): Promise<ProductionPlan> {
  const provider = detectProvider();

  if (!provider) {
    log.info('No AI API key, using rule-based planner');
    return ruleBasedPlan(input);
  }

  const systemPrompt = buildPlannerPrompt(input.toolManifest, input.montageProfile);
  const userMessage = buildUserMessage(input);

  try {
    const raw = await callLLMWithSystem(provider, systemPrompt, userMessage);
    return parseResponse(raw, input);
  } catch (err) {
    log.warn({ err }, 'AI planner failed, falling back to rules');
    return ruleBasedPlan(input);
  }
}

export interface RevisePlanInput {
  readonly originalPlan: ProductionPlan;
  readonly directorNotes: string;
  readonly script: string;
  readonly durationEstimate: number;
  readonly style?: string;
  readonly toolManifest: ToolManifest;
}

/**
 * Revises an existing ProductionPlan based on director feedback.
 * Sends the current plan + notes to the LLM with a revision-specific prompt
 * and returns an updated plan.
 * Falls back to returning the original plan unchanged if no AI API key is available.
 */
export async function revisePlan(input: RevisePlanInput): Promise<ProductionPlan> {
  const provider = detectProvider();

  if (!provider) {
    log.info('No AI API key, returning plan unchanged');
    return input.originalPlan;
  }

  const systemPrompt = buildRevisionPrompt(
    input.originalPlan,
    input.directorNotes,
    input.toolManifest
  );
  const userMessage = buildReviseUserMessage(input);

  try {
    const raw = await callLLMWithSystem(provider, systemPrompt, userMessage);
    return parseResponse(raw, {
      script: input.script,
      durationEstimate: input.durationEstimate,
      style: (input.style as PlannerInput['style']) ?? 'dynamic',
      toolManifest: input.toolManifest,
    });
  } catch (err) {
    log.warn({ err }, 'AI revision failed, returning original plan');
    return input.originalPlan;
  }
}

function buildReviseUserMessage(input: RevisePlanInput): string {
  const parts = [
    `Revise the production plan for this ${input.durationEstimate.toFixed(0)}s video.`,
    `\nScript:\n<script>\n${input.script}\n</script>`,
    input.style ? `\nStyle: ${input.style}` : '',
    '\nReturn only the revised JSON production plan, no explanation outside the JSON.',
  ];
  return parts.filter(Boolean).join('\n');
}

export interface ComposerInput {
  readonly script: string;
  readonly durationEstimate: number;
  readonly style: 'dynamic' | 'calm' | 'cinematic' | 'educational';
  readonly assets: readonly UserAsset[];
  readonly layout?:
    | 'fullscreen'
    | 'split-screen'
    | 'picture-in-picture'
    | 'anchor-bottom'
    | 'hybrid-anchor'
    | 'comparison-split';
  readonly directorNotes?: string;
  /** Timestamped sentence breakdown from transcription (so LLM knows EXACTLY when each sentence is spoken) */
  readonly timingReference?: string;
}

/**
 * Uses an LLM to compose a ProductionPlan from script + user-provided assets.
 * No tool discovery needed — all materials are pre-existing.
 */
export async function planComposition(input: ComposerInput): Promise<ProductionPlan> {
  const provider = detectProvider();

  if (!provider) {
    log.info('No AI API key, using rule-based composer');
    return ruleBasedCompose(input);
  }
  const systemPrompt = buildComposerPrompt(input.assets);
  const userMessage = buildComposerUserMessage(input);

  try {
    const raw = await callLLMWithSystem(provider, systemPrompt, userMessage);

    const plan = parseResponse(raw, {
      script: input.script,
      durationEstimate: input.durationEstimate,
      style: input.style,
      toolManifest: { tools: [], summary: '' },
      layout: input.layout,
    });

    // Resolve asset IDs to actual URLs in the plan
    return resolveAssetUrls(plan, input.assets);
  } catch (err) {
    log.warn({ err }, 'AI composer failed, falling back to rules');
    return ruleBasedCompose(input);
  }
}

function buildComposerUserMessage(input: ComposerInput): string {
  const parts = [
    `Compose a ${input.durationEstimate.toFixed(0)}s video from the provided materials.`,
    `\nScript:\n<script>\n${input.script}\n</script>`,
    `\nStyle: ${input.style}`,
    `Duration estimate: ${input.durationEstimate.toFixed(1)}s`,
    `\nAvailable materials: ${input.assets.map((a) => `"${a.id}" (${a.description})`).join(', ')}`,
  ];

  if (input.layout) {
    parts.push(`\nRequested layout: ${input.layout}`);
  }

  if (input.directorNotes) {
    parts.push(`\nDirector notes: ${input.directorNotes.substring(0, 2000)}`);
  }

  if (input.timingReference) {
    parts.push(
      `\n<timing>\nEXACT SPEECH TIMING from transcription — use these timestamps for all visual elements:\n${input.timingReference}\n</timing>`
    );
  }

  parts.push('\nReturn only the JSON production plan, no explanation outside the JSON.');
  return parts.join('\n');
}

/**
 * Resolve asset IDs in the plan to actual URLs.
 * The LLM uses asset IDs (e.g. "dashboard-screenshot") in searchQuery fields.
 * We need to map those to real URLs.
 */
function resolveAssetUrls(plan: ProductionPlan, assets: readonly UserAsset[]): ProductionPlan {
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  // Resolve primarySource URL if it's an asset ID
  let primarySource = plan.primarySource;
  if (primarySource.type === 'user-recording') {
    const asset = assetMap.get(primarySource.url);
    if (asset) {
      primarySource = { type: 'user-recording', url: asset.url };
    }
  }

  // Resolve B-roll searchQuery (asset ID) to actual URL — the asset generator
  // will skip these since they're user-upload type, but the assembler needs
  // to find them by shot ID in the asset map. We'll handle this in produceComposition.
  return { ...plan, primarySource };
}

/**
 * Rule-based composition when no AI API key available.
 * Interleaves primary asset with other materials.
 */
function ruleBasedCompose(input: ComposerInput): ProductionPlan {
  const { script, durationEstimate, assets } = input;

  const primary = assets.find((a) => a.isPrimary) ?? assets.find((a) => a.type === 'video');
  const bRollAssets = assets.filter((a) => a !== primary);

  const primarySource: ProductionPlan['primarySource'] = primary
    ? { type: 'user-recording', url: primary.url }
    : { type: 'none' };

  const sentences = script.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const segmentDuration = durationEstimate / Math.max(sentences.length, 1);

  const shots: ShotPlan[] = sentences.map((sentence, i) => {
    const startTime = i * segmentDuration;
    const endTime = Math.min((i + 1) * segmentDuration, durationEstimate);

    // Alternate: primary → b-roll material → primary → b-roll...
    if (i % 2 === 1 && bRollAssets.length > 0) {
      const bRoll = bRollAssets[Math.floor((i / 2) % bRollAssets.length)];
      return {
        id: `shot-${i + 1}`,
        startTime,
        endTime,
        scriptSegment: sentence.trim(),
        visual: { type: 'b-roll' as const, searchQuery: bRoll.id, toolId: 'user-upload' },
        transition: { type: 'crossfade', durationMs: 400 },
        reason: `Show: ${bRoll.description}`,
      };
    }

    return {
      id: `shot-${i + 1}`,
      startTime,
      endTime,
      scriptSegment: sentence.trim(),
      visual: primary
        ? { type: 'primary' as const }
        : {
            type: 'text-card' as const,
            headline: sentence.trim().split(' ').slice(0, 5).join(' '),
            background: '#1a1a2e',
          },
      transition: { type: 'crossfade', durationMs: 400 },
      reason: `Rule-based: segment ${i + 1}`,
    };
  });

  const effects: EffectPlan[] = [];
  const style = input.style ?? 'educational';
  if (style === 'dynamic' || style === 'cinematic') {
    effects.push({
      type: 'text-emphasis',
      startTime: 0,
      endTime: 1.5,
      config: {
        text: sentences[0]?.trim().split(' ').slice(0, 3).join(' ').toUpperCase() ?? 'WATCH THIS',
        fontSize: 80,
        fontColor: '#FFD700',
        position: 'center',
        entrance: 'pop',
        exit: 'fade',
      },
      reason: 'Hook emphasis',
    });
  }

  return {
    primarySource,
    shots,
    effects,
    zoomSegments: [],
    lowerThirds: [],
    counters: [],
    highlights: [],
    ctaSegments: [],
    layout: input.layout ?? 'fullscreen',
    reasoning: 'Rule-based composition (no AI API key configured)',
  };
}

function buildUserMessage(input: PlannerInput): string {
  const parts = [
    `Create a production plan for this ${input.durationEstimate.toFixed(0)}s video.`,
    `\nScript:\n<script>\n${input.script}\n</script>`,
    `\nStyle: ${input.style}`,
    `Duration: ${input.durationEstimate.toFixed(1)}s`,
  ];

  if (input.timingReference) {
    parts.push(
      `\nEXACT SPEECH TIMING (from audio transcription - use these timestamps for shot and effect timing!):\n<timing>\n${input.timingReference}\n</timing>`
    );
  }

  if (input.primaryVideoUrl) {
    parts.push(
      `\nUser provided their own video recording as primary source: "${input.primaryVideoUrl}"`
    );
    parts.push('Do NOT generate an avatar. Use "user-recording" as primarySource.');
  }

  if (input.layout) {
    parts.push(`\nRequested layout: ${input.layout}`);
  }

  parts.push('\nReturn only the JSON production plan, no explanation outside the JSON.');
  return parts.join('\n');
}

// LLM call functions (callLLMWithSystem, detectProvider) are now in ../llm.ts

function parseResponse(text: string, input: PlannerInput): ProductionPlan {
  // Try direct JSON parse first, then extract from markdown
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) throw new PlanningError('No JSON found in planner response');
    parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new PlanningError('Response is not a valid JSON object');
  }

  // Build dynamic allowed tool sets from available tools in manifest
  const availableToolIds = input.toolManifest.tools.filter((t) => t.available).map((t) => t.id);

  const primarySource = parsePrimarySource(parsed.primarySource, input, availableToolIds);

  // Validate shots with bounds checking
  const MAX_SHOTS = 50;
  const truncStr = (v: unknown, max: number) => (typeof v === 'string' ? v.substring(0, max) : '');

  const validShots = ((parsed.shots as unknown[]) ?? [])
    .slice(0, MAX_SHOTS)
    .filter((s: unknown): s is Record<string, unknown> => {
      if (typeof s !== 'object' || s === null) return false;
      const obj = s as Record<string, unknown>;
      return (
        typeof obj.startTime === 'number' &&
        typeof obj.endTime === 'number' &&
        obj.startTime >= 0 &&
        obj.endTime <= 3600 &&
        obj.endTime > obj.startTime &&
        !!obj.visual
      );
    });

  const shots: ShotPlan[] = validShots.map((s, i) => {
    const visual = s.visual as Record<string, unknown>;
    return {
      id: truncStr(s.id, 64) || `shot-${i + 1}`,
      startTime: s.startTime as number,
      endTime: s.endTime as number,
      scriptSegment: truncStr(s.scriptSegment, 1000),
      visual: sanitizeVisual(visual, availableToolIds),
      transition: sanitizeTransition(s.transition),
      reason: truncStr(s.reason, 200),
    };
  });

  // Validate effects with bounds checking
  const MAX_EFFECTS = 30;
  const validEffects = ((parsed.effects as unknown[]) ?? [])
    .slice(0, MAX_EFFECTS)
    .filter((e: unknown): e is Record<string, unknown> => {
      if (typeof e !== 'object' || e === null) return false;
      const obj = e as Record<string, unknown>;
      return (
        typeof obj.type === 'string' &&
        typeof obj.startTime === 'number' &&
        typeof obj.endTime === 'number' &&
        obj.startTime >= 0 &&
        obj.endTime <= 3600
      );
    });

  const effects: EffectPlan[] = validEffects.map((e) => ({
    type: (e.type as string).substring(0, 64),
    startTime: e.startTime as number,
    endTime: e.endTime as number,
    config: sanitizeConfig(e.config),
    reason: typeof e.reason === 'string' ? e.reason.substring(0, 200) : '',
  }));

  // Parse composition segments
  const zoomSegments = parseZoomSegments(parsed.zoomSegments);
  const lowerThirds = parseLowerThirds(parsed.lowerThirds);
  const counters = parseCounters(parsed.counters);
  const highlights = parseHighlights(parsed.highlights);
  const ctaSegments = parseCtaSegments(parsed.ctaSegments);

  const VALID_LAYOUTS = [
    'fullscreen',
    'split-screen',
    'picture-in-picture',
    'anchor-bottom',
    'hybrid-anchor',
    'comparison-split',
  ] as const;
  const rawLayout = parsed.layout as string | undefined;
  const layout =
    rawLayout && (VALID_LAYOUTS as readonly string[]).includes(rawLayout)
      ? (rawLayout as ProductionPlan['layout'])
      : (input.layout ?? 'fullscreen');

  const plan: ProductionPlan = {
    primarySource,
    shots,
    effects,
    zoomSegments,
    lowerThirds,
    counters,
    highlights,
    ctaSegments,
    layout,
    captionStyle: sanitizeCaptionStyle(parsed.captionStyle),
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
  };

  return enforceToolPreferences(plan, availableToolIds);
}

function parsePrimarySource(
  raw: unknown,
  input: PlannerInput,
  availableToolIds: string[]
): ProductionPlan['primarySource'] {
  // If user provided video, force user-recording regardless of LLM output
  if (input.primaryVideoUrl) {
    if (!isPublicUrl(input.primaryVideoUrl)) {
      log.warn({ url: input.primaryVideoUrl }, 'Blocked non-public primaryVideoUrl');
      return { type: 'none' };
    }
    return { type: 'user-recording', url: input.primaryVideoUrl };
  }

  if (!raw || typeof raw !== 'object') return { type: 'none' };
  const obj = raw as Record<string, unknown>;

  const truncStr = (v: unknown, max: number) => (typeof v === 'string' ? v.substring(0, max) : '');
  const avatarTools = availableToolIds.filter((id) => id.startsWith('heygen') || id === 'heygen');
  const videoTools = availableToolIds.filter(
    (id) =>
      !id.startsWith('flux') &&
      !id.startsWith('nanobanana') &&
      !id.startsWith('midjourney') &&
      !id.startsWith('ideogram') &&
      !id.startsWith('recraft') &&
      !id.startsWith('sd35') &&
      !id.startsWith('seedream') &&
      !id.startsWith('imagen') &&
      id !== 'user-upload'
  );
  const fallbackPrimaryVideo = videoTools[0] ?? availableToolIds[0] ?? 'none';

  switch (obj.type) {
    case 'avatar': {
      const toolId = availableToolIds.includes(obj.toolId as string)
        ? (obj.toolId as string)
        : (avatarTools[0] ?? fallbackPrimaryVideo);
      return {
        type: 'avatar',
        toolId,
        script: truncStr(obj.script, 5000) || input.script.substring(0, 5000),
        voice: typeof obj.voice === 'string' ? obj.voice.substring(0, 100) : undefined,
        avatarId: typeof obj.avatarId === 'string' ? obj.avatarId.substring(0, 100) : undefined,
      };
    }
    case 'user-recording': {
      const url = typeof obj.url === 'string' ? obj.url : '';
      if (!url) return { type: 'none' };
      // Accept asset IDs (short strings without ://) — resolveAssetUrls will map them later.
      // Only block full URLs that aren't public.
      if (url.includes('://') && !isPublicUrl(url)) {
        log.warn({ url }, 'Blocked non-public LLM-returned user-recording URL');
        return { type: 'none' };
      }
      return { type: 'user-recording', url };
    }
    case 'ai-video': {
      const toolId = availableToolIds.includes(obj.toolId as string)
        ? (obj.toolId as string)
        : fallbackPrimaryVideo;
      return {
        type: 'ai-video',
        toolId,
        prompt: truncStr(obj.prompt, 500),
      };
    }
    default:
      return { type: 'none' };
  }
}

/**
 * Simple rule-based planner when no AI API is available.
 */
function ruleBasedPlan(input: PlannerInput): ProductionPlan {
  const { script, durationEstimate, style, primaryVideoUrl } = input;

  const primarySource: ProductionPlan['primarySource'] =
    primaryVideoUrl && isPublicUrl(primaryVideoUrl)
      ? { type: 'user-recording', url: primaryVideoUrl }
      : { type: 'none' };

  // Split script into roughly equal segments
  const sentences = script.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const segmentDuration = durationEstimate / Math.max(sentences.length, 1);

  const shots: ShotPlan[] = sentences.map((sentence, i) => {
    const startTime = i * segmentDuration;
    const endTime = Math.min((i + 1) * segmentDuration, durationEstimate);
    const isOdd = i % 2 === 1;

    // Alternate between primary and text-card (no pexels in rule-based fallback)
    const visual: ShotPlan['visual'] =
      primarySource.type === 'none'
        ? {
            type: 'text-card',
            headline: sentence.trim().split(' ').slice(0, 5).join(' '),
            background: isOdd ? '#2d1b69' : '#1a1a2e',
          }
        : isOdd
          ? {
              type: 'text-card',
              headline: sentence.trim().split(' ').slice(0, 5).join(' '),
              background: '#1a1a2e',
            }
          : { type: 'primary' };

    return {
      id: `shot-${i + 1}`,
      startTime,
      endTime,
      scriptSegment: sentence.trim(),
      visual,
      transition: { type: 'crossfade', durationMs: 400 },
      reason: `Rule-based: segment ${i + 1}`,
    };
  });

  // Basic effects based on style
  const effects: EffectPlan[] = [];

  if (style === 'dynamic' || style === 'cinematic') {
    // Hook text
    effects.push({
      type: 'text-emphasis',
      startTime: 0,
      endTime: 1.5,
      config: {
        text: sentences[0]?.trim().split(' ').slice(0, 3).join(' ').toUpperCase() ?? 'WATCH THIS',
        fontSize: 80,
        fontColor: '#FFD700',
        position: 'center',
        entrance: 'pop',
        exit: 'fade',
      },
      reason: 'Hook emphasis',
    });
  }

  if (style === 'dynamic' && durationEstimate > 10) {
    effects.push({
      type: 'emoji-popup',
      startTime: durationEstimate * 0.4,
      endTime: durationEstimate * 0.4 + 1.5,
      config: {
        emoji: '\uD83D\uDD25',
        position: { x: 80, y: 20 },
        size: 90,
        entrance: 'bounce',
        exit: 'fade',
      },
      reason: 'Mid-video engagement',
    });
  }

  return {
    primarySource,
    shots,
    effects,
    zoomSegments: [],
    lowerThirds: [],
    counters: [],
    highlights: [],
    ctaSegments: [],
    layout: input.layout ?? 'fullscreen',
    reasoning: 'Rule-based plan (no AI API key configured)',
  };
}

// Derive from catalog + graceful aliases for LLM typos
const VALID_TRANSITIONS = [...TRANSITION_TYPES, 'cut', 'fade'];

function sanitizeTransition(raw: unknown): ShotPlan['transition'] {
  const fallback = { type: 'crossfade', durationMs: 400 };
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;
  const type =
    typeof obj.type === 'string' && VALID_TRANSITIONS.includes(obj.type) ? obj.type : 'crossfade';
  const durationMs =
    typeof obj.durationMs === 'number' ? Math.max(0, Math.min(obj.durationMs, 5000)) : 400;
  return { type, durationMs };
}

// Derive from catalog + extra keys that SubtitleStyle has but prompt doesn't mention
const ALLOWED_CAPTION_KEYS = new Set([
  ...CAPTION_PROPERTY_CATALOG.map((p) => p.key),
  // Extra SubtitleStyle keys not in catalog (less common, but valid)
  'fontStyle',
  'shadowColor',
  'alignment',
  'lineHeight',
  'padding',
  'upcomingColor',
  'pillPadding',
]);

/** Sanitize effect config — flatten to max 2 levels deep, only allow primitives and simple objects */
function sanitizeConfig(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const MAX_KEYS = 20;
  let count = 0;
  for (const key of Object.keys(obj)) {
    if (count >= MAX_KEYS) break;
    const val = obj[key];
    if (typeof val === 'string') {
      result[key] = sanitizeCssValue(val);
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      result[key] = val;
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      // Allow one level of nesting (e.g., position: {x, y})
      const nested: Record<string, unknown> = {};
      for (const [nk, nv] of Object.entries(val as Record<string, unknown>)) {
        if (typeof nv === 'string' || typeof nv === 'number' || typeof nv === 'boolean') {
          nested[nk] = typeof nv === 'string' ? nv.substring(0, 100) : nv;
        }
      }
      result[key] = nested;
    } else if (Array.isArray(val)) {
      // Allow arrays of primitives/simple objects (e.g., counter segments)
      result[key] = val
        .slice(0, 20)
        .filter(
          (v) =>
            typeof v === 'string' ||
            typeof v === 'number' ||
            typeof v === 'boolean' ||
            (v && typeof v === 'object' && !Array.isArray(v))
        );
    }
    count++;
  }
  return result;
}

/** Strip CSS injection vectors from string values */
function sanitizeCssValue(val: string): string {
  // Remove dangerous CSS patterns: url(), expression(), -moz-binding, behavior, @import, data:, backslash escapes
  const stripped = val
    .replace(/url\s*\(/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/-moz-binding/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/@import/gi, '')
    .replace(/data\s*:/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/\\[0-9a-f]/gi, '') // unicode escapes
    .replace(/[{}]/g, ''); // block breakout
  return stripped.substring(0, 100);
}

function sanitizeCaptionStyle(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_CAPTION_KEYS.has(key)) continue;
    const val = obj[key];
    // Only allow primitives (string, number, boolean)
    if (typeof val === 'string') {
      result[key] = sanitizeCssValue(val);
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      result[key] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Sanitize visual from LLM output - truncate strings, validate tool IDs */
function sanitizeVisual(
  v: Record<string, unknown>,
  availableToolIds: string[]
): ShotPlan['visual'] {
  const truncStr = (val: unknown, max: number) =>
    typeof val === 'string' ? val.substring(0, max) : '';
  // Derive fallbacks from what's actually available — prefer AI tools over stock footage
  const fallbackBroll =
    availableToolIds.find((id) => id.startsWith('user-upload')) ??
    availableToolIds.find((id) => id !== 'pexels') ??
    availableToolIds[0] ??
    'user-upload';
  const imageTools = availableToolIds.filter(
    (id) =>
      id.startsWith('flux') ||
      id.startsWith('nanobanana') ||
      id.startsWith('midjourney') ||
      id.startsWith('ideogram') ||
      id.startsWith('recraft') ||
      id.startsWith('sd35') ||
      id.startsWith('seedream') ||
      id.startsWith('imagen') ||
      id.startsWith('qwen-image')
  );
  const videoTools = availableToolIds.filter(
    (id) => !imageTools.includes(id) && id !== 'user-upload' && id !== 'pexels'
  );
  const fallbackVideo = videoTools[0] ?? availableToolIds[0] ?? 'user-upload';
  const fallbackImage = imageTools[0] ?? availableToolIds[0] ?? 'user-upload';

  switch (v.type) {
    case 'primary':
      return { type: 'primary' };
    case 'b-roll': {
      const toolId = availableToolIds.includes(v.toolId as string)
        ? (v.toolId as string)
        : fallbackBroll;
      return { type: 'b-roll', searchQuery: truncStr(v.searchQuery, 100), toolId };
    }
    case 'ai-video': {
      const toolId = availableToolIds.includes(v.toolId as string)
        ? (v.toolId as string)
        : fallbackVideo;
      return { type: 'ai-video', prompt: truncStr(v.prompt, 500), toolId };
    }
    case 'ai-image': {
      const toolId = availableToolIds.includes(v.toolId as string)
        ? (v.toolId as string)
        : fallbackImage;
      return { type: 'ai-image', prompt: truncStr(v.prompt, 500), toolId };
    }
    case 'text-card': {
      // Validate background is a safe CSS color (hex, rgb, named) — no url(), expression(), etc.
      const bg = truncStr(v.background, 20);
      const safeBg = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgb\(\d+,\s*\d+,\s*\d+\))$/.test(bg)
        ? bg
        : '#1a1a2e';
      return { type: 'text-card', headline: truncStr(v.headline, 200), background: safeBg };
    }
    default:
      return { type: 'primary' };
  }
}

// ── Segment parsers ─────────────────────────────────────────

function parseTimedArray(raw: unknown, maxItems: number): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, maxItems).filter((item): item is Record<string, unknown> => {
    if (typeof item !== 'object' || item === null) return false;
    const obj = item as Record<string, unknown>;
    return (
      typeof obj.startTime === 'number' &&
      typeof obj.endTime === 'number' &&
      obj.startTime >= 0 &&
      obj.endTime <= 3600
    );
  });
}

function parseZoomSegments(raw: unknown): ZoomSegmentPlan[] {
  return parseTimedArray(raw, 20).map((z) => ({
    startTime: z.startTime as number,
    endTime: z.endTime as number,
    scale: typeof z.scale === 'number' ? Math.max(1, Math.min(3, z.scale)) : 1.5,
    focusPoint:
      z.focusPoint && typeof z.focusPoint === 'object'
        ? {
            x: Number((z.focusPoint as Record<string, unknown>).x) || 50,
            y: Number((z.focusPoint as Record<string, unknown>).y) || 50,
          }
        : { x: 50, y: 50 },
    easing: z.easing === 'smooth' ? ('smooth' as const) : ('spring' as const),
  }));
}

function parseLowerThirds(raw: unknown): LowerThirdPlan[] {
  return parseTimedArray(raw, 10)
    .filter((l) => typeof l.title === 'string')
    .map((l) => ({
      startTime: l.startTime as number,
      endTime: l.endTime as number,
      title: (l.title as string).substring(0, 100),
      subtitle: typeof l.subtitle === 'string' ? l.subtitle.substring(0, 100) : undefined,
      backgroundColor:
        typeof l.backgroundColor === 'string' ? sanitizeCssValue(l.backgroundColor) : undefined,
      textColor: typeof l.textColor === 'string' ? sanitizeCssValue(l.textColor) : undefined,
      accentColor: typeof l.accentColor === 'string' ? sanitizeCssValue(l.accentColor) : undefined,
      position: l.position === 'center' ? ('center' as const) : ('left' as const),
    }));
}

function parseCounters(raw: unknown): CounterPlan[] {
  return parseTimedArray(raw, 10)
    .filter((c) => typeof c.value === 'number')
    .map((c) => ({
      startTime: c.startTime as number,
      endTime: c.endTime as number,
      value: c.value as number,
      prefix: typeof c.prefix === 'string' ? c.prefix.substring(0, 10) : undefined,
      suffix: typeof c.suffix === 'string' ? c.suffix.substring(0, 10) : undefined,
      format: c.format === 'abbreviated' ? ('abbreviated' as const) : ('full' as const),
      textColor: typeof c.textColor === 'string' ? sanitizeCssValue(c.textColor) : undefined,
      fontSize:
        typeof c.fontSize === 'number' ? Math.max(24, Math.min(200, c.fontSize)) : undefined,
      position: ['center', 'top', 'bottom'].includes(c.position as string)
        ? (c.position as 'center' | 'top' | 'bottom')
        : undefined,
    }));
}

function parseHighlights(raw: unknown): HighlightPlan[] {
  return parseTimedArray(raw, 10).map((h) => ({
    startTime: h.startTime as number,
    endTime: h.endTime as number,
    x: typeof h.x === 'number' ? Math.max(0, Math.min(100, h.x)) : 0,
    y: typeof h.y === 'number' ? Math.max(0, Math.min(100, h.y)) : 0,
    width: typeof h.width === 'number' ? Math.max(1, Math.min(100, h.width)) : 20,
    height: typeof h.height === 'number' ? Math.max(1, Math.min(100, h.height)) : 20,
    color: typeof h.color === 'string' ? sanitizeCssValue(h.color) : undefined,
    borderWidth:
      typeof h.borderWidth === 'number' ? Math.max(1, Math.min(20, h.borderWidth)) : undefined,
    label: typeof h.label === 'string' ? h.label.substring(0, 50) : undefined,
    glow: typeof h.glow === 'boolean' ? h.glow : undefined,
  }));
}

function parseCtaSegments(raw: unknown): CtaPlan[] {
  return parseTimedArray(raw, 5)
    .filter((c) => typeof c.text === 'string')
    .map((c) => ({
      startTime: c.startTime as number,
      endTime: c.endTime as number,
      text: (c.text as string).substring(0, 100),
      style: ['button', 'banner', 'pill'].includes(c.style as string)
        ? (c.style as 'button' | 'banner' | 'pill')
        : undefined,
      backgroundColor:
        typeof c.backgroundColor === 'string' ? sanitizeCssValue(c.backgroundColor) : undefined,
      textColor: typeof c.textColor === 'string' ? sanitizeCssValue(c.textColor) : undefined,
      position: ['bottom', 'center', 'top'].includes(c.position as string)
        ? (c.position as 'bottom' | 'center' | 'top')
        : undefined,
    }));
}

/**
 * Post-process plan to enforce mandatory tool selection order.
 * LLM often ignores tool preference instructions, so we fix it programmatically.
 *
 * AI video priority: seedance2-piapi > veo31-gemini > kling-piapi > seedance-piapi > others
 * AI image priority: nanobanana2-kie > nanobanana > flux-* > others
 */
function enforceToolPreferences(plan: ProductionPlan, availableToolIds: string[]): ProductionPlan {
  const VIDEO_PRIORITY = [
    'seedance2-piapi',
    'veo31-gemini',
    'kling-piapi',
    'seedance-piapi',
    'kling-kie',
    'wan-kie',
    'hunyuan-piapi',
    'hailuo-piapi',
    'seedance-kie',
  ];
  const IMAGE_PRIORITY = ['nanobanana2-kie', 'nanobanana', 'flux-kie', 'flux-piapi'];

  const bestVideo = VIDEO_PRIORITY.find((id) => availableToolIds.includes(id));
  const bestImage = IMAGE_PRIORITY.find((id) => availableToolIds.includes(id));

  if (!bestVideo && !bestImage) return plan;

  const fixedShots = plan.shots.map((shot) => {
    if (shot.visual.type === 'ai-video' && bestVideo && shot.visual.toolId !== bestVideo) {
      log.info(
        { shotId: shot.id, from: shot.visual.toolId, to: bestVideo },
        'Enforcing video tool preference'
      );
      return { ...shot, visual: { ...shot.visual, toolId: bestVideo } };
    }
    if (shot.visual.type === 'ai-image' && bestImage && shot.visual.toolId !== bestImage) {
      log.info(
        { shotId: shot.id, from: shot.visual.toolId, to: bestImage },
        'Enforcing image tool preference'
      );
      return { ...shot, visual: { ...shot.visual, toolId: bestImage } };
    }
    return shot;
  });

  // Also fix primarySource if it's ai-video
  let fixedPrimary = plan.primarySource;
  if (fixedPrimary.type === 'ai-video' && bestVideo && fixedPrimary.toolId !== bestVideo) {
    log.info(
      { from: fixedPrimary.toolId, to: bestVideo },
      'Enforcing primary video tool preference'
    );
    fixedPrimary = { ...fixedPrimary, toolId: bestVideo };
  }

  return { ...plan, shots: fixedShots, primarySource: fixedPrimary };
}

/** Validate URL is public HTTPS (not internal/private) */
export function isPublicUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http(s) — reject javascript:, data:, blob:, file:, ftp:, etc.
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // Reject credentials in URL
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    // Reject loopback and special addresses
    if (host === 'localhost' || host === '::1' || host === '0.0.0.0' || host === '[::]')
      return false;
    // Reject private IPv4 ranges
    if (host.startsWith('127.') || host.startsWith('10.') || host.startsWith('169.254.'))
      return false;
    if (
      host.startsWith('172.') &&
      parseInt(host.split('.')[1]) >= 16 &&
      parseInt(host.split('.')[1]) <= 31
    )
      return false;
    if (host.startsWith('192.168.') || host.startsWith('0.')) return false;
    // Reject IPv6 private/link-local (fe80::, fc00::, fd00::, ff00::)
    if (/^\[?f[cde]|^\[?fe80|^\[?ff/i.test(host)) return false;
    // Reject cloud metadata endpoints
    if (host === 'metadata.google.internal' || host === '169.254.169.254') return false;
    return true;
  } catch {
    return false;
  }
}
