/**
 * Media probing utilities (ffprobe + ffmpeg loudnorm).
 *
 * Used by Tier 0 quality gates to verify rendered output before
 * shipping to customers (codec/container/duration/loudness sanity).
 */
import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';

export interface ProbeStream {
  /** 'video' | 'audio' | 'subtitle' | 'data' (ffprobe codec_type) */
  codecType: string;
  /** Codec name (e.g. 'h264', 'aac', 'mov_text', 'webvtt') */
  codecName: string;
}

export interface ProbeResult {
  /** Container/format name (e.g. 'mov,mp4,m4a,3gp,3g2,mj2', 'matroska,webm') */
  formatName: string;
  /** Duration in seconds (parsed from format.duration) */
  durationSeconds: number;
  streams: ProbeStream[];
}

/**
 * Probe a media file with ffprobe -show_format -show_streams.
 *
 * @param mediaPath - Local file path (URLs are not supported; download first)
 * @throws if ffprobe is missing, file doesn't exist, or output is unparseable
 */
export function probeMedia(mediaPath: string): ProbeResult {
  if (!fs.existsSync(mediaPath)) {
    throw new Error(`Media file not found: ${mediaPath}`);
  }

  const stdout = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-print_format', 'json', mediaPath],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, encoding: 'utf8' }
  );

  const parsed = JSON.parse(stdout) as {
    format?: { format_name?: string; duration?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string }>;
  };

  const formatName = parsed.format?.format_name ?? '';
  const duration = Number.parseFloat(parsed.format?.duration ?? '');
  const streams: ProbeStream[] = (parsed.streams ?? []).map((s) => ({
    codecType: s.codec_type ?? '',
    codecName: s.codec_name ?? '',
  }));

  return {
    formatName,
    durationSeconds: Number.isFinite(duration) ? duration : 0,
    streams,
  };
}

/**
 * Measure integrated loudness (LUFS) of an audio file using ffmpeg loudnorm
 * filter in "print_format=json" mode (single-pass measurement).
 *
 * Returns `null` if the input is silent — loudnorm reports `-inf` LUFS for
 * silence and we can't parse it as a finite number.
 *
 * Reference: EBU R128 / broadcast standard target -14 to -16 LUFS.
 *
 * @param audioPath - Local file path to audio (or video with audio track)
 */
export function measureLufs(audioPath: string): number | null {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  // loudnorm prints JSON to stderr; we discard stdout.
  // Use spawnSync to capture stderr without throwing on non-zero exit
  // (loudnorm may exit 0 even when reporting -inf for silent input).
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      audioPath,
      '-af',
      'loudnorm=I=-16:LRA=11:TP=-1.5:print_format=json',
      '-f',
      'null',
      '-',
    ],
    { timeout: 60_000, encoding: 'utf8' }
  );

  if (result.error) {
    throw new Error(`ffmpeg loudnorm failed: ${result.error.message}`);
  }

  const stderr = result.stderr ?? '';

  // Find the JSON block (loudnorm prints it after measurement) — last `{...}` in stderr.
  const jsonStart = stderr.lastIndexOf('{');
  const jsonEnd = stderr.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error('Could not find loudnorm JSON block in ffmpeg output');
  }

  const json = stderr.slice(jsonStart, jsonEnd + 1);
  const parsed = JSON.parse(json) as { input_i?: string };
  const inputI = Number.parseFloat(parsed.input_i ?? '');

  return Number.isFinite(inputI) ? inputI : null;
}
