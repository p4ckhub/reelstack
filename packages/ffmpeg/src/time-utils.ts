/**
 * Convert seconds to SRT timestamp format: HH:MM:SS,mmm
 */
export function formatTime(seconds: number, format: 'srt' | 'ass' = 'srt'): string {
  if (seconds < 0) seconds = 0;

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  if (format === 'ass') {
    const cs = Math.round((seconds % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Parse SRT timestamp (HH:MM:SS,mmm) to seconds
 */
export function parseTime(timestamp: string): number {
  // Support both , and . as millisecond separator
  const normalized = timestamp.trim().replace(',', '.');
  const match = normalized.match(/^(\d+):(\d{2}):(\d{2})\.(\d{1,3})$/);

  if (!match) {
    throw new Error(`Invalid timestamp format: "${timestamp}"`);
  }

  const [, h, m, s, ms] = match;
  const milliseconds = ms.padEnd(3, '0');

  return (
    parseInt(h, 10) * 3600 +
    parseInt(m, 10) * 60 +
    parseInt(s, 10) +
    parseInt(milliseconds, 10) / 1000
  );
}

/**
 * Format seconds to human-readable display: M:SS or H:MM:SS
 */
export function formatDisplay(seconds: number): string {
  if (seconds < 0) seconds = 0;

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
