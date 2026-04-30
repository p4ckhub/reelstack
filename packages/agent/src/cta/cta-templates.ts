/**
 * Shared end-card / CTA template registry.
 *
 * Every reel mode (n8n-explainer, slideshow, presenter, talking-object,
 * ai-tips, …) ends with the same kind of card: a few seconds of "do
 * this next" instruction plus a link target. The instruction copy
 * varies by *platform*, not by mode:
 *
 *   IG / FB    — comment-trigger DM via Meta Graph API. Card asks for
 *                a keyword, the user's bot replies in DM with the link.
 *   TikTok     — no public API for comment-DM. Best path is link in
 *                bio (Linktree-style), accept the extra click.
 *   YouTube    — Shorts have no DM, but description links ARE clickable.
 *                Card points there.
 *   LinkedIn   — same: post body / description carries the link.
 *   universal  — fallback. Link in bio works everywhere with the
 *                highest friction (2 clicks: bio → link → form).
 *
 * Each module passes its own `defaultKeyword` (e.g. `n8n-explainer` →
 * "N8N", `presenter` → "GUIDE") and `defaultSubheadline` (the value
 * prop to show under the headline). The shared template fills in the
 * platform-correct headline + action; the module fills in the
 * value-prop subheadline. End users can override anything via the
 * request `endCard` payload.
 */

export type CtaPlatform = 'ig' | 'fb' | 'tiktok' | 'youtube' | 'linkedin' | 'universal';

export interface EndCardConfig {
  /** Render the card at all. Default: true when any other field is set. */
  enabled?: boolean;
  /** Picks the per-platform template. Default: `universal` (link in bio). */
  platform?: CtaPlatform;
  /**
   * Comment keyword, used by IG/FB templates only. The narrator says
   * "comment X to get the link"; `keyword` is X. Module passes its own
   * default (n8n-explainer → "N8N"); user can override per request.
   */
  keyword?: string;
  /** Override headline. Falls back to platform template + keyword. */
  headline?: string;
  /** Override subheadline. Falls back to module default → template default. */
  subheadline?: string;
  /** Override action button label. Falls back to platform template. */
  action?: string;
  /** Card duration in seconds. Default: 3. */
  durationSeconds?: number;
  /** Hex accent color for the action pill. Default: `#7c3aed`. */
  accentColor?: string;
  /** Hex card background. Default: `#09090f`. */
  backgroundColor?: string;
}

export interface CtaTemplate {
  readonly headline: string;
  readonly subheadline: string;
  readonly action: string;
}

interface PlatformTemplates {
  readonly pl: (keyword: string) => CtaTemplate;
  readonly en: (keyword: string) => CtaTemplate;
}

const TEMPLATES: Record<CtaPlatform, PlatformTemplates> = {
  ig: {
    pl: (kw) => ({
      headline: `Komentuj "${kw}"`,
      subheadline: 'Wyślę Ci link w DM',
      action: '↓ Komentarz pod rolką',
    }),
    en: (kw) => ({
      headline: `Comment "${kw}"`,
      subheadline: "I'll DM you the link",
      action: '↓ Comment below',
    }),
  },
  fb: {
    pl: (kw) => ({
      headline: `Komentuj "${kw}"`,
      subheadline: 'Wyślę Ci link w wiadomości',
      action: '↓ Komentarz pod postem',
    }),
    en: (kw) => ({
      headline: `Comment "${kw}"`,
      subheadline: "I'll send you the link",
      action: '↓ Comment below',
    }),
  },
  tiktok: {
    pl: () => ({
      headline: 'Link w bio',
      subheadline: 'Wszystko w moim profilu',
      action: '↓ Mój profil',
    }),
    en: () => ({
      headline: 'Link in bio',
      subheadline: 'Everything in my profile',
      action: '↓ My profile',
    }),
  },
  youtube: {
    pl: () => ({
      headline: 'Link w opisie',
      subheadline: 'Sprawdź description poniżej',
      action: '↓ Description',
    }),
    en: () => ({
      headline: 'Link in description',
      subheadline: 'Check the description below',
      action: '↓ Description',
    }),
  },
  linkedin: {
    pl: () => ({
      headline: 'Link w opisie',
      subheadline: 'Szczegóły w treści posta',
      action: '↓ Sprawdź post',
    }),
    en: () => ({
      headline: 'Link in description',
      subheadline: 'Details in the post body',
      action: '↓ Check post',
    }),
  },
  universal: {
    pl: () => ({
      headline: 'Link w bio',
      subheadline: 'Wszystko w moim profilu',
      action: '↓ Mój profil',
    }),
    en: () => ({
      headline: 'Link in bio',
      subheadline: 'Everything in my profile',
      action: '↓ My profile',
    }),
  },
};

function pickLanguage(language: string | undefined): 'pl' | 'en' {
  return language && language.toLowerCase().startsWith('en') ? 'en' : 'pl';
}

export function getCtaTemplate(
  platform: CtaPlatform,
  language: string | undefined,
  opts: { keyword?: string } = {}
): CtaTemplate {
  const lang = pickLanguage(language);
  // Default keyword is intentionally generic ("INFO" / "INFO"). Modules
  // pass their own (e.g. "N8N"); without a module default we fall back
  // to "INFO" rather than crash on undefined.
  const keyword = opts.keyword ?? 'INFO';
  return TEMPLATES[platform][lang](keyword);
}

export interface ResolveEndCardOptions {
  /**
   * Module-level fallback keyword for IG/FB comment-DM templates when
   * the request doesn't set one. e.g. `n8n-explainer` passes `"N8N"`,
   * `presenter` passes `"GUIDE"`.
   */
  defaultKeyword?: string;
  /**
   * Module-level fallback subheadline (the "value prop" line). Used
   * when neither the request nor the platform template provides one
   * that fits the mode. e.g. `n8n-explainer` → "Postaw n8n u siebie".
   */
  defaultSubheadline?: string;
}

/**
 * Resolve the final end-card from a request `endCard` payload.
 *
 * Behaviour:
 * - `undefined` → returns `undefined` (no card rendered).
 * - `{ enabled: false }` → returns the disabled config (renderer skips).
 * - any other shape → fills missing copy from the per-platform template,
 *   honouring module-level defaults via `opts`.
 *
 * Modules call this in their `assemble-props` step so the same payload
 * shape works everywhere — `endCard: { platform: 'tiktok' }` produces
 * the right copy regardless of which mode (n8n-explainer / slideshow /
 * presenter / …) is rendering.
 */
export function resolveEndCard(
  ec: EndCardConfig | undefined,
  language: string | undefined,
  opts: ResolveEndCardOptions = {}
): EndCardConfig | undefined {
  if (!ec) return undefined;
  if (ec.enabled === false) return ec;

  const platform: CtaPlatform = ec.platform ?? 'universal';
  const keyword = ec.keyword ?? opts.defaultKeyword;
  const template = getCtaTemplate(platform, language, { keyword });

  return {
    enabled: ec.enabled ?? true,
    platform: ec.platform,
    keyword: ec.keyword,
    headline: ec.headline ?? template.headline,
    subheadline: ec.subheadline ?? opts.defaultSubheadline ?? template.subheadline,
    action: ec.action ?? template.action,
    durationSeconds: ec.durationSeconds ?? 3,
    accentColor: ec.accentColor ?? '#7c3aed',
    backgroundColor: ec.backgroundColor ?? '#09090f',
  };
}
