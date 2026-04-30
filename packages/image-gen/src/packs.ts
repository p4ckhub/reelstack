/**
 * Pack manifest type for grouping templates that ship together
 * (e.g. all webinar templates, or all TSA carousel templates).
 *
 * Packs live in their own repo or directory and are loaded by passing
 * `templatesDir` to renderToFile / render. The manifest is metadata
 * for marketplace listings, tier gating, and discovery — the renderer
 * itself only needs the dir path and template name.
 */

export type TierName = 'FREE' | 'SOLO' | 'PRO' | 'AGENCY';

export interface PackManifest {
  /** kebab-case unique id */
  slug: string;
  /** Human display name */
  name: string;
  /** One-line description (used in marketplace UI) */
  description: string;
  /** Absolute path to the directory containing this pack's *.html / *.js templates */
  templatesDir: string;
  /** Template slugs included in this pack (the *.html basenames) */
  templates: string[];
  /** Minimum tier required to use this pack. Omit for free packs. */
  requiredTier?: TierName;
  /** Optional hint about what brands this pack is designed for */
  brandHint?: string;
}
