/**
 * Shared prompt guidelines per AI model.
 * Each model has ONE canonical guideline stored as a .md file in prompts/guidelines/.
 * This module re-exports them as named constants for backward compatibility.
 *
 * Source research:
 * - Seedance: vault/brands/_shared/reference/video-prompting-seedance.md (GitHub: Emily2040/seedance-2.0)
 * - NanoBanana: vault/brands/_shared/reference/json-prompting-image-generation.md (GitHub: YouMind-OpenLab)
 * - Veo3: veo3-tool.ts (Google documentation)
 * - Kling: kling-tool.ts (community best practices)
 */
import { loadGuideline } from '../prompts/loader';

// ── VIDEO MODELS ────────────────────────────────────────────────

export const SEEDANCE_GUIDELINES = loadGuideline('seedance');
export const KLING_GUIDELINES = loadGuideline('kling');
export const VEO3_GUIDELINES = loadGuideline('veo3');
export const HAILUO_GUIDELINES = loadGuideline('hailuo');
export const RUNWAY_GUIDELINES = loadGuideline('runway');
export const HUNYUAN_GUIDELINES = loadGuideline('hunyuan');
export const WAN_GUIDELINES = loadGuideline('wan');
export const PIKA_GUIDELINES = loadGuideline('pika');
export const LTX_GUIDELINES = loadGuideline('ltx');
export const LUMA_GUIDELINES = loadGuideline('luma');
export const SORA_GUIDELINES = loadGuideline('sora');

// ── IMAGE MODELS ────────────────────────────────────────────────

export const NANOBANANA_GUIDELINES = loadGuideline('nanobanana');
export const FLUX_GUIDELINES = loadGuideline('flux');
export const IDEOGRAM_GUIDELINES = loadGuideline('ideogram');
export const RECRAFT_GUIDELINES = loadGuideline('recraft');
export const SEEDREAM_GUIDELINES = loadGuideline('seedream');
export const QWEN_IMAGE_GUIDELINES = loadGuideline('qwen-image');

// ── STOCK / OTHER ───────────────────────────────────────────────

export const PEXELS_GUIDELINES = loadGuideline('pexels');
export const HEYGEN_AGENT_GUIDELINES = loadGuideline('heygen-agent');
export const HEYGEN_GUIDELINES = loadGuideline('heygen');
