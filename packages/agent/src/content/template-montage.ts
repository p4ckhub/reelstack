/**
 * Template Montage — deterministic plan builder from ContentPackage.
 *
 * Zero LLM. Takes content + template config → ProductionPlan.
 * Each template defines a shot pattern that cycles through sections.
 *
 * Adding a new template: call registerTemplate() with a TemplateMontageConfig.
 * All fields beyond id/name/layout/shotPattern/transition are optional with
 * sensible defaults matching the current hardcoded behavior.
 */

import type { ProductionPlan, ShotPlan, EffectPlan, PipSegmentPlan } from '../types';
import type { ContentPackage, ContentSection, ContentAsset } from './content-package';

// ── Template configs ──────────────────────────────────────────

export interface ShotTemplate {
  type: 'head' | 'content' | 'split' | 'montage';
  /** How to determine shot duration */
  durationStrategy: 'fixed' | 'fill-section';
  fixedDurationSeconds?: number;
  maxDurationSeconds?: number;
  /** For montage: how many panels (assets) to group */
  panelCount?: number;
}

export interface TemplateMontageConfig {
  id: string;
  name: string;
  layout: 'hybrid-anchor' | 'anchor-bottom' | 'fullscreen';
  /** Shot pattern that cycles through sections. 'content'/'split' shots consume assets. */
  shotPattern: ShotTemplate[];
  /** Transition between shots */
  transition: 'crossfade' | 'slide-left' | 'zoom-in' | 'varied';
  /** Caption highlight mode (overrides default) */
  captionMode?: 'hormozi' | 'single-word' | 'pill' | 'text';
  /** Max seconds for final head/CTA shot */
  maxCtaSeconds?: number;
  /** Show presenter as PiP circle during content shots */
  showPip?: boolean;
  /** PiP config */
  pipConfig?: {
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'bottom-center';
    size?: number;
    shape?: 'circle' | 'rounded';
  };
  /** CTA text at the end (optional) */
  cta?: string;

  // ── Extended config (all optional, defaults match current behavior) ──

  /** Hook shot config */
  hook?: {
    type?: 'head' | 'content';
    minDuration?: number;
    maxDuration?: number;
  };

  /** Zoom behavior on head shots */
  zoom?: {
    enabled?: boolean;
    pattern?: 'alternate' | 'all' | 'none';
    scale?: number;
    focusPoint?: { x: number; y: number };
  };

  /** Deterministic effects to include */
  effectsConfig?: {
    hookTextEmphasis?: boolean;
    subscribeBanner?: boolean;
    subscribeBannerText?: string;
  };

  /** PiP extended styling (extends pipConfig) */
  pipStyle?: {
    borderColor?: string;
    borderWidth?: number;
    captionOffset?: number;
  };

  /** Animation pool for B-roll segments (passed to assembler) */
  animations?: string[];

  /** Transition duration in ms */
  transitionDurationMs?: number;

  /** Caption style overrides (beyond captionMode) */
  captionStyleOverrides?: {
    highlightColor?: string;
    fontSize?: number;
    fontFamily?: string;
    position?: number;
  };

  /** Auto SFX on montage events (zoom changes, shot transitions) */
  sfxMode?: 'auto' | 'ai-director' | 'none';

  /** Scroll-stopper entrance animation (first 0.3-0.8s) */
  scrollStopper?: {
    preset:
      | 'flash-zoom'
      | 'glitch-reveal'
      | 'impact-shake'
      | 'tv-static'
      | 'swipe-in'
      | 'zoom-bounce'
      | 'none';
    durationSeconds?: number;
  };
}

// ── Resolved defaults (single source of truth) ───────────────

interface ResolvedDefaults {
  hook: { type: 'head' | 'content'; minDuration: number; maxDuration: number };
  zoom: {
    enabled: boolean;
    pattern: 'alternate' | 'all' | 'none';
    scale: number;
    focusPoint: { x: number; y: number };
  };
  effects: { hookTextEmphasis: boolean; subscribeBanner: boolean; subscribeBannerText: string };
  pipStyle: { borderColor: string; borderWidth: number; captionOffset: number };
  animations: string[];
  transitionDurationMs: number;
  captionStyleOverrides: Record<string, unknown>;
}

function resolveDefaults(config: TemplateMontageConfig): ResolvedDefaults {
  return {
    hook: { type: 'head', minDuration: 1.5, maxDuration: 2.5, ...config.hook },
    zoom: {
      enabled: true,
      pattern: 'alternate',
      scale: 1.15,
      focusPoint: { x: 50, y: 45 },
      ...config.zoom,
    },
    effects: {
      hookTextEmphasis: false,
      subscribeBanner: true,
      subscribeBannerText: 'Obserwuj po więcej!',
      ...config.effectsConfig,
    },
    pipStyle: { borderColor: '#FFD700', borderWidth: 4, captionOffset: 55, ...config.pipStyle },
    animations: config.animations ?? ['spring-scale', 'fade', 'slide'],
    transitionDurationMs: config.transitionDurationMs ?? 300,
    captionStyleOverrides: config.captionStyleOverrides ?? {},
  };
}

// ── Template registry ─────────────────────────────────────────

const registry = new Map<string, TemplateMontageConfig>();

/** Register a template. Can be called by external modules to add custom templates. */
export function registerTemplate(config: TemplateMontageConfig): void {
  registry.set(config.id, config);
}

/** Get a template by ID. Returns undefined if not found. */
export function getTemplate(id: string): TemplateMontageConfig | undefined {
  return registry.get(id);
}

/** List all registered templates. */
export function listTemplates(): readonly TemplateMontageConfig[] {
  return [...registry.values()];
}

// ── Built-in templates ────────────────────────────────────────

registerTemplate({
  id: 'anchor-bottom-simple',
  name: 'Anchor Bottom (Simple)',
  layout: 'anchor-bottom',
  shotPattern: [
    { type: 'head', durationStrategy: 'fixed', fixedDurationSeconds: 2.5 },
    { type: 'content', durationStrategy: 'fill-section', maxDurationSeconds: 4 },
  ],
  transition: 'crossfade',
});

registerTemplate({
  id: 'fullscreen-broll',
  name: 'Fullscreen B-Roll',
  layout: 'fullscreen',
  shotPattern: [
    { type: 'head', durationStrategy: 'fixed', fixedDurationSeconds: 2.5 },
    { type: 'content', durationStrategy: 'fill-section', maxDurationSeconds: 4 },
    { type: 'head', durationStrategy: 'fixed', fixedDurationSeconds: 1.5 },
    { type: 'content', durationStrategy: 'fill-section', maxDurationSeconds: 4 },
  ],
  transition: 'varied',
});

// Premium templates (hybrid-dynamic, rapid-content, pip-tutorial) are registered
// by private modules via registerTemplate(). See packages/modules/src/private/.

// ── Transition rotation ───────────────────────────────────────

const VARIED_TRANSITIONS = ['crossfade', 'slide-left', 'zoom-in', 'slide-left', 'crossfade'];

function pickTransition(config: TemplateMontageConfig, index: number): string {
  if (config.transition === 'varied') {
    return VARIED_TRANSITIONS[index % VARIED_TRANSITIONS.length];
  }
  return config.transition;
}

// ── Plan builder ──────────────────────────────────────────────

/**
 * Build a ProductionPlan deterministically from ContentPackage + template.
 * No LLM involved. Sections map 1:1 to assets. Shot pattern cycles.
 */
export function buildTemplatePlan(content: ContentPackage, templateId: string): ProductionPlan {
  const config = getTemplate(templateId);
  if (!config) {
    const available = listTemplates()
      .map((t) => t.id)
      .join(', ');
    throw new Error(`Unknown template: ${templateId}. Available: ${available}`);
  }

  const defaults = resolveDefaults(config);
  const { sections, assets, primaryVideo } = content;
  const totalDuration = content.voiceover.durationSeconds;

  const shots: ShotPlan[] = [];
  let currentTime = 0;
  let patternIdx = 0;
  let sectionIdx = 0;
  let shotCounter = 0;
  const txDurationMs = defaults.transitionDurationMs;

  // Hook
  const hookDuration = Math.max(
    defaults.hook.minDuration,
    Math.min(defaults.hook.maxDuration, sections[0]?.startTime ?? defaults.hook.maxDuration)
  );
  shots.push(
    makeShot(++shotCounter, 0, hookDuration, 'head', undefined, 'none', 'Hook', txDurationMs)
  );
  currentTime = hookDuration;

  // Body: iterate through sections. Template pattern decides shot TYPE.
  // - head: short transition (no section consumed)
  // - content/split: one section consumed, one asset
  // - montage: no section consumed — multi-panel filler using existing assets
  for (
    sectionIdx = 0;
    sectionIdx < sections.length && currentTime < totalDuration - 2;
    sectionIdx++
  ) {
    const section = sections[sectionIdx];
    const asset = assets.find((a) => a.id === section.assetId);

    // Get next template entry from pattern
    let template = config.shotPattern[patternIdx % config.shotPattern.length];
    patternIdx++;

    // Head entries become short transitions BEFORE section
    while (template.type === 'head' && patternIdx < 100) {
      const headDur = Math.min(template.fixedDurationSeconds ?? 1.5, 1.5);
      const headEnd = Math.min(currentTime + headDur, totalDuration - 1);
      if (headEnd - currentTime > 0.3) {
        shots.push(
          makeShot(
            ++shotCounter,
            currentTime,
            headEnd,
            'head',
            undefined,
            pickTransition(config, shotCounter),
            'Transition'
          )
        );
        currentTime = headEnd;
      }
      template = config.shotPattern[patternIdx % config.shotPattern.length];
      patternIdx++;
    }

    // Montage: multi-panel filler BEFORE section (doesn't consume the section)
    if (template.type === 'montage') {
      const panelCount = template.panelCount ?? 3;
      const montageDur = template.fixedDurationSeconds ?? 3;
      const montageEnd = Math.min(currentTime + montageDur, totalDuration - 2);
      if (montageEnd - currentTime > 0.5 && assets.length >= 2) {
        // Pick N assets for panels (round-robin from all available)
        const panelAssets: ContentAsset[] = [];
        for (let p = 0; p < panelCount && assets.length > 0; p++) {
          panelAssets.push(assets[p % assets.length]);
        }
        shots.push(
          makeMontageShot(
            ++shotCounter,
            currentTime,
            montageEnd,
            panelAssets,
            pickTransition(config, shotCounter)
          )
        );
        currentTime = montageEnd;
      }
      // Get next non-montage template for the actual section
      template = config.shotPattern[patternIdx % config.shotPattern.length];
      patternIdx++;
      // Skip any head templates too
      while (template.type === 'head' || template.type === 'montage') {
        template = config.shotPattern[patternIdx % config.shotPattern.length];
        patternIdx++;
        if (patternIdx > 50) break;
      }
      // Rewind sectionIdx so this section still gets its own shot
      // (montage didn't consume it)
    }

    // Content or split: consume section + asset
    const shotType =
      template.type === 'content' || template.type === 'split' ? template.type : 'content';
    const maxShotDur = template.maxDurationSeconds ?? 6;
    const sectionStart = Math.max(section.startTime, currentTime);
    const sectionDur = Math.min(section.endTime - sectionStart, maxShotDur);
    const endTime = Math.min(currentTime + Math.max(sectionDur, 2), totalDuration - 1);

    if (endTime - currentTime > 0.5 && asset) {
      shots.push(
        makeShot(
          ++shotCounter,
          currentTime,
          endTime,
          shotType,
          { searchQuery: asset.id, toolId: 'user-upload' },
          pickTransition(config, shotCounter),
          `Section ${sectionIdx + 1}: ${section.text.substring(0, 40)}`
        )
      );
    } else if (endTime - currentTime > 0.5) {
      shots.push(
        makeShot(
          ++shotCounter,
          currentTime,
          endTime,
          'head',
          undefined,
          pickTransition(config, shotCounter),
          `Section ${sectionIdx + 1} (no asset)`
        )
      );
    }
    currentTime = endTime;
  }

  // Tail: if significant time remains after sections, recycle assets to fill
  const maxCta = config.maxCtaSeconds ?? 5;
  const assetsWithIds = assets.filter((a) => a.id);
  let recycleIdx = 0;
  while (totalDuration - currentTime > maxCta + 2 && assetsWithIds.length > 0) {
    const recycled = assetsWithIds[recycleIdx % assetsWithIds.length];
    recycleIdx++;
    const shotEnd = Math.min(currentTime + 3, totalDuration - maxCta);
    shots.push(
      makeShot(
        ++shotCounter,
        currentTime,
        shotEnd,
        'content',
        { searchQuery: recycled.id, toolId: 'user-upload' },
        pickTransition(config, shotCounter),
        `Recap board`
      )
    );
    currentTime = shotEnd;
  }

  // CTA: single head shot, capped by maxCtaSeconds
  if (totalDuration - currentTime > 0.5) {
    shots.push(
      makeShot(++shotCounter, currentTime, totalDuration, 'head', undefined, 'crossfade', 'CTA')
    );
  }

  // Template effects
  const effects = buildTemplateEffects(config, shots, totalDuration, defaults);

  // Zoom segments on head shots
  const zoomSegments = buildHeadZooms(shots, defaults);

  // CTA segment
  const ctaSegments = config.cta
    ? [
        {
          startTime: totalDuration - 2,
          endTime: totalDuration,
          text: config.cta,
          style: 'pill' as const,
          backgroundColor: '#FFD700',
          textColor: '#000000',
          position: 'bottom' as const,
        },
      ]
    : [];

  // PiP segments: show presenter as circle during content shots.
  // Merge adjacent content shots into one continuous PiP segment (no re-entrance animation).
  const pipSegments: PipSegmentPlan[] = [];
  if (config.showPip) {
    const pip = config.pipConfig ?? {};
    let pipStart: number | null = null;
    let pipEnd = 0;

    for (const shot of shots) {
      if (shot.shotLayout === 'content') {
        if (pipStart === null) {
          pipStart = shot.startTime;
        }
        pipEnd = shot.endTime;
      } else {
        if (pipStart !== null) {
          pipSegments.push({
            startTime: pipStart,
            endTime: pipEnd,
            position: pip.position ?? 'bottom-right',
            size: pip.size ?? 28,
            shape: pip.shape ?? 'circle',
            borderColor: defaults.pipStyle.borderColor,
            borderWidth: defaults.pipStyle.borderWidth,
          });
          pipStart = null;
        }
      }
    }
    if (pipStart !== null) {
      pipSegments.push({
        startTime: pipStart,
        endTime: pipEnd,
        position: pip.position ?? 'bottom-right',
        size: pip.size ?? 28,
        shape: pip.shape ?? 'circle',
        borderColor: defaults.pipStyle.borderColor,
        borderWidth: defaults.pipStyle.borderWidth,
      });
    }
  }

  return {
    primarySource: primaryVideo
      ? { type: 'user-recording' as const, url: primaryVideo.url }
      : { type: 'none' as const },
    shots,
    effects,
    zoomSegments,
    lowerThirds: [],
    counters: [],
    highlights: [],
    ctaSegments,
    pipSegments,
    animationPool: defaults.animations,
    layout: config.layout,
    captionStyle: {
      highlightMode: config.captionMode ?? 'hormozi',
      highlightColor: '#FFD700',
      ...(config.showPip ? { position: defaults.pipStyle.captionOffset } : {}),
      ...defaults.captionStyleOverrides,
    },
    scrollStopper: config.scrollStopper,
    sfxSegments: config.sfxMode !== 'none' ? buildAutoSfx(shots, zoomSegments) : [],
    reasoning: `Template montage: ${config.name}`,
  };
}

// ── Helpers ───────────────────────────────────────────────────

function makeShot(
  num: number,
  startTime: number,
  endTime: number,
  shotLayout: 'head' | 'content' | 'split',
  broll?: { searchQuery: string; toolId: string },
  transition = 'crossfade',
  reason = '',
  transitionDurationMs = 300
): ShotPlan {
  return {
    id: `shot-${num}`,
    startTime,
    endTime,
    scriptSegment: reason,
    visual: broll
      ? { type: 'b-roll' as const, searchQuery: broll.searchQuery, toolId: broll.toolId }
      : { type: 'primary' as const },
    transition: { type: transition, durationMs: transitionDurationMs },
    shotLayout,
    reason,
  };
}

function makeMontageShot(
  num: number,
  startTime: number,
  endTime: number,
  panelAssets: readonly ContentAsset[],
  transition = 'crossfade',
  transitionDurationMs = 300
): ShotPlan {
  return {
    id: `shot-${num}`,
    startTime,
    endTime,
    scriptSegment: 'Multi-panel montage',
    visual: { type: 'primary' as const },
    transition: { type: transition, durationMs: transitionDurationMs },
    shotLayout: 'montage',
    montagePanelIds: panelAssets.map((a) => a.id),
    reason: `Montage: ${panelAssets.length} panels`,
  };
}

function buildTemplateEffects(
  _config: TemplateMontageConfig,
  shots: ShotPlan[],
  totalDuration: number,
  defaults: ResolvedDefaults
): EffectPlan[] {
  const effects: EffectPlan[] = [];

  if (defaults.effects.hookTextEmphasis && shots.length > 0) {
    effects.push({
      type: 'text-emphasis',
      startTime: 0,
      endTime: Math.min(2, totalDuration),
      config: { text: shots[0].scriptSegment ?? '' },
      reason: 'Hook emphasis',
    });
  }

  if (defaults.effects.subscribeBanner && totalDuration > 10) {
    effects.push({
      type: 'subscribe-banner',
      startTime: totalDuration - 3,
      endTime: totalDuration - 0.5,
      config: {
        channelName: defaults.effects.subscribeBannerText,
        position: 'bottom',
      },
      reason: 'End CTA',
    });
  }

  return effects;
}

function buildHeadZooms(
  shots: ShotPlan[],
  defaults: ResolvedDefaults
): Array<{
  startTime: number;
  endTime: number;
  scale: number;
  focusPoint: { x: number; y: number };
  easing: 'spring' | 'smooth';
}> {
  if (!defaults.zoom.enabled || defaults.zoom.pattern === 'none') return [];

  const headShots = shots.filter((s) => s.shotLayout === 'head');
  const zooms: Array<{
    startTime: number;
    endTime: number;
    scale: number;
    focusPoint: { x: number; y: number };
    easing: 'spring' | 'smooth';
  }> = [];

  for (let i = 0; i < headShots.length; i++) {
    if (defaults.zoom.pattern === 'alternate' && (i === 0 || i % 2 === 0)) continue;
    if (defaults.zoom.pattern === 'all' && i === 0) continue;

    const shot = headShots[i];
    const isZoomIn = i % 2 === 1;
    zooms.push({
      startTime: shot.startTime,
      endTime: shot.endTime,
      scale: isZoomIn ? defaults.zoom.scale : defaults.zoom.scale * 0.96,
      focusPoint: defaults.zoom.focusPoint,
      easing: 'smooth',
    });
  }

  return zooms;
}

interface SfxSegment {
  readonly startTime: number;
  readonly sfxId: string;
  readonly volume?: number;
}

// SFX rotation pools — variety instead of same sound every time
const ZOOM_SFX = ['whoosh', 'swipe', 'click', 'whoosh', 'pop'] as const;
const TRANSITION_SFX = ['swipe', 'whoosh', 'click', 'swipe'] as const;

/**
 * Auto-generate SFX from montage events with variety.
 * Rotates through SFX pools so consecutive events get different sounds.
 */
function buildAutoSfx(
  shots: ShotPlan[],
  zoomSegments: Array<{ startTime: number; scale: number }>
): SfxSegment[] {
  const sfx: SfxSegment[] = [];
  const MIN_GAP = 1.5;
  let lastSfxTime = -MIN_GAP;
  let zoomIdx = 0;
  let transIdx = 0;

  const addSfx = (time: number, id: string, vol = 0.5) => {
    if (time - lastSfxTime >= MIN_GAP) {
      sfx.push({ startTime: time, sfxId: id, volume: vol });
      lastSfxTime = time;
    }
  };

  // Zoom changes — dramatic = thud (always), medium = rotating pool
  for (const z of zoomSegments) {
    if (z.scale >= 1.3) {
      addSfx(z.startTime, 'thud', 0.55);
    } else if (z.scale > 1.05) {
      addSfx(z.startTime, ZOOM_SFX[zoomIdx % ZOOM_SFX.length], 0.3);
      zoomIdx++;
    }
  }

  // Shot transitions — rotating pool
  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1];
    const curr = shots[i];
    if (prev.shotLayout !== curr.shotLayout) {
      if (curr.shotLayout === 'montage') {
        addSfx(curr.startTime, 'pop', 0.4);
      } else if (curr.shotLayout === 'content' || curr.shotLayout === 'split') {
        addSfx(curr.startTime, TRANSITION_SFX[transIdx % TRANSITION_SFX.length], 0.3);
        transIdx++;
      }
    }
  }

  // Sort by time (zoom + transitions may interleave)
  sfx.sort((a, b) => a.startTime - b.startTime);

  return sfx;
}
