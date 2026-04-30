/**
 * Card types — mirror of the Remotion card contracts in
 * `@reelstack/remotion/cards`. Kept duplicated rather than imported to
 * keep the agent package free of React / Remotion runtime deps. Field
 * names match exactly so a port from a Remotion card to its HF builder
 * is mechanical (same `data`, same `palette`, same `mode`/`anchor`).
 */

export type CardMode =
  | 'cutaway'
  | 'overlay-top'
  | 'overlay-center'
  | 'overlay-corner'
  | 'cta-outro'
  | 'lower-third';

export type Anchor =
  | 'top-left'
  | 'top-right'
  | 'top-center'
  | 'center'
  | 'bottom-left'
  | 'bottom-right'
  | 'bottom-center';

export interface CardPalette {
  slug: string;
  accent: string;
  background: string;
  text: string;
  textMuted: string;
  glow?: string;
}

export interface CardData {
  headline?: string;
  subheadline?: string;
  action?: string;
  label?: string;
  [key: string]: string | undefined;
}

/**
 * Input for an HF card builder. Times are in seconds (HF is time-based,
 * not frame-based — Remotion's frame math gets converted at the boundary).
 */
export interface CardRenderInput {
  /** Slug of the card to build. */
  slug: string;
  /** When the card appears, on the host timeline. */
  cardStart: number;
  /** How long the card stays on screen. */
  cardDuration: number;
  /** Total host video duration (some cards align to it, e.g. cta-outro). */
  totalDuration: number;
  mode: CardMode;
  anchor?: Anchor;
  palette: CardPalette;
  data: CardData;
  /**
   * Unique selector / function-name suffix for this card instance.
   * Default: 'EndCard' (preserves existing host-composition wiring).
   * For multi-card demos, set per-slot — `card-shimmer-0`, `card-glitch-1`,
   * etc. Used to build a wrapper `id="<instanceId>"` and to register the
   * card's attach function on `window.__hfAttachCardInstances[<instanceId>]`.
   */
  instanceId?: string;
}

/**
 * What a per-card builder returns. The dispatcher wraps the HTML in a
 * scoped `<div id={instanceId} data-card-instance>` and emits a single
 * `<script>` block that registers the attach function under
 * `window.__hfAttachCardInstances[instanceId]`.
 */
export interface CardBlockOutput {
  /**
   * Inner HTML of the card (NO outer wrapper — dispatcher adds that).
   * IDs/classes used here MUST be scoped to a unique class so multiple
   * card instances on one timeline don't collide. Convention: every
   * selector in `attachScript` MUST be of the form
   * `#${instanceId} .card-<slug>__<part>` so the wrapper id scopes it.
   */
  html: string;
  /**
   * Body of the GSAP-attach function. Receives `tl` and `instanceId`
   * (already injected as JS variables in scope). All `tl.fromTo` /
   * `tl.to` calls go here. NO function declaration — just the body.
   */
  attachBody: string;
}

export type CardBuilder = (input: CardRenderInput) => CardBlockOutput;
