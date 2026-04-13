import type { ToolManifest, ProductionPlan, UserAsset } from '../types';
import {
  EFFECT_CATALOG,
  SEGMENT_CATALOG,
  SFX_CATALOG,
  ENTRANCE_ANIMATIONS,
  EXIT_ANIMATIONS,
  TRANSITION_TYPES,
  TRANSITION_CATALOG,
  FONT_CATALOG,
  LAYOUT_CATALOG,
  CAPTION_PROPERTY_CATALOG,
  SHOT_LAYOUT_CATALOG,
  BGM_CATALOG,
} from '@reelstack/remotion/catalog';
import { BUILT_IN_CAPTION_PRESETS } from '@reelstack/types';
import type { MontageProfileEntry } from '@reelstack/remotion/catalog';
import { buildProfileGuidelines } from './montage-profile';
import { renderTemplate } from '../prompts/renderer';
import { loadTemplate, loadAllPartials } from '../prompts/loader';

/** Shared catalog sections used by planner, revision, and composer prompts. */
function buildCatalogSections(manifest: ToolManifest) {
  const availableTools = manifest.tools.filter((t) => t.available);

  const toolSection = availableTools
    .map((t) => {
      const caps = t.capabilities
        .map(
          (c) =>
            `  - ${c.assetType}: prompt=${c.supportsPrompt}, script=${c.supportsScript}, async=${c.isAsync}, latency=~${c.estimatedLatencyMs}ms, cost=${c.costTier}`
        )
        .join('\n');
      return `### ${t.name} (id: "${t.id}")\n${caps}`;
    })
    .join('\n\n');

  const guidelinesSection = availableTools
    .filter((t) => t.promptGuidelines)
    .map((t) => `### ${t.name} (id: "${t.id}")\n${t.promptGuidelines}`)
    .join('\n\n');

  const effectSection = EFFECT_CATALOG.map((e) => {
    const sfxNote = e.defaultSfx ? ` [default SFX: "${e.defaultSfx}"]` : '';
    return `- "${e.type}": ${e.description}${sfxNote}\n  Config: ${e.config}`;
  }).join('\n');

  const sfxSection = SFX_CATALOG.map(
    (s) => `- "${s.id}": ${s.description} (~${s.durationMs}ms)`
  ).join('\n');

  const segmentSection = SEGMENT_CATALOG.map(
    (s) => `### ${s.type}\n${s.description}\nConfig: ${s.config}\nGuideline: ${s.dynamicGuideline}`
  ).join('\n\n');

  const segmentOutputExamples = SEGMENT_CATALOG.map((s) => `  "${s.type}": []`).join(',\n');

  const styleGuidelines = buildStyleGuidelines();

  const shotLayoutSection = SHOT_LAYOUT_CATALOG.map((s) => {
    let line = `- "${s.type}": ${s.description}`;
    if (s.example) line += `\n  Example: \`${s.example}\``;
    return line;
  }).join('\n');

  const bgmSection = BGM_CATALOG.map((b) => `- "${b.id}": ${b.description} (${b.bpm})`).join('\n');

  const layoutSection = LAYOUT_CATALOG.map((l) => `- "${l.type}": ${l.description}`).join('\n');

  const captionPropertySection = CAPTION_PROPERTY_CATALOG.map(
    (p) => `- ${p.key}: ${p.type} — ${p.description}`
  ).join('\n');

  const captionPresets = Object.keys(BUILT_IN_CAPTION_PRESETS).join(', ');

  return {
    toolSection,
    guidelinesSection,
    effectSection,
    sfxSection,
    segmentSection,
    segmentOutputExamples,
    styleGuidelines,
    shotLayoutSection,
    bgmSection,
    layoutSection,
    captionPropertySection,
    captionPresets,
    entranceAnimations: ENTRANCE_ANIMATIONS.join(', '),
    exitAnimations: EXIT_ANIMATIONS.join(', '),
    transitionTypes: TRANSITION_TYPES.join(', '),
  };
}

/**
 * Base descriptions for each video style — pacing/energy only, no effect names.
 * Effect and transition recommendations are auto-appended from catalog tags.
 */
const STYLE_BASES: Record<string, string> = {
  dynamic:
    'Fast cuts (2-4s per shot), 4-6 effects per 30s, 3-5 zoom segments per 30s with spring easing. Every 2-3 seconds something new happens visually. High energy.',
  calm: 'Slow transitions (5-8s per shot), 1-2 effects per 30s, smooth zoom easing. Minimal, elegant.',
  cinematic:
    'Medium pacing (3-6s per shot), 2-3 effects per 30s, smooth zooms for dramatic moments. Film-like quality.',
  educational:
    'Medium pacing (3-5s per shot), 2-4 effects per 30s. Focus on clarity — text emphasis for key terms, lower thirds for concepts, counters for stats, zoom in on key points.',
};

type VideoStyle = 'dynamic' | 'calm' | 'cinematic' | 'educational';

function buildStyleGuidelines(): string {
  const styles = Object.keys(STYLE_BASES) as VideoStyle[];

  return styles
    .map((style) => {
      const base = STYLE_BASES[style];

      const effects = EFFECT_CATALOG.filter((e) => e.recommendedStyles?.includes(style)).map((e) =>
        e.styleHint ? `${e.type} (${e.styleHint})` : e.type
      );

      const transitions = TRANSITION_CATALOG.filter((t) =>
        t.recommendedStyles?.includes(style)
      ).map((t) => t.type);

      let line = `- "${style}": ${base}`;
      if (effects.length > 0) {
        line += `\n  Effects: ${effects.join(', ')}`;
      }
      if (transitions.length > 0) {
        line += `\n  Transitions: ${transitions.join(', ')}${style === 'dynamic' ? ' — mix them, NOT all crossfade' : ''}`;
      }
      return line;
    })
    .join('\n');
}

/**
 * Builds a dynamic system prompt for the LLM planner.
 * Effect catalog and segment catalog are auto-imported from the remotion package.
 * When new effects or segments are added there, the prompt updates automatically.
 */
export function buildPlannerPrompt(
  manifest: ToolManifest,
  montageProfile?: MontageProfileEntry,
  preferredToolIds?: readonly string[]
): string {
  const catalog = buildCatalogSections(manifest);

  const profileSection = montageProfile ? `\n${buildProfileGuidelines(montageProfile)}\n` : '';

  const preferredSection = preferredToolIds?.length
    ? `\n## PREFERRED TOOLS (MUST USE)\n\nThe user has explicitly requested these tools: ${preferredToolIds.map((id) => `"${id}"`).join(', ')}.\nYou MUST use these tools for the primary source and shots where applicable. Only use other tools if the preferred ones cannot handle a specific asset type.\n`
    : '';

  const toolSection =
    catalog.toolSection || 'No tools available - use text cards and effects only.';
  const guidelinesSection =
    catalog.guidelinesSection || 'No specific guidelines — use descriptive, visual language.';

  const template = loadTemplate('planner');
  const partials = loadAllPartials();

  return renderTemplate(
    template,
    {
      ...catalog,
      profileSection,
      preferredSection,
      toolSection,
      guidelinesSection,
    },
    partials
  );
}

/**
 * Builds a system prompt for compose mode: user provides all materials,
 * LLM arranges them into a production plan.
 */
export function buildComposerPrompt(assets: readonly UserAsset[]): string {
  const assetSection = assets
    .map((a) => {
      const meta = [
        `type: ${a.type}`,
        a.durationSeconds ? `duration: ${a.durationSeconds}s` : null,
        a.isPrimary ? '**PRIMARY / talking head**' : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `- "${a.id}": ${a.description} (${meta})`;
    })
    .join('\n');

  const effectSection = EFFECT_CATALOG.map((e) => {
    const sfxNote = e.defaultSfx ? ` [default SFX: "${e.defaultSfx}"]` : '';
    return `- "${e.type}": ${e.description}${sfxNote}\n  Config: ${e.config}`;
  }).join('\n');

  const sfxSection = SFX_CATALOG.map(
    (s) => `- "${s.id}": ${s.description} (~${s.durationMs}ms)`
  ).join('\n');

  const segmentSection = SEGMENT_CATALOG.map(
    (s) => `### ${s.type}\n${s.description}\nConfig: ${s.config}\nGuideline: ${s.dynamicGuideline}`
  ).join('\n\n');

  const layoutSection = LAYOUT_CATALOG.map((l) => `- "${l.type}": ${l.description}`).join('\n');

  const captionPropertySection = CAPTION_PROPERTY_CATALOG.map(
    (p) => `- ${p.key}: ${p.type} — ${p.description}`
  ).join('\n');

  const captionPresets = Object.keys(BUILT_IN_CAPTION_PRESETS).join(', ');

  const template = loadTemplate('composer');
  const partials = loadAllPartials();

  return renderTemplate(
    template,
    {
      assetSection,
      effectSection,
      sfxSection,
      segmentSection,
      layoutSection,
      captionPropertySection,
      captionPresets,
      styleGuidelines: buildStyleGuidelines(),
      entranceAnimations: ENTRANCE_ANIMATIONS.join(', '),
      exitAnimations: EXIT_ANIMATIONS.join(', '),
      transitionTypes: TRANSITION_TYPES.join(', '),
    },
    partials
  );
}

/**
 * Builds a system prompt for revising an existing production plan based on director feedback.
 */
export function buildRevisionPrompt(
  originalPlan: ProductionPlan,
  directorNotes: string,
  manifest: ToolManifest
): string {
  const catalog = buildCatalogSections(manifest);

  const toolSection =
    catalog.toolSection || 'No tools available - use text cards and effects only.';
  const guidelinesSection =
    catalog.guidelinesSection || 'No specific guidelines — use descriptive, visual language.';

  const template = loadTemplate('revision');
  const partials = loadAllPartials();

  return renderTemplate(
    template,
    {
      ...catalog,
      toolSection,
      guidelinesSection,
      originalPlan: JSON.stringify(originalPlan, null, 2),
      directorNotes: directorNotes.substring(0, 5000),
    },
    partials
  );
}
