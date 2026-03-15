import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syntheticTranscribe } from '../pipeline/transcribe';

describe('syntheticTranscribe', () => {
  it('distributes words proportionally by character length', () => {
    const result = syntheticTranscribe('Hello world', 2.0);

    expect(result.words).toHaveLength(2);
    expect(result.text).toBe('Hello world');
    expect(result.duration).toBe(2.0);

    // "Hello" (5 chars) and "world" (5 chars) should get equal time
    const [w1, w2] = result.words;
    expect(w1.text).toBe('Hello');
    expect(w2.text).toBe('world');

    const w1Duration = w1.endTime - w1.startTime;
    const w2Duration = w2.endTime - w2.startTime;
    expect(Math.abs(w1Duration - w2Duration)).toBeLessThan(0.01);
  });

  it('gives longer words more time', () => {
    const result = syntheticTranscribe('I automation', 3.0);

    const [short, long] = result.words;
    expect(short.text).toBe('I');
    expect(long.text).toBe('automation');

    const shortDuration = short.endTime - short.startTime;
    const longDuration = long.endTime - long.startTime;
    expect(longDuration).toBeGreaterThan(shortDuration * 3);
  });

  it('words are sequential with gaps', () => {
    const result = syntheticTranscribe('one two three four', 4.0);

    for (let i = 1; i < result.words.length; i++) {
      const prev = result.words[i - 1];
      const curr = result.words[i];
      // Each word starts after the previous one ends
      expect(curr.startTime).toBeGreaterThan(prev.endTime - 0.001);
    }
  });

  it('first word starts at 0', () => {
    const result = syntheticTranscribe('Hello world', 5.0);
    expect(result.words[0].startTime).toBe(0);
  });

  it('handles empty text', () => {
    const result = syntheticTranscribe('', 5.0);
    expect(result.words).toHaveLength(0);
    expect(result.duration).toBe(5.0);
  });

  it('handles single word', () => {
    const result = syntheticTranscribe('Hello', 2.0);
    expect(result.words).toHaveLength(1);
    expect(result.words[0].text).toBe('Hello');
    expect(result.words[0].startTime).toBe(0);
    expect(result.words[0].endTime).toBeGreaterThan(0);
  });

  it('handles multi-space and newlines', () => {
    const result = syntheticTranscribe('Hello   world\nnew  line', 4.0);
    expect(result.words).toHaveLength(4);
    expect(result.words.map((w) => w.text)).toEqual(['Hello', 'world', 'new', 'line']);
  });
});

describe('whisper.cpp token merging', () => {
  it('merges sub-word tokens into full words', async () => {
    // Import the internal parser via the module
    const mod = await import('../pipeline/transcribe');
    // We test through the exported parseWhisperCppJson
    const { parseWhisperCppJson } = mod as any;

    // Simulate whisper.cpp JSON: " C" + "ze" + "ść" + "!" + " Dz" + "isiaj"
    const json = {
      transcription: [{
        timestamps: { from: '00:00:00,000', to: '00:00:02,000' },
        offsets: { from: 0, to: 2000 },
        text: ' Cześć! Dzisiaj',
        tokens: [
          { text: '[_BEG_]', timestamps: { from: '0', to: '0' }, offsets: { from: 0, to: 0 } },
          { text: ' C', timestamps: { from: '0', to: '0' }, offsets: { from: 50, to: 50 } },
          { text: 'ze', timestamps: { from: '0', to: '0' }, offsets: { from: 160, to: 160 } },
          { text: 'ść', timestamps: { from: '0', to: '0' }, offsets: { from: 200, to: 380 } },
          { text: '!', timestamps: { from: '0', to: '0' }, offsets: { from: 380, to: 470 } },
          { text: ' Dz', timestamps: { from: '0', to: '0' }, offsets: { from: 530, to: 590 } },
          { text: 'isiaj', timestamps: { from: '0', to: '0' }, offsets: { from: 710, to: 930 } },
        ],
      }],
    };

    const result = parseWhisperCppJson(json);
    expect(result.words.map((w: any) => w.text)).toEqual(['Cześć!', 'Dzisiaj']);
    expect(result.words[0].startTime).toBeCloseTo(0.05);
    expect(result.words[0].endTime).toBeCloseTo(0.47);
    expect(result.words[1].startTime).toBeCloseTo(0.53);
    expect(result.words[1].endTime).toBeCloseTo(0.93);
  });

  it('handles " ur" + "uch" + "omi" + "ć" → "uruchomić"', async () => {
    const { parseWhisperCppJson } = await import('../pipeline/transcribe') as any;
    const json = {
      transcription: [{
        timestamps: { from: '0', to: '0' },
        offsets: { from: 0, to: 2500 },
        text: ' jak uruchomić',
        tokens: [
          { text: ' jak', timestamps: { from: '0', to: '0' }, offsets: { from: 1640, to: 1840 } },
          { text: ' ur', timestamps: { from: '0', to: '0' }, offsets: { from: 1840, to: 1870 } },
          { text: 'uch', timestamps: { from: '0', to: '0' }, offsets: { from: 2030, to: 2170 } },
          { text: 'omi', timestamps: { from: '0', to: '0' }, offsets: { from: 2170, to: 2370 } },
          { text: 'ć', timestamps: { from: '0', to: '0' }, offsets: { from: 2370, to: 2490 } },
        ],
      }],
    };

    const result = parseWhisperCppJson(json);
    expect(result.words.map((w: any) => w.text)).toEqual(['jak', 'uruchomić']);
  });
});

describe('transcribeAudio fallback', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Prevent whisper-cli from running on this machine
    vi.mock('child_process', async (importOriginal) => {
      const orig = await importOriginal<typeof import('child_process')>();
      return {
        ...orig,
        execFileSync: vi.fn(() => { throw new Error('not found'); }),
      };
    });
  });

  it('uses synthetic timing when no API key but text provided', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');

    const { transcribeAudio } = await import('../pipeline/transcribe');

    const fakeWav = Buffer.alloc(100);
    const result = await transcribeAudio(fakeWav, {
      text: 'Hello world test',
      durationSeconds: 3.0,
    });

    expect(result.words).toHaveLength(3);
    expect(result.text).toBe('Hello world test');
    expect(result.duration).toBe(3.0);
  });

  it('throws when no API key and no text', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');

    const { transcribeAudio } = await import('../pipeline/transcribe');

    const fakeWav = Buffer.alloc(100);
    await expect(transcribeAudio(fakeWav)).rejects.toThrow('Transcription requires');
  });
});
