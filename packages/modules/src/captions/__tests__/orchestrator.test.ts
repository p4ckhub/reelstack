import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks (must be before imports) ──────────────────────────────

vi.mock('@reelstack/agent', () => ({
  renderVideo: vi.fn(),
  uploadVoiceover: vi.fn(),
  runTTSPipeline: vi.fn(),
  resolvePresetConfig: vi.fn(),
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }),
}));

vi.mock('@reelstack/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }),
}));

vi.mock('@reelstack/remotion/pipeline', () => ({
  normalizeAudioForWhisper: vi.fn(),
  getAudioDuration: vi.fn(),
  transcribeAudio: vi.fn(),
}));

vi.mock('@reelstack/transcription', () => ({
  groupWordsIntoCues: vi.fn(),
  alignWordsWithScript: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}));

// ── Imports ─────────────────────────────────────────────────────

import { produceCaptions, buildCaptionsProps } from '../orchestrator';
import {
  renderVideo,
  uploadVoiceover,
  runTTSPipeline,
  resolvePresetConfig,
} from '@reelstack/agent';
import {
  normalizeAudioForWhisper,
  getAudioDuration,
  transcribeAudio,
} from '@reelstack/remotion/pipeline';
import { groupWordsIntoCues } from '@reelstack/transcription';
import { execFileSync } from 'child_process';
import fs from 'fs';

// ── Helpers ─────────────────────────────────────────────────────

const sampleCues = [
  { id: '1', text: 'Hello world', startTime: 0, endTime: 2 },
  { id: '2', text: 'This is a test', startTime: 2, endTime: 5 },
];

const mockRenderResult = {
  outputPath: '/tmp/rendered-output.mp4',
  step: { name: 'Remotion render', durationMs: 1000, detail: '' },
};

// ── Setup ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default renderVideo mock — all paths end here
  (renderVideo as any).mockResolvedValue(mockRenderResult);

  // resolvePresetConfig default
  (resolvePresetConfig as any).mockReturnValue({
    animationStyle: 'word-highlight' as const,
    maxWordsPerCue: 6,
    maxDurationPerCue: 3,
  });
});

// ── Tests ───────────────────────────────────────────────────────

afterEach(() => {
  vi.restoreAllMocks();
});

describe('produceCaptions', () => {
  // ── Path A: cues provided, no script ─────────────────────────

  it('with cues and no script uses cues directly', async () => {
    const result = await produceCaptions({
      videoUrl: 'https://example.com/video.mp4',
      cues: sampleCues,
      highlightMode: 'pill',
    });

    // Should NOT call TTS or transcription pipelines
    expect(runTTSPipeline).not.toHaveBeenCalled();
    expect(uploadVoiceover).not.toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();

    // Should call renderVideo with props containing the provided cues
    expect(renderVideo).toHaveBeenCalledOnce();
    const renderArgs = (renderVideo as any).mock.calls[0]!;
    const props = renderArgs[0] as Record<string, unknown>;
    expect(props.compositionId).toBe('VideoClip');
    expect(props.cues).toEqual(sampleCues);
    expect(props.highlightMode).toBe('pill');
    // Duration derived from max cue endTime (5)
    expect(props.durationSeconds).toBe(5);

    expect(result.outputPath).toBe('/tmp/rendered-output.mp4');
    expect(result.durationSeconds).toBe(5);
  });

  // ── Path C: script provided → TTS pipeline ──────────────────

  it('with script runs TTS pipeline', async () => {
    const ttsCues = [{ id: 'tts-1', text: 'Generated caption', startTime: 0, endTime: 3 }];

    (runTTSPipeline as any).mockResolvedValue({
      voiceoverPath: '/tmp/voiceover.mp3',
      audioDuration: 3,
      transcriptionWords: [],
      cues: ttsCues,
      steps: [],
    });
    (uploadVoiceover as any).mockResolvedValue('https://r2.example.com/voiceover.mp3');

    const result = await produceCaptions({
      videoUrl: 'https://example.com/video.mp4',
      script: 'Generated caption',
      tts: { provider: 'edge-tts', voice: 'en-US-AriaNeural' },
    });

    // Should call TTS pipeline
    expect(runTTSPipeline).toHaveBeenCalledOnce();
    const ttsArgs = (runTTSPipeline as any).mock.calls[0]!;
    expect(ttsArgs[0]).toMatchObject({
      script: 'Generated caption',
      tts: { provider: 'edge-tts', voice: 'en-US-AriaNeural' },
    });

    // Should upload voiceover
    expect(uploadVoiceover).toHaveBeenCalledWith('/tmp/voiceover.mp3');

    // Should NOT call transcription/ffmpeg
    expect(execFileSync).not.toHaveBeenCalled();

    // Render should include voiceoverUrl
    const renderProps = (renderVideo as any).mock.calls[0]![0] as Record<string, unknown>;
    expect(renderProps.voiceoverUrl).toBe('https://r2.example.com/voiceover.mp3');
    expect(renderProps.cues).toEqual(ttsCues);

    expect(result.durationSeconds).toBe(3);
  });

  // ── Path B: transcribe mode (no cues, no script) ────────────

  it('transcribe mode extracts audio and transcribes', async () => {
    // Mock fetch for video download
    const fakeVideoBuffer = new ArrayBuffer(100);
    const mockResponse = {
      ok: true,
      status: 200,
      arrayBuffer: vi.fn().mockResolvedValue(fakeVideoBuffer),
    } as unknown as Response;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    // Mock fs.readFileSync for audio buffer read
    const fakeAudioBuffer = Buffer.alloc(32000); // ~1s of 16kHz PCM
    const readFileSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(fakeAudioBuffer);

    // Mock fs.writeFileSync to prevent actual file writes
    const writeFileSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    // Mock fs.mkdtempSync to return a predictable path
    const mkdtempSpy = vi.spyOn(fs, 'mkdtempSync').mockReturnValue('/tmp/reelstack-captions-test');

    // Mock fs.rmSync for cleanup
    const rmSyncSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});

    // Mock ffmpeg (execFileSync) — audio extraction
    (execFileSync as any).mockReturnValue(Buffer.alloc(0));

    // Mock audio pipeline functions
    (getAudioDuration as any).mockReturnValue(10);
    (normalizeAudioForWhisper as any).mockReturnValue(fakeAudioBuffer);

    const whisperWords = [
      { text: 'Hello', startTime: 0.5, endTime: 1.0 },
      { text: 'world', startTime: 1.0, endTime: 1.5 },
      { text: 'testing', startTime: 2.0, endTime: 2.8 },
    ];
    (transcribeAudio as any).mockResolvedValue({
      words: whisperWords,
      text: 'Hello world testing',
      duration: 10,
    });

    const transcribedCues = [
      {
        id: 'cue-1',
        text: 'Hello world',
        startTime: 0.62,
        endTime: 1.62,
        words: [
          { text: 'Hello', startTime: 0.62, endTime: 1.12 },
          { text: 'world', startTime: 1.12, endTime: 1.62 },
        ],
      },
      {
        id: 'cue-2',
        text: 'testing',
        startTime: 2.12,
        endTime: 2.92,
        words: [{ text: 'testing', startTime: 2.12, endTime: 2.92 }],
      },
    ];
    (groupWordsIntoCues as any).mockReturnValue(transcribedCues);

    const result = await produceCaptions({
      videoUrl: 'https://example.com/video.mp4',
      // No cues, no script → transcribe mode
      highlightMode: 'glow',
      whisper: { provider: 'cloudflare' },
    });

    // 1. Should download the video
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/video.mp4',
      expect.objectContaining({
        redirect: 'error',
      })
    );

    // 2. Should write downloaded video to disk
    expect(writeFileSpy).toHaveBeenCalledWith(
      '/tmp/reelstack-captions-test/source-video.mp4',
      expect.any(Buffer)
    );

    // 3. Should extract audio with ffmpeg
    expect(execFileSync).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-i', '/tmp/reelstack-captions-test/source-video.mp4']),
      expect.objectContaining({ stdio: 'pipe', timeout: 60_000 })
    );

    // 4. Should read extracted audio
    expect(readFileSpy).toHaveBeenCalledWith('/tmp/reelstack-captions-test/extracted-audio.wav');

    // 5. Should get audio duration
    expect(getAudioDuration).toHaveBeenCalledWith(fakeAudioBuffer, 'wav');

    // 6. Should normalize and transcribe
    expect(normalizeAudioForWhisper).toHaveBeenCalledWith(fakeAudioBuffer, 'wav');
    expect(transcribeAudio).toHaveBeenCalledWith(
      fakeAudioBuffer,
      expect.objectContaining({
        durationSeconds: 10,
      })
    );

    // 7. Should group words into cues (with Whisper offset applied)
    expect(groupWordsIntoCues).toHaveBeenCalledOnce();
    const groupArgs = (groupWordsIntoCues as any).mock.calls[0]!;
    // Verify Whisper offset was applied (0.12s added to each word)
    expect(groupArgs[0]![0]!.startTime).toBeCloseTo(0.62, 2);
    expect(groupArgs[0]![0]!.endTime).toBeCloseTo(1.12, 2);

    // 8. No voiceoverUrl in transcribe mode (keeps original audio)
    const renderProps = (renderVideo as any).mock.calls[0]![0] as Record<string, unknown>;
    expect(renderProps.voiceoverUrl).toBeUndefined();
    expect(renderProps.cues).toEqual(transcribedCues);
    expect(renderProps.highlightMode).toBe('glow');

    // 9. Should NOT call TTS pipeline
    expect(runTTSPipeline).not.toHaveBeenCalled();
    expect(uploadVoiceover).not.toHaveBeenCalled();

    // 10. Cleanup temp dir
    expect(rmSyncSpy).toHaveBeenCalledWith('/tmp/reelstack-captions-test', {
      recursive: true,
      force: true,
    });

    expect(result.outputPath).toBe('/tmp/rendered-output.mp4');
    expect(result.durationSeconds).toBe(10);
  });

  it('transcribe mode uses local path when videoUrl is not http', async () => {
    const fakeAudioBuffer = Buffer.alloc(32000);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(fakeAudioBuffer);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'mkdtempSync').mockReturnValue('/tmp/reelstack-captions-local');
    vi.spyOn(fs, 'rmSync').mockImplementation(() => {});

    (execFileSync as any).mockReturnValue(Buffer.alloc(0));
    (getAudioDuration as any).mockReturnValue(5);
    (normalizeAudioForWhisper as any).mockReturnValue(fakeAudioBuffer);
    (transcribeAudio as any).mockResolvedValue({ words: [], text: '', duration: 0 });
    (groupWordsIntoCues as any).mockReturnValue([]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await produceCaptions({
      videoUrl: '/local/path/video.mp4',
    });

    // Should NOT fetch — local path used directly
    expect(fetchSpy).not.toHaveBeenCalled();

    // ffmpeg should use the local path directly
    expect(execFileSync).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-i', '/local/path/video.mp4']),
      expect.any(Object)
    );
  });
});

// ── buildCaptionsProps edge cases ─────────────────────────────

describe('buildCaptionsProps edge cases', () => {
  it('defaults duration to 30 when cues array is empty', () => {
    const props = buildCaptionsProps({
      videoUrl: 'https://example.com/video.mp4',
      cues: [],
    });

    expect(props.durationSeconds).toBe(30);
    expect(props.clips[0]!.endTime).toBe(30);
  });

  it('applies default captionStyle values when captionStyle is undefined', () => {
    const props = buildCaptionsProps({
      videoUrl: 'https://example.com/video.mp4',
      cues: [],
    });

    expect(props.captionStyle).toEqual({
      fontSize: 64,
      fontColor: '#FFFFFF',
      highlightColor: '#FFD700',
      position: 80,
    });
  });

  it('merges partial captionStyle with defaults', () => {
    const props = buildCaptionsProps({
      videoUrl: 'https://example.com/video.mp4',
      cues: [{ id: '1', text: 'test', startTime: 0, endTime: 3 }],
      captionStyle: { fontSize: 48, highlightColor: '#FF0000' },
    });

    expect(props.captionStyle).toEqual({
      fontSize: 48,
      fontColor: '#FFFFFF',
      highlightColor: '#FF0000',
      position: 80,
    });
  });

  it('includes voiceoverUrl when provided', () => {
    const props = buildCaptionsProps({
      videoUrl: 'https://example.com/video.mp4',
      cues: [{ id: '1', text: 'test', startTime: 0, endTime: 3 }],
      voiceoverUrl: 'https://r2.example.com/voice.mp3',
    });

    expect(props.voiceoverUrl).toBe('https://r2.example.com/voice.mp3');
  });
});
