/**
 * Shared card utilities — the two patterns that repeat in every card.
 * Keep this file tiny. When a helper is used by <2 cards, delete it.
 */

/**
 * True if the current frame falls inside the card's visible window.
 * Cards return `null` before startFrame and after startFrame + durationFrames.
 */
export function isCardVisible(frame: number, startFrame: number, durationFrames: number): boolean {
  return frame >= startFrame && frame < startFrame + durationFrames;
}

/**
 * Frame number relative to card start (0-based).
 * Always non-negative; callers should guard with isCardVisible first.
 */
export function getLocalFrame(frame: number, startFrame: number): number {
  return Math.max(0, frame - startFrame);
}
