import { describe, test, expect } from 'vitest';
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { probeMedia, measureLufs } from './probe';

let ffmpegAvailable = false;
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  execSync('ffprobe -version', { stdio: 'ignore' });
  ffmpegAvailable = true;
} catch {
  /* ffmpeg/ffprobe not installed — skip integration suite */
}
const describeIf = ffmpegAvailable ? describe : describe.skip;

function makeTone(opts: {
  durationSeconds: number;
  frequency?: number;
  amplitude?: number;
  ext?: 'mp3' | 'wav';
}): string {
  const { durationSeconds, frequency = 440, amplitude = 0.5, ext = 'wav' } = opts;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-test-'));
  const out = path.join(tmp, `tone.${ext}`);
  // -filter_complex lets us scale amplitude (volume filter) so we can test
  // loud / quiet / silent inputs independently of frequency.
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${frequency}:duration=${durationSeconds}`,
      '-af',
      `volume=${amplitude}`,
      out,
    ],
    { stdio: 'pipe', timeout: 15_000 }
  );
  return out;
}

function makeSilence(durationSeconds: number, ext: 'mp3' | 'wav' = 'wav'): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-test-'));
  const out = path.join(tmp, `silence.${ext}`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `anullsrc=channel_layout=mono:sample_rate=44100`,
      '-t',
      String(durationSeconds),
      out,
    ],
    { stdio: 'pipe', timeout: 15_000 }
  );
  return out;
}

function makeMp4(durationSeconds: number): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-test-'));
  const out = path.join(tmp, 'video.mp4');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=black:s=320x240:d=${durationSeconds}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:duration=${durationSeconds}`,
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-shortest',
      out,
    ],
    { stdio: 'pipe', timeout: 30_000 }
  );
  return out;
}

describeIf('probeMedia', () => {
  test('returns codec/duration/format for mp4 with h264 + aac', () => {
    const file = makeMp4(2);
    const result = probeMedia(file);
    expect(result.formatName).toContain('mp4');
    expect(result.durationSeconds).toBeGreaterThan(1.5);
    expect(result.durationSeconds).toBeLessThan(3);
    const videoCodec = result.streams.find((s) => s.codecType === 'video')?.codecName;
    const audioCodec = result.streams.find((s) => s.codecType === 'audio')?.codecName;
    expect(videoCodec).toBe('h264');
    expect(audioCodec).toBe('aac');
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  test('throws on missing file', () => {
    expect(() => probeMedia('/nonexistent/file.mp4')).toThrow(/not found/i);
  });
});

describeIf('measureLufs', () => {
  test('returns finite LUFS for non-silent tone', () => {
    const file = makeTone({ durationSeconds: 4, amplitude: 0.5 });
    const lufs = measureLufs(file);
    expect(lufs).not.toBeNull();
    expect(Number.isFinite(lufs!)).toBe(true);
    // 0.5-amplitude 440Hz sine should land somewhere in normal speech/music range.
    expect(lufs!).toBeGreaterThan(-30);
    expect(lufs!).toBeLessThan(0);
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  test('returns null for silent input', () => {
    const file = makeSilence(3);
    const lufs = measureLufs(file);
    // loudnorm reports -inf for silence → we surface as null.
    expect(lufs).toBeNull();
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  test('throws on missing file', () => {
    expect(() => measureLufs('/nonexistent/file.wav')).toThrow(/not found/i);
  });
});
