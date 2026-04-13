import { describe, test, expect } from 'vitest';
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { extractLastFrame, extractFrameAt } from './video-frames';

let ffmpegAvailable = false;
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  ffmpegAvailable = true;
} catch {}
const describeIf = ffmpegAvailable ? describe : describe.skip;

// Generate a tiny 2s test video with ffmpeg
function createTestVideo(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-test-'));
  const videoPath = path.join(tmpDir, 'test.mp4');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=320x240:d=2',
      '-c:v',
      'libx264',
      '-t',
      '2',
      videoPath,
    ],
    { stdio: 'pipe', timeout: 10_000 }
  );
  return videoPath;
}

describeIf('video-frames', () => {
  let testVideo: string;

  test('extractLastFrame returns a JPEG file', () => {
    testVideo = createTestVideo();
    const framePath = extractLastFrame(testVideo);
    expect(fs.existsSync(framePath)).toBe(true);
    expect(fs.statSync(framePath).size).toBeGreaterThan(100);
    // JPEG magic bytes
    const header = fs.readFileSync(framePath).subarray(0, 2);
    expect(header[0]).toBe(0xff);
    expect(header[1]).toBe(0xd8);
    fs.unlinkSync(framePath);
    fs.unlinkSync(testVideo);
    fs.rmdirSync(path.dirname(testVideo));
  });

  test('extractFrameAt returns a JPEG at specific time', () => {
    testVideo = createTestVideo();
    const framePath = extractFrameAt(testVideo, 1.0);
    expect(fs.existsSync(framePath)).toBe(true);
    expect(fs.statSync(framePath).size).toBeGreaterThan(100);
    fs.unlinkSync(framePath);
    fs.unlinkSync(testVideo);
    fs.rmdirSync(path.dirname(testVideo));
  });

  test('extractLastFrame with custom output path', () => {
    testVideo = createTestVideo();
    const customPath = path.join(os.tmpdir(), `custom-frame-${Date.now()}.jpg`);
    const result = extractLastFrame(testVideo, customPath);
    expect(result).toBe(customPath);
    expect(fs.existsSync(customPath)).toBe(true);
    fs.unlinkSync(customPath);
    fs.unlinkSync(testVideo);
    fs.rmdirSync(path.dirname(testVideo));
  });

  test('extractLastFrame throws on invalid file', () => {
    expect(() => extractLastFrame('/nonexistent/video.mp4')).toThrow();
  });
});
