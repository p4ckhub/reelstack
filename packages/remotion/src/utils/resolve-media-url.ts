import { staticFile } from 'remotion';

/**
 * Resolves a media URL for use in Remotion components.
 * - HTTP(S) URLs pass through unchanged
 * - Other strings are treated as filenames in public/ and resolved via staticFile()
 */
export function resolveMediaUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Absolute paths: extract filename only (e.g. /tmp/voiceover.mp3 → voiceover.mp3)
  // Relative paths: keep as-is (e.g. sfx/pop.mp3 → sfx/pop.mp3)
  if (url.startsWith('/')) {
    const filename = url.split('/').pop()!;
    return staticFile(filename);
  }
  return staticFile(url);
}
