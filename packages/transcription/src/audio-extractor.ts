/**
 * Audio Extractor - extracts audio from video files as PCM Float32Array.
 * Uses Web Audio API (no FFmpeg.wasm needed).
 * Inspired by OpenReel's transcription-service.ts:105-156.
 */

const TARGET_SAMPLE_RATE = 16000; // Whisper expects 16kHz

/**
 * Extract audio from a File or Blob as mono 16kHz Float32Array.
 */
export async function extractAudioFromFile(
  file: File | Blob,
  onProgress?: (msg: string) => void
): Promise<{ audio: Float32Array; sampleRate: number }> {
  onProgress?.('Decoding audio...');

  const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return resampleToMono(audioBuffer, onProgress);
  } finally {
    await audioContext.close();
  }
}

/**
 * Extract audio from an HTMLVideoElement or HTMLAudioElement.
 */
export async function extractAudioFromElement(
  element: HTMLVideoElement | HTMLAudioElement,
  onProgress?: (msg: string) => void
): Promise<{ audio: Float32Array; sampleRate: number }> {
  onProgress?.('Extracting audio from video...');

  // If the element has a src that's a blob URL, fetch it
  const response = await fetch(element.src, {
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
  });
  const blob = await response.blob();
  return extractAudioFromFile(blob, onProgress);
}

/**
 * Resample an AudioBuffer to mono 16kHz Float32Array.
 */
function resampleToMono(
  audioBuffer: AudioBuffer,
  onProgress?: (msg: string) => void
): { audio: Float32Array; sampleRate: number } {
  onProgress?.('Resampling audio to 16kHz mono...');

  const numSamples = Math.ceil((audioBuffer.length * TARGET_SAMPLE_RATE) / audioBuffer.sampleRate);

  // Mix down to mono
  const channelData = audioBuffer.getChannelData(0);
  let mono: Float32Array;

  if (audioBuffer.numberOfChannels > 1) {
    mono = new Float32Array(audioBuffer.length);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < audioBuffer.length; i++) {
        mono[i] += data[i] / audioBuffer.numberOfChannels;
      }
    }
  } else {
    mono = channelData;
  }

  // Simple linear interpolation resampling
  if (audioBuffer.sampleRate === TARGET_SAMPLE_RATE) {
    return { audio: mono, sampleRate: TARGET_SAMPLE_RATE };
  }

  const resampled = new Float32Array(numSamples);
  const ratio = audioBuffer.sampleRate / TARGET_SAMPLE_RATE;

  for (let i = 0; i < numSamples; i++) {
    const srcIndex = i * ratio;
    const lower = Math.floor(srcIndex);
    const upper = Math.min(lower + 1, mono.length - 1);
    const frac = srcIndex - lower;
    resampled[i] = mono[lower] * (1 - frac) + mono[upper] * frac;
  }

  return { audio: resampled, sampleRate: TARGET_SAMPLE_RATE };
}

/**
 * Convert Float32Array PCM to WAV Blob (for cloud providers that need a file).
 * Inspired by OpenReel's transcription-service.ts:158-203.
 */
export function pcmToWavBlob(pcm: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // WAV header
  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // PCM data
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
