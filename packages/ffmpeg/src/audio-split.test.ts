import { describe, test, expect } from 'vitest';
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { splitAudioByTimings } from './audio-split';

let ffmpegAvailable = false;
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  ffmpegAvailable = true;
} catch {}
const describeIf = ffmpegAvailable ? describe : describe.skip;

function createTestAudio(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-split-test-'));
  const audioPath = path.join(tmpDir, 'test.mp3');
  // Generate 5s sine wave audio
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=5',
      '-acodec',
      'libmp3lame',
      '-q:a',
      '2',
      audioPath,
    ],
    { stdio: 'pipe', timeout: 10_000 }
  );
  return audioPath;
}

describeIf('splitAudioByTimings', () => {
  test('splits audio into segments', () => {
    const audioPath = createTestAudio();
    const results = splitAudioByTimings(audioPath, [
      { startTime: 0, endTime: 2 },
      { startTime: 2, endTime: 4 },
      { startTime: 4, endTime: 5 },
    ]);

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(fs.existsSync(r.path)).toBe(true);
      expect(fs.statSync(r.path).size).toBeGreaterThan(100);
    }
    expect(results[0].durationSeconds).toBe(2);
    expect(results[1].durationSeconds).toBe(2);
    expect(results[2].durationSeconds).toBe(1);

    // Cleanup
    for (const r of results) fs.unlinkSync(r.path);
    fs.unlinkSync(audioPath);
  });

  test('skips zero-duration segments', () => {
    const audioPath = createTestAudio();
    const results = splitAudioByTimings(audioPath, [
      { startTime: 1, endTime: 1 }, // zero duration
      { startTime: 1, endTime: 3 },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].startTime).toBe(1);
    expect(results[0].endTime).toBe(3);

    fs.unlinkSync(results[0].path);
    fs.unlinkSync(audioPath);
  });

  test('throws on nonexistent file', () => {
    expect(() => splitAudioByTimings('/nonexistent.mp3', [{ startTime: 0, endTime: 1 }])).toThrow();
  });

  test('writes to custom output dir', () => {
    const audioPath = createTestAudio();
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-out-'));
    const results = splitAudioByTimings(audioPath, [{ startTime: 0, endTime: 2 }], outDir);

    expect(results[0].path.startsWith(outDir)).toBe(true);

    fs.unlinkSync(results[0].path);
    fs.unlinkSync(audioPath);
    fs.rmdirSync(outDir);
  });
});
