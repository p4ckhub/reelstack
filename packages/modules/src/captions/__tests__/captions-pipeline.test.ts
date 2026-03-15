import { describe, it, expect } from 'vitest';
import { createCaptionsPipeline } from '../captions-pipeline';
import type { CaptionsPipelineDeps } from '../captions-pipeline';

// Minimal stub deps - pipeline factory only builds definitions, doesn't execute
const stubDeps: CaptionsPipelineDeps = {
  extractAudio: async () => ({ audioPath: '/tmp/audio.wav' }),
  runWhisper: async () => ({ words: [], cues: [] }),
  runTTSPipeline: async () => ({
    voiceoverPath: '/tmp/voice.mp3',
    audioDuration: 10,
    transcriptionWords: [],
    cues: [],
    steps: [],
  }),
  buildCaptionsProps: () => ({
    clips: [],
    cues: [],
    durationSeconds: 10,
    backgroundColor: '#000000',
    captionStyle: { fontSize: 64, fontColor: '#FFFFFF', highlightColor: '#FFD700', position: 80 },
    musicVolume: 0,
  }),
  renderVideo: async () => ({ outputPath: '/tmp/out.mp4' }),
  uploadVoiceover: async () => 'https://r2.example.com/voice.mp3',
};

describe('captionsPipeline', () => {
  it('has correct pipeline id', () => {
    const pipeline = createCaptionsPipeline('transcribe', stubDeps);
    expect(pipeline.id).toBe('captions');
  });

  // Transcribe mode (no script, no cues)
  it('defines 4 steps for transcribe mode: extract-audio -> whisper -> build-props -> render', () => {
    const pipeline = createCaptionsPipeline('transcribe', stubDeps);
    expect(pipeline.steps).toHaveLength(4);
    expect(pipeline.steps.map((s) => s.id)).toEqual([
      'extract-audio',
      'whisper',
      'build-props',
      'render',
    ]);
  });

  // Script mode
  it('defines 4 steps for script mode: tts -> whisper -> build-props -> render', () => {
    const pipeline = createCaptionsPipeline('script', stubDeps);
    expect(pipeline.steps).toHaveLength(4);
    expect(pipeline.steps.map((s) => s.id)).toEqual(['tts', 'whisper', 'build-props', 'render']);
  });

  // Cues mode
  it('defines 2 steps for cues mode: build-props -> render', () => {
    const pipeline = createCaptionsPipeline('cues', stubDeps);
    expect(pipeline.steps).toHaveLength(2);
    expect(pipeline.steps.map((s) => s.id)).toEqual(['build-props', 'render']);
  });

  it('all step dependencies are valid', () => {
    for (const mode of ['transcribe', 'script', 'cues'] as const) {
      const pipeline = createCaptionsPipeline(mode, stubDeps);
      const stepIds = new Set(pipeline.steps.map((s) => s.id));
      for (const step of pipeline.steps) {
        for (const dep of step.dependsOn) {
          expect(stepIds.has(dep)).toBe(true);
        }
      }
    }
  });
});
