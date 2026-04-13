import type { SubtitleCue } from '@reelstack/types';
import { formatTime, parseTime } from './time-utils';

/**
 * Parse SRT file content into subtitle cues
 */
export function parseSRT(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    // First line: index number
    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;

    // Second line: timestamps
    const timeParts = lines[1].split('-->');
    if (timeParts.length !== 2) continue;

    let startTime: number;
    let endTime: number;
    try {
      startTime = parseTime(timeParts[0].trim());
      endTime = parseTime(timeParts[1].trim());
    } catch {
      continue;
    }

    // Remaining lines: subtitle text
    const text = lines.slice(2).join('\n').trim();
    if (!text) continue;

    cues.push({
      id: crypto.randomUUID(),
      startTime,
      endTime,
      text,
    });
  }

  return cues;
}

/**
 * Format subtitle cues into SRT file content
 */
export function formatSRT(cues: SubtitleCue[]): string {
  const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);

  return sorted
    .map((cue, index) => {
      const start = formatTime(cue.startTime, 'srt');
      const end = formatTime(cue.endTime, 'srt');
      return `${index + 1}\n${start} --> ${end}\n${cue.text}`;
    })
    .join('\n\n');
}
