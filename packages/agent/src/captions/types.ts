/**
 * Caption preset = the visual look + animation of word-level karaoke
 * captions in the HF runtime. Same registry pattern as HF cards: public
 * ships the dispatcher + a baseline, private overlay registers premium
 * presets via side-effect import.
 */

export interface CaptionPresetInput {
  /** Hex colour for already-spoken words. */
  readonly fontColor: string;
  /** Hex colour for the currently-active word. */
  readonly highlightColor: string;
  /** Hex colour for not-yet-spoken words. Falls back to fontColor when omitted. */
  readonly upcomingColor?: string;
  /** Caption font size in CSS px. */
  readonly fontSize: number;
}

export interface CaptionPresetBlock {
  /**
   * CSS rules injected into the composition's `<head>`. Selectors
   * target `#captions .word`, `.word--past`, `.word--active`,
   * `.word--upcoming`. Should NOT include the surrounding `<style>` tag
   * — the dispatcher wraps it.
   */
  readonly css: string;
  /**
   * Optional GSAP timeline JS injected after spans are created. Has
   * access to `tl` (the master timeline), `cuesData` (parsed cues
   * array), and `document` queries against `.word`/`#cue-N-w-M`.
   * Use to add scale/transform tweens that pure CSS can't drive
   * (e.g. pop-word bounce, hormozi scale on active).
   */
  readonly timelineJs?: string;
}

export type CaptionPresetBuilder = (input: CaptionPresetInput) => CaptionPresetBlock;
