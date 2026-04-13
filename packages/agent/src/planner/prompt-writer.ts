/**
 * Prompt Writer - expands short shot briefs into high-quality AI prompts.
 *
 * The planner (Opus) creates shot briefs (1-2 sentences), then this module
 * calls a cheap/fast model to expand each brief into a detailed, tool-specific
 * AI prompt following the exact format guidelines for each tool.
 *
 * Uses centralized model config (see config/models.ts for defaults).
 * Enabled by default, disable with PROMPT_WRITER=false.
 */
import { createLogger } from '@reelstack/logger';
import { callLLMWithSystem, detectCheapProvider } from '../llm';
import {
  SEEDANCE_GUIDELINES,
  KLING_GUIDELINES,
  VEO3_GUIDELINES,
  NANOBANANA_GUIDELINES,
  HAILUO_GUIDELINES,
} from '../tools/prompt-guidelines';
import { loadTemplate } from '../prompts/loader';
import { renderTemplate } from '../prompts/renderer';

const log = createLogger('prompt-writer');

export interface ShotBrief {
  shotId: string;
  /** What the shot should show (1-2 sentences from planner) */
  description: string;
  /** Tool that will generate this shot */
  toolId: string;
  /** Is this image or video? */
  assetType: 'ai-image' | 'ai-video';
  /** Duration in seconds (for video) */
  durationSeconds?: number;
  /** Aspect ratio */
  aspectRatio?: '9:16' | '16:9' | '1:1';
  /** Script segment being narrated during this shot */
  scriptSegment?: string;
}

/**
 * Check if prompt writer is enabled.
 * Default: true. Set PROMPT_WRITER=false to disable.
 */
export function isPromptWriterEnabled(): boolean {
  const val = process.env.PROMPT_WRITER;
  if (val === undefined || val === '') return true;
  return val.toLowerCase() !== 'false' && val !== '0';
}

/**
 * Look up the correct prompt guidelines based on toolId.
 */
export function getGuidelinesForTool(toolId: string): string {
  const id = toolId.toLowerCase();
  if (id.includes('seedance')) return SEEDANCE_GUIDELINES;
  if (id.includes('veo')) return VEO3_GUIDELINES;
  if (id.includes('nanobanana') || id.includes('flux')) return NANOBANANA_GUIDELINES;
  if (id.includes('kling')) return KLING_GUIDELINES;
  if (id.includes('hailuo')) return HAILUO_GUIDELINES;
  // Default to Seedance guidelines (most universal for video)
  return SEEDANCE_GUIDELINES;
}

function buildSystemPrompt(toolGuidelines: string): string {
  const template = loadTemplate('prompt-writer');
  return renderTemplate(template, { toolGuidelines });
}

function buildUserMessage(brief: ShotBrief): string {
  const parts = [`Brief: ${brief.description}`];

  if (brief.assetType === 'ai-video' && brief.durationSeconds) {
    parts.push(`Duration: ${brief.durationSeconds}s`);
  }
  if (brief.aspectRatio) {
    parts.push(`Aspect ratio: ${brief.aspectRatio}`);
  }
  if (brief.scriptSegment) {
    parts.push(`Narration during this shot: "${brief.scriptSegment}"`);
  }

  parts.push(
    `\nWrite a detailed ${brief.assetType === 'ai-image' ? 'image' : 'video'} prompt for this shot. Output ONLY the prompt text.`
  );
  return parts.join('\n');
}

/**
 * Expand a shot brief into a high-quality AI prompt.
 *
 * Uses the promptWriter model role (see config/models.ts for defaults).
 * On failure, returns the original brief description as-is (graceful fallback).
 */
export async function writePrompt(brief: ShotBrief): Promise<string> {
  const provider = detectCheapProvider();
  if (!provider) {
    log.info('No OPENROUTER_API_KEY or ANTHROPIC_API_KEY, returning brief as-is');
    return brief.description;
  }

  const toolGuidelines = getGuidelinesForTool(brief.toolId);
  const systemPrompt = buildSystemPrompt(toolGuidelines);
  const userMessage = buildUserMessage(brief);

  log.info({ provider, shotId: brief.shotId }, 'Expanding shot brief into prompt');

  try {
    const text = await callLLMWithSystem(provider, systemPrompt, userMessage, {
      modelRole: 'promptWriter',
      maxTokens: 1024,
      timeoutMs: 30_000,
      jsonMode: false,
    });

    const trimmed = text.trim();
    if (!trimmed) {
      log.warn({ shotId: brief.shotId }, 'Empty response from prompt writer, returning brief');
      return brief.description;
    }

    log.info(
      { shotId: brief.shotId, promptLength: trimmed.length },
      'Shot brief expanded into prompt'
    );
    return trimmed;
  } catch (err) {
    log.warn(
      { error: String(err), shotId: brief.shotId },
      'Prompt writer failed, returning brief as-is'
    );
    return brief.description;
  }
}
