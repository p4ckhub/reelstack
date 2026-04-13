/**
 * Template and partial loader for LLM prompts.
 *
 * All prompt content is compiled into the bundle via static imports.
 * No filesystem access at runtime — works in Next.js turbopack, Docker, Lambda.
 */

// ── Templates ──────────────────────────────────────────────
import { content as plannerTpl } from './templates/planner';
import { content as composerTpl } from './templates/composer';
import { content as revisionTpl } from './templates/revision';
import { content as supervisorTpl } from './templates/supervisor';
import { content as promptWriterTpl } from './templates/prompt-writer';
import { content as scriptReviewerTpl } from './templates/script-reviewer';

// ── Partials ───────────────────────────────────────────────
import { content as rulesHook } from './partials/rules-hook';
import { content as rulesRetention } from './partials/rules-retention';
import { content as rulesNoTextRedundancy } from './partials/rules-no-text-redundancy';
import { content as rulesBroll } from './partials/rules-broll';
import { content as rulesTextDuplication } from './partials/rules-text-duplication';

// ── Guidelines (per-tool) ──────────────────────────────────
import { content as guidelineFlux } from './guidelines/flux';
import { content as guidelineHailuo } from './guidelines/hailuo';
import { content as guidelineHeygenAgent } from './guidelines/heygen-agent';
import { content as guidelineHeygen } from './guidelines/heygen';
import { content as guidelineHunyuan } from './guidelines/hunyuan';
import { content as guidelineIdeogram } from './guidelines/ideogram';
import { content as guidelineKling } from './guidelines/kling';
import { content as guidelineLtx } from './guidelines/ltx';
import { content as guidelineLuma } from './guidelines/luma';
import { content as guidelineNanobanana } from './guidelines/nanobanana';
import { content as guidelinePexels } from './guidelines/pexels';
import { content as guidelinePika } from './guidelines/pika';
import { content as guidelineQwenImage } from './guidelines/qwen-image';
import { content as guidelineRecraft } from './guidelines/recraft';
import { content as guidelineRunway } from './guidelines/runway';
import { content as guidelineSeedance } from './guidelines/seedance';
import { content as guidelineSeedream } from './guidelines/seedream';
import { content as guidelineSora } from './guidelines/sora';
import { content as guidelineVeo3 } from './guidelines/veo3';
import { content as guidelineWan } from './guidelines/wan';

// ── Registries ─────────────────────────────────────────────

const TEMPLATES: Record<string, string> = {
  planner: plannerTpl,
  composer: composerTpl,
  revision: revisionTpl,
  supervisor: supervisorTpl,
  'prompt-writer': promptWriterTpl,
  'script-reviewer': scriptReviewerTpl,
};

const PARTIALS: Record<string, string> = {
  'rules-hook': rulesHook,
  'rules-retention': rulesRetention,
  'rules-no-text-redundancy': rulesNoTextRedundancy,
  'rules-broll': rulesBroll,
  'rules-text-duplication': rulesTextDuplication,
};

const GUIDELINES: Record<string, string> = {
  flux: guidelineFlux,
  hailuo: guidelineHailuo,
  'heygen-agent': guidelineHeygenAgent,
  heygen: guidelineHeygen,
  hunyuan: guidelineHunyuan,
  ideogram: guidelineIdeogram,
  kling: guidelineKling,
  ltx: guidelineLtx,
  luma: guidelineLuma,
  nanobanana: guidelineNanobanana,
  pexels: guidelinePexels,
  pika: guidelinePika,
  'qwen-image': guidelineQwenImage,
  recraft: guidelineRecraft,
  runway: guidelineRunway,
  seedance: guidelineSeedance,
  seedream: guidelineSeedream,
  sora: guidelineSora,
  veo3: guidelineVeo3,
  wan: guidelineWan,
};

/** Load a template by name (e.g. "planner"). */
export function loadTemplate(name: string): string {
  return TEMPLATES[name] ?? '';
}

/** Load a partial by name (e.g. "rules-hook"). */
export function loadPartial(name: string): string {
  return PARTIALS[name] ?? '';
}

/** Load a guideline by name (e.g. "seedance"). */
export function loadGuideline(name: string): string {
  return GUIDELINES[name] ?? '';
}

/** Load all partials. Returns Record<name, content> for renderTemplate(). */
export function loadAllPartials(): Record<string, string> {
  return { ...PARTIALS };
}

/** No-op (compile-time imports don't need cache clearing). Kept for test compatibility. */
export function clearCache(): void {}
