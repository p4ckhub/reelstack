import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Converts an audio buffer (MP3/WAV/etc) to 16kHz mono WAV using FFmpeg.
 * Required for Whisper transcription.
 */
export function normalizeAudioForWhisper(audioBuffer: Buffer, inputFormat: string): Buffer {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-'));
  const inputPath = path.join(tmpDir, `input.${inputFormat}`);
  const outputPath = path.join(tmpDir, 'output.wav');

  try {
    fs.writeFileSync(inputPath, audioBuffer);
    execFileSync(
      'ffmpeg',
      ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-f', 'wav', outputPath],
      { stdio: 'pipe' }
    );
    return fs.readFileSync(outputPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Parses a WAV file buffer into Float32Array PCM data.
 * Assumes 16-bit PCM mono WAV (output of normalizeAudioForWhisper).
 */
export function wavToFloat32(wavBuffer: Buffer): { audio: Float32Array; sampleRate: number } {
  // WAV header: bytes 24-27 = sample rate, bytes 44+ = PCM data
  const sampleRate = wavBuffer.readUInt32LE(24);
  const bitsPerSample = wavBuffer.readUInt16LE(34);
  const dataOffset = 44; // Standard WAV header size

  if (bitsPerSample !== 16) {
    throw new Error(`Expected 16-bit PCM WAV, got ${bitsPerSample}-bit`);
  }

  const pcmData = wavBuffer.subarray(dataOffset);
  const numSamples = pcmData.length / 2; // 16-bit = 2 bytes per sample
  const audio = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    audio[i] = pcmData.readInt16LE(i * 2) / 32768;
  }

  return { audio, sampleRate };
}

/**
 * Gets duration of an audio file in seconds using ffprobe.
 */
export function getAudioDuration(audioBuffer: Buffer, format: string): number {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-'));
  const inputPath = path.join(tmpDir, `input.${format}`);

  try {
    fs.writeFileSync(inputPath, audioBuffer);
    const output = execFileSync(
      'ffprobe',
      ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', inputPath],
      { encoding: 'utf-8' }
    );
    return parseFloat(output.trim());
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
