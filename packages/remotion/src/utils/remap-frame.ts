/**
 * Remaps a global frame to a video-source frame based on speed ramp segments.
 *
 * Without speed ramps, frame N maps to video frame N (1:1).
 * With speed ramps, during a segment with rate=2x, video advances 2 frames per composition frame.
 * During rate=0.5x, video advances 0.5 frames per composition frame.
 *
 * @param globalFrame - Current composition frame
 * @param fps - Frames per second
 * @param speedRamps - Array of {startTime, endTime, rate} segments (sorted by startTime)
 * @returns The remapped frame number for the video source
 */
export function remapFrame(
  globalFrame: number,
  fps: number,
  speedRamps: readonly { startTime: number; endTime: number; rate: number }[],
): number {
  if (globalFrame < 0) return 0;
  if (speedRamps.length === 0) return globalFrame;

  // Walk through time, accumulating video frames at varying rates
  let videoFrame = 0;
  let lastBoundary = 0;

  // Sort by startTime for safety
  const sorted = [...speedRamps].sort((a, b) => a.startTime - b.startTime);

  const currentTime = globalFrame / fps;

  for (const ramp of sorted) {
    const rampStartFrame = ramp.startTime * fps;
    const rampEndFrame = ramp.endTime * fps;

    if (currentTime <= ramp.startTime) {
      // Haven't reached this ramp yet - add remaining at rate 1x
      break;
    }

    // Frames before this ramp (at rate 1x)
    const gapFrames = rampStartFrame - lastBoundary;
    if (gapFrames > 0) {
      videoFrame += gapFrames;
    }

    // Frames during this ramp
    const rampDuration = Math.min(globalFrame, rampEndFrame) - rampStartFrame;
    if (rampDuration > 0) {
      videoFrame += rampDuration * ramp.rate;
    }

    lastBoundary = rampEndFrame;

    if (globalFrame <= rampEndFrame) {
      return Math.round(videoFrame);
    }
  }

  // After all ramps, remaining frames at rate 1x
  const remaining = globalFrame - lastBoundary;
  if (remaining > 0) {
    videoFrame += remaining;
  }

  return Math.round(videoFrame);
}
