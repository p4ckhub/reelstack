/**
 * Split audio file into segments by time ranges.
 * Uses ffmpeg -ss/-t for sample-accurate cutting.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface AudioSegment {
  startTime: number;
  endTime: number;
}

export interface SplitResult {
  /** Path to the audio fragment */
  path: string;
  /** Original segment timing */
  startTime: number;
  endTime: number;
  /** Duration in seconds */
  durationSeconds: number;
}

/**
 * Split an audio file into fragments based on time ranges.
 * Each fragment is written as a separate MP3 file.
 *
 * @param audioPath - Path to source audio file (MP3, WAV, etc.)
 * @param segments - Array of { startTime, endTime } in seconds
 * @param outputDir - Directory for output files (default: temp dir)
 * @returns Array of SplitResult with paths to audio fragments
 */
export function splitAudioByTimings(
  audioPath: string,
  segments: readonly AudioSegment[],
  outputDir?: string
): SplitResult[] {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const outDir = outputDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'audio-split-'));
  fs.mkdirSync(outDir, { recursive: true });

  const results: SplitResult[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const duration = seg.endTime - seg.startTime;
    if (duration <= 0) continue;

    const outputPath = path.join(outDir, `segment-${String(i).padStart(3, '0')}.mp3`);

    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-ss',
        String(seg.startTime),
        '-t',
        String(duration),
        '-i',
        audioPath,
        '-acodec',
        'libmp3lame',
        '-q:a',
        '2',
        outputPath,
      ],
      { stdio: 'pipe', timeout: 30_000 }
    );

    if (!fs.existsSync(outputPath)) {
      throw new Error(`Failed to create audio segment ${i} at ${outputPath}`);
    }

    results.push({
      path: outputPath,
      startTime: seg.startTime,
      endTime: seg.endTime,
      durationSeconds: duration,
    });
  }

  return results;
}
