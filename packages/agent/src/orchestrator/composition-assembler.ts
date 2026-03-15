import type { ProductionPlan, GeneratedAsset, EffectPlan, BrandPreset } from '../types';
import { BUILT_IN_CAPTION_PRESETS, DEFAULT_CAPTION_PRESET } from '@reelstack/types';
import type { CaptionPreset } from '@reelstack/types';
import { EFFECT_CATALOG, sfxIdToUrl } from '@reelstack/remotion/catalog';
import { createLogger } from '@reelstack/logger';

const log = createLogger('composition-assembler');

/**
 * Shape matching ReelProps from packages/remotion/src/schemas/reel-props.ts
 * We define it locally to avoid importing React/Remotion dependencies.
 */
export interface AssembledProps {
  layout:
    | 'split-screen'
    | 'fullscreen'
    | 'picture-in-picture'
    | 'anchor-bottom'
    | 'hybrid-anchor'
    | 'comparison-split';
  primaryVideoUrl?: string;
  primaryVideoDurationSeconds?: number;
  primaryVideoObjectPosition?: string;
  secondaryVideoUrl?: string;
  voiceoverUrl?: string;
  bRollSegments: BRollSegment[];
  effects: EffectEntry[];
  pipSegments: unknown[];
  lowerThirds: unknown[];
  ctaSegments: unknown[];
  counters: unknown[];
  zoomSegments: unknown[];
  highlights: unknown[];
  cues: CueEntry[];
  captionStyle?: Record<string, unknown>;
  dynamicCaptionPosition: boolean;
  musicUrl?: string;
  musicVolume: number;
  showProgressBar: boolean;
  backgroundColor: string;
}

interface BRollSegment {
  startTime: number;
  endTime: number;
  media: {
    url: string;
    type: 'video' | 'image' | 'color' | 'text-card' | 'multi-panel';
    label?: string;
    textCard?: { headline: string; background: string; textColor?: string };
    panels?: Array<{ url: string; type: 'video' | 'image' }>;
  };
  animation?: string;
  transition?: { type: string; durationMs: number };
  shotLayout?: 'head' | 'content' | 'split' | 'montage' | 'anchor' | 'fullscreen';
  objectFit?: 'cover' | 'contain';
}

interface EffectEntry {
  type: string;
  startTime: number;
  endTime: number;
  [key: string]: unknown;
}

interface CueEntry {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words?: Array<{ text: string; startTime: number; endTime: number }>;
  animationStyle?: string;
}

export interface AssemblyInput {
  plan: ProductionPlan;
  assets: readonly GeneratedAsset[];
  cues: readonly CueEntry[];
  voiceoverFilename?: string;
  brandPreset?: BrandPreset;
  /** Duration of primary video for looping (needed for short AI avatar clips) */
  primaryVideoDurationSeconds?: number;
  /** CSS objectPosition for primary video (from avatar framing metadata) */
  primaryVideoObjectPosition?: string;
}

/** Extract string from unknown, return undefined if not string */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
/** Extract number from unknown, return undefined if not number */
function num(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

/**
 * Assembles a ProductionPlan + generated assets + cues into ReelProps.
 */
export function assembleComposition(input: AssemblyInput): AssembledProps {
  const { plan, assets, cues, voiceoverFilename, brandPreset } = input;

  // Build asset lookup: shotId -> asset (also index by searchQuery for compose mode)
  const assetMap = new Map<string, GeneratedAsset>();
  for (const asset of assets) {
    if (asset.shotId) assetMap.set(asset.shotId, asset);
  }
  // For compose mode: shots reference assets by searchQuery (= UserAsset.id like "board-0")
  // Also add these to the map so split shots (shot-2a/shot-2b) can find their parent asset
  for (const shot of plan.shots) {
    if (shot.visual.type === 'primary') continue;
    const sq = (shot.visual as Record<string, unknown>).searchQuery as string | undefined;
    if (sq && !assetMap.has(sq)) {
      const byShot = assetMap.get(shot.id);
      if (byShot) assetMap.set(sq, byShot);
    }
  }

  log.info(
    {
      totalAssets: assets.length,
      mappedAssets: assetMap.size,
      assetDetails: assets.map((a) => ({
        shotId: a.shotId ?? 'PRIMARY',
        toolId: a.toolId,
        type: a.type,
        url: a.url.substring(0, 100),
        durationSeconds: a.durationSeconds,
      })),
    },
    'Asset map built'
  );

  // Primary video URL + duration (for looping short clips like AI avatars)
  let primaryVideoUrl: string | undefined;
  let primaryVideoDurationSeconds: number | undefined = input.primaryVideoDurationSeconds;
  if (plan.primarySource.type === 'user-recording') {
    primaryVideoUrl = plan.primarySource.url;
  } else if (plan.primarySource.type === 'avatar' || plan.primarySource.type === 'ai-video') {
    const primaryAsset = assets.find((a) => !a.shotId);
    primaryVideoUrl = primaryAsset?.url;
    primaryVideoDurationSeconds ??= primaryAsset?.durationSeconds;
  }

  // Convert shots to B-roll segments
  const bRollSegments: BRollSegment[] = [];

  for (const shot of plan.shots) {
    // Montage shots: multi-panel grid from montagePanelIds
    if (shot.shotLayout === 'montage' && shot.montagePanelIds?.length) {
      // Find panel assets by montagePanelIds (these are content asset IDs like "board-0")
      // Look up via searchQuery in existing b-roll shots, or directly from asset list
      const panels = shot.montagePanelIds
        .map((id) => {
          // Try assetMap (keyed by shotId or searchQuery)
          const mapped = assetMap.get(id);
          // Also try finding any asset whose shotId contains this id
          const byId = mapped ?? assets.find((a) => a.shotId === id);
          const url = byId?.url;
          if (!url) return null;
          const isImg = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url);
          return { url, type: (isImg ? 'image' : 'video') as 'video' | 'image' };
        })
        .filter((p): p is { url: string; type: 'video' | 'image' } => p !== null);

      if (panels.length >= 2) {
        bRollSegments.push({
          startTime: shot.startTime,
          endTime: shot.endTime,
          media: { url: panels[0].url, type: 'multi-panel', panels },
          animation: 'fade',
          transition: { type: shot.transition.type, durationMs: shot.transition.durationMs },
          shotLayout: 'montage',
        });
      }
      continue;
    }

    if (shot.visual.type === 'primary') continue;

    if (shot.visual.type === 'text-card') {
      bRollSegments.push({
        startTime: shot.startTime,
        endTime: shot.endTime,
        media: {
          url: shot.visual.background,
          type: 'text-card',
          textCard: {
            headline: shot.visual.headline,
            background: shot.visual.background,
          },
        },
        animation: 'fade',
        transition: { type: shot.transition.type, durationMs: shot.transition.durationMs },
        ...(shot.panel ? { panel: shot.panel } : {}),
        ...(shot.shotLayout ? { shotLayout: shot.shotLayout } : {}),
      });
      continue;
    }

    // b-roll, ai-video, or ai-image
    // Lookup by shot.id first (generate mode), then by searchQuery (compose mode with user assets)
    const searchQuery = (shot.visual as Record<string, unknown>).searchQuery as string | undefined;
    const asset = assetMap.get(shot.id) ?? (searchQuery ? assetMap.get(searchQuery) : undefined);
    if (!asset) {
      log.warn({ shotId: shot.id }, 'No generated asset for shot, using placeholder');
      bRollSegments.push({
        startTime: shot.startTime,
        endTime: shot.endTime,
        media: { url: '#333333', type: 'color', label: shot.reason },
        animation: 'fade',
        transition: { type: shot.transition.type, durationMs: shot.transition.durationMs },
        ...(shot.panel ? { panel: shot.panel } : {}),
        ...(shot.shotLayout ? { shotLayout: shot.shotLayout } : {}),
      });
      continue;
    }

    // Detect media type: check asset type first, then URL extension (Pexels image: prefix returns jpeg URLs with stock-video type)
    const imageExtensions = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?)(\?|$)/i;
    const isImageByType = asset.type === 'ai-image' || asset.type === 'stock-image';
    const isImageByUrl = imageExtensions.test(asset.url);
    const mediaType = isImageByType || isImageByUrl ? 'image' : 'video';

    // Validate URL - allow http(s) and local file paths (for generated temp files)
    let validUrl = asset.url;
    if (
      !asset.url.startsWith('/') &&
      !asset.url.startsWith('http://') &&
      !asset.url.startsWith('https://')
    ) {
      log.warn({ url: asset.url, shotId: shot.id }, 'Invalid asset URL scheme, using placeholder');
      validUrl = '#333333';
    }

    // Rotate animations for visual variety (template can override the pool)
    const animPool = plan.animationPool ?? [
      'spring-scale',
      'fade',
      'slide',
      'spring-scale',
      'fade',
    ];
    const animIdx = bRollSegments.length;
    const animation =
      shot.shotLayout === 'content'
        ? animPool[animIdx % animPool.length]
        : animPool[(animIdx + 2) % animPool.length];

    bRollSegments.push({
      startTime: shot.startTime,
      endTime: shot.endTime,
      media: { url: validUrl, type: validUrl === '#333333' ? 'color' : mediaType },
      animation,
      transition: { type: shot.transition.type, durationMs: shot.transition.durationMs },
      ...(shot.panel ? { panel: shot.panel } : {}),
      ...(shot.shotLayout ? { shotLayout: shot.shotLayout } : {}),
    });
  }

  log.info(
    {
      bRollCount: bRollSegments.length,
      bRollDetails: bRollSegments.map((br) => ({
        startTime: br.startTime,
        endTime: br.endTime,
        mediaType: br.media.type,
        mediaUrl: br.media.url.substring(0, 100),
        transition: br.transition?.type,
      })),
      primaryVideoUrl: primaryVideoUrl?.substring(0, 100) ?? 'NONE',
    },
    'B-roll segments assembled'
  );

  // Convert effects - flatten config into top-level props (spread config first so sanitized fields can't be overridden)
  // Build default SFX lookup from catalog
  const defaultSfxMap = new Map<string, string>();
  for (const entry of EFFECT_CATALOG) {
    if (entry.defaultSfx) {
      defaultSfxMap.set(entry.type, entry.defaultSfx);
    }
  }

  const effects: EffectEntry[] = plan.effects.map((e) => {
    const base: EffectEntry = {
      ...e.config,
      type: e.type,
      startTime: e.startTime,
      endTime: e.endTime,
    };

    // Resolve SFX: LLM config > default from catalog
    const configSfx = e.config.sfx as { id?: string; volume?: number } | null | undefined;

    if (configSfx === null) {
      // LLM explicitly muted SFX — don't add any
      delete base.sfx;
    } else if (configSfx?.id) {
      // LLM specified a custom SFX
      base.sfx = { url: sfxIdToUrl(configSfx.id), volume: configSfx.volume ?? 0.7 };
    } else {
      // Apply default SFX from catalog if available
      const defaultSfxId = defaultSfxMap.get(e.type);
      if (defaultSfxId) {
        base.sfx = { url: sfxIdToUrl(defaultSfxId), volume: 0.7 };
      }
    }

    return base;
  });

  // Resolve caption style with 3-layer priority:
  // 1. preset defaults (lowest)
  // 2. LLM plan.captionStyle suggestions (middle)
  // 3. individual brandPreset overrides (highest)
  const presetName = brandPreset?.captionPreset ?? DEFAULT_CAPTION_PRESET;
  const preset: CaptionPreset =
    BUILT_IN_CAPTION_PRESETS[presetName] ?? BUILT_IN_CAPTION_PRESETS[DEFAULT_CAPTION_PRESET];

  // LLM suggestions from plan (sanitized in production-planner.ts)
  const llm = (plan.captionStyle ?? {}) as Record<string, unknown>;

  const captionStyle = {
    fontFamily: brandPreset?.fontFamily ?? str(llm.fontFamily) ?? preset.style.fontFamily,
    fontSize: brandPreset?.fontSize ?? num(llm.fontSize) ?? preset.style.fontSize,
    fontColor: brandPreset?.fontColor ?? str(llm.fontColor) ?? preset.style.fontColor,
    fontWeight:
      brandPreset?.fontWeight ??
      (str(llm.fontWeight) as 'normal' | 'bold') ??
      preset.style.fontWeight,
    fontStyle: (str(llm.fontStyle) as 'normal' | 'italic') ?? preset.style.fontStyle,
    backgroundColor: str(llm.backgroundColor) ?? preset.style.backgroundColor,
    backgroundOpacity: num(llm.backgroundOpacity) ?? preset.style.backgroundOpacity,
    outlineColor: brandPreset?.outlineColor ?? str(llm.outlineColor) ?? preset.style.outlineColor,
    outlineWidth: brandPreset?.outlineWidth ?? num(llm.outlineWidth) ?? preset.style.outlineWidth,
    shadowColor: str(llm.shadowColor) ?? preset.style.shadowColor,
    shadowBlur: num(llm.shadowBlur) ?? preset.style.shadowBlur,
    position: brandPreset?.position ?? num(llm.position) ?? preset.style.position,
    alignment: (str(llm.alignment) as 'left' | 'center' | 'right') ?? preset.style.alignment,
    lineHeight: num(llm.lineHeight) ?? preset.style.lineHeight,
    padding: num(llm.padding) ?? preset.style.padding,
    highlightColor:
      brandPreset?.highlightColor ?? str(llm.highlightColor) ?? preset.style.highlightColor,
    upcomingColor: str(llm.upcomingColor) ?? '#8888A0',
    highlightMode:
      (str(llm.highlightMode) as 'text' | 'pill') ?? preset.style.highlightMode ?? 'text',
    textTransform:
      brandPreset?.textTransform ??
      (str(llm.textTransform) as 'none' | 'uppercase') ??
      preset.style.textTransform ??
      'none',
  };

  // Map plan segments to props
  const zoomSegments = (plan.zoomSegments ?? []).map((z) => ({
    startTime: z.startTime,
    endTime: z.endTime,
    scale: z.scale,
    focusPoint: z.focusPoint,
    easing: z.easing,
  }));

  const lowerThirds = (plan.lowerThirds ?? []).map((l) => ({
    startTime: l.startTime,
    endTime: l.endTime,
    title: l.title,
    subtitle: l.subtitle,
    backgroundColor: l.backgroundColor,
    textColor: l.textColor,
    position: l.position,
    accentColor: l.accentColor,
  }));

  const counters = (plan.counters ?? []).map((c) => ({
    startTime: c.startTime,
    endTime: c.endTime,
    value: c.value,
    prefix: c.prefix,
    suffix: c.suffix,
    format: c.format,
    textColor: c.textColor,
    fontSize: c.fontSize,
    position: c.position,
  }));

  const highlights = (plan.highlights ?? []).map((h) => ({
    startTime: h.startTime,
    endTime: h.endTime,
    x: h.x,
    y: h.y,
    width: h.width,
    height: h.height,
    color: h.color,
    borderWidth: h.borderWidth,
    label: h.label,
    glow: h.glow,
  }));

  const ctaSegments = (plan.ctaSegments ?? []).map((c) => ({
    startTime: c.startTime,
    endTime: c.endTime,
    text: c.text,
    style: c.style,
    backgroundColor: c.backgroundColor,
    textColor: c.textColor,
    position: c.position,
  }));

  return {
    layout: brandPreset?.layout ?? plan.layout,
    primaryVideoUrl,
    primaryVideoDurationSeconds,
    primaryVideoObjectPosition: input.primaryVideoObjectPosition,
    voiceoverUrl: voiceoverFilename,
    bRollSegments,
    effects,
    pipSegments: (plan.pipSegments ?? []).map((p) => ({
      startTime: p.startTime,
      endTime: p.endTime,
      videoUrl: primaryVideoUrl ?? '',
      position: p.position,
      size: p.size,
      shape: p.shape,
      borderColor: p.borderColor,
      borderWidth: p.borderWidth,
      videoDurationSeconds: primaryVideoDurationSeconds,
    })),
    lowerThirds,
    ctaSegments,
    counters,
    zoomSegments,
    highlights,
    cues: cues.map((c) => ({ ...c })),
    captionStyle,
    dynamicCaptionPosition: brandPreset?.dynamicCaptionPosition ?? preset.dynamicCaptionPosition,
    musicUrl: brandPreset?.musicUrl,
    musicVolume: brandPreset?.musicVolume ?? preset.musicVolume,
    showProgressBar: brandPreset?.showProgressBar ?? preset.showProgressBar,
    backgroundColor: brandPreset?.backgroundColor ?? '#000000',
    ...(plan.scrollStopper ? { scrollStopper: plan.scrollStopper } : {}),
    ...(brandPreset?.logoOverlay ? { logoOverlay: brandPreset.logoOverlay } : {}),
    ...(plan.sfxSegments?.length ? { sfxSegments: plan.sfxSegments } : {}),
  };
}
