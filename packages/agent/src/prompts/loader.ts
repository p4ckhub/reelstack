/// <reference path="../types/md.d.ts" />
/**
 * Template / partial / guideline loader.
 *
 * Source of truth is the markdown files in this directory tree. They are
 * pulled in as text via import attributes (`with { type: 'text' }`) so the
 * content is bundled at build time and no runtime filesystem access is
 * needed — identical reach as the old `export const content = \`...\`` TS
 * wrappers we replaced, but editable as plain markdown.
 *
 * Runtime support:
 *   • Bun (worker): text imports are native since 1.1.
 *   • Next.js turbopack: `*.md` routed through `raw-loader` in
 *     `apps/web/next.config.ts` → yields raw string.
 *   • Next.js webpack (`next build`): same config block adds a webpack
 *     rule for `.md` files.
 */

// ── Templates ──────────────────────────────────────────────
import plannerTpl from './templates/planner.md' with { type: 'text' };
import composerTpl from './templates/composer.md' with { type: 'text' };
import revisionTpl from './templates/revision.md' with { type: 'text' };
import supervisorTpl from './templates/supervisor.md' with { type: 'text' };
import promptWriterTpl from './templates/prompt-writer.md' with { type: 'text' };
import scriptReviewerTpl from './templates/script-reviewer.md' with { type: 'text' };
import scriptWriterTpl from './templates/script-writer.md' with { type: 'text' };
import shortFilmDirectorTpl from './templates/short-film-director.md' with { type: 'text' };

// ── Partials ───────────────────────────────────────────────
import rulesHook from './partials/rules-hook.md' with { type: 'text' };
import rulesRetention from './partials/rules-retention.md' with { type: 'text' };
import rulesNoTextRedundancy from './partials/rules-no-text-redundancy.md' with { type: 'text' };
import rulesBroll from './partials/rules-broll.md' with { type: 'text' };
import rulesTextDuplication from './partials/rules-text-duplication.md' with { type: 'text' };

// ── Guidelines (per-tool) ──────────────────────────────────
import guidelineFlux from './guidelines/flux.md' with { type: 'text' };
import guidelineGeminiTts from './guidelines/gemini-tts.md' with { type: 'text' };
import guidelineGptImage from './guidelines/gpt-image.md' with { type: 'text' };
import guidelineHailuo from './guidelines/hailuo.md' with { type: 'text' };
import guidelineHeygenAgent from './guidelines/heygen-agent.md' with { type: 'text' };
import guidelineHeygen from './guidelines/heygen.md' with { type: 'text' };
import guidelineHunyuan from './guidelines/hunyuan.md' with { type: 'text' };
import guidelineIdeogram from './guidelines/ideogram.md' with { type: 'text' };
import guidelineKling from './guidelines/kling.md' with { type: 'text' };
import guidelineLtx from './guidelines/ltx.md' with { type: 'text' };
import guidelineLuma from './guidelines/luma.md' with { type: 'text' };
import guidelineNanobanana from './guidelines/nanobanana.md' with { type: 'text' };
import guidelinePexels from './guidelines/pexels.md' with { type: 'text' };
import guidelinePika from './guidelines/pika.md' with { type: 'text' };
import guidelineQwenImage from './guidelines/qwen-image.md' with { type: 'text' };
import guidelineRecraft from './guidelines/recraft.md' with { type: 'text' };
import guidelineRunway from './guidelines/runway.md' with { type: 'text' };
import guidelineSeedance from './guidelines/seedance.md' with { type: 'text' };
import guidelineSeedream from './guidelines/seedream.md' with { type: 'text' };
import guidelineSora from './guidelines/sora.md' with { type: 'text' };
import guidelineVeo3 from './guidelines/veo3.md' with { type: 'text' };
import guidelineWan from './guidelines/wan.md' with { type: 'text' };

// ── Registries ─────────────────────────────────────────────

const TEMPLATES: Record<string, string> = {
  planner: plannerTpl,
  composer: composerTpl,
  revision: revisionTpl,
  supervisor: supervisorTpl,
  'prompt-writer': promptWriterTpl,
  'script-reviewer': scriptReviewerTpl,
  'script-writer': scriptWriterTpl,
  'short-film-director': shortFilmDirectorTpl,
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
  'gemini-tts': guidelineGeminiTts,
  'gpt-image': guidelineGptImage,
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
