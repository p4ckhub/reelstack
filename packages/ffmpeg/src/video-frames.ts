/**
 * Video frame extraction utilities.
 * Used for character consistency (last-frame-as-reference between clips).
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Extract the last frame of a video as a JPEG image.
 * Uses ffmpeg -sseof to seek from end (fast, no full decode).
 *
 * @param videoPath - Local file path or URL to the video
 * @param outputPath - Where to save the frame (optional, defaults to temp file)
 * @returns Path to the extracted JPEG frame
 */
export function extractLastFrame(videoPath: string, outputPath?: string): string {
  const out = outputPath ?? path.join(os.tmpdir(), `last-frame-${Date.now()}.jpg`);

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-sseof',
      '-1', // seek to 1s before end
      '-i',
      videoPath,
      '-vframes',
      '1',
      '-q:v',
      '2', // high quality JPEG
      out,
    ],
    { stdio: 'pipe', timeout: 30_000 }
  );

  if (!fs.existsSync(out)) {
    throw new Error(`Failed to extract last frame from ${videoPath}`);
  }

  return out;
}

/**
 * Extract a frame at a specific timestamp.
 *
 * @param videoPath - Local file path or URL to the video
 * @param timestampSeconds - Time in seconds to extract frame at
 * @param outputPath - Where to save the frame (optional)
 * @returns Path to the extracted JPEG frame
 */
export function extractFrameAt(
  videoPath: string,
  timestampSeconds: number,
  outputPath?: string
): string {
  const out = outputPath ?? path.join(os.tmpdir(), `frame-${Date.now()}.jpg`);

  execFileSync(
    'ffmpeg',
    ['-y', '-ss', timestampSeconds.toFixed(3), '-i', videoPath, '-vframes', '1', '-q:v', '2', out],
    { stdio: 'pipe', timeout: 30_000 }
  );

  if (!fs.existsSync(out)) {
    throw new Error(`Failed to extract frame at ${timestampSeconds}s from ${videoPath}`);
  }

  return out;
}
