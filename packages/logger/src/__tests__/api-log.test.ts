/**
 * Unit tests for the api-log helpers — redaction, scrubbing, URL inference.
 *
 * Integration of the global fetch hook with a real sink is covered by the
 * pipeline tests in @reelstack/agent.
 */
import { describe, expect, it } from 'vitest';
import { inferCallMeta, redactHeaders, scrubPayload } from '../api-log';

describe('redactHeaders', () => {
  it('redacts sensitive header names (case-insensitive)', () => {
    const out = redactHeaders({
      Authorization: 'Bearer sk-123',
      'X-API-Key': 'abc',
      'Content-Type': 'application/json',
      Cookie: 'session=xxx',
    });
    expect(out.Authorization).toBe('[REDACTED]');
    expect(out['X-API-Key']).toBe('[REDACTED]');
    expect(out.Cookie).toBe('[REDACTED]');
    expect(out['Content-Type']).toBe('application/json');
  });

  it('handles Headers, Array, and Record inputs', () => {
    const fromRecord = redactHeaders({ 'x-api-key': 'a' });
    const fromArr = redactHeaders([['x-api-key', 'a']]);
    const fromHeaders = redactHeaders(new Headers({ 'x-api-key': 'a' }));
    expect(fromRecord['x-api-key']).toBe('[REDACTED]');
    expect(fromArr['x-api-key']).toBe('[REDACTED]');
    expect(fromHeaders['x-api-key']).toBe('[REDACTED]');
  });

  it('returns empty object for undefined input', () => {
    expect(redactHeaders(undefined)).toEqual({});
  });
});

describe('scrubPayload', () => {
  it('strips long base64 strings', () => {
    const b64 = 'A'.repeat(300);
    const out = scrubPayload({ image: b64 }) as { image: string };
    expect(out.image).toMatch(/^\[base64 stripped:/);
  });

  it('strips data URLs', () => {
    const dataUrl = 'data:image/png;base64,' + 'A'.repeat(300);
    const out = scrubPayload({ src: dataUrl }) as { src: string };
    expect(out.src).toMatch(/^\[data-url stripped:/);
  });

  it('truncates overlong plain strings', () => {
    // Spaces + non-base64 chars prevent this from tripping the base64 path.
    const long = 'żółć '.repeat(2200); // ~11000 chars, contains non-alphanumerics
    const out = scrubPayload({ prompt: long }) as { prompt: string };
    expect(out.prompt).toMatch(/\[truncated: \d+ chars total\]$/);
    expect(out.prompt.length).toBeLessThan(long.length);
  });

  it('keeps short strings intact', () => {
    expect(scrubPayload('hello')).toBe('hello');
    expect(scrubPayload({ a: 'b' })).toEqual({ a: 'b' });
  });

  it('walks arrays and objects recursively', () => {
    const b64 = 'A'.repeat(400);
    const input = { list: [{ nested: { img: b64 } }, 'ok'] };
    const out = scrubPayload(input) as { list: Array<{ nested: { img: string } } | string> };
    expect((out.list[0] as { nested: { img: string } }).nested.img).toMatch(/^\[base64 stripped:/);
    expect(out.list[1]).toBe('ok');
  });

  it('guards against pathological nesting', () => {
    type Nest = { n?: Nest };
    const obj: Nest = {};
    let cur = obj;
    for (let i = 0; i < 20; i++) {
      cur.n = {};
      cur = cur.n;
    }
    // Should not throw, should truncate at some level.
    const out = JSON.stringify(scrubPayload(obj));
    expect(out).toContain('truncated: depth');
  });
});

describe('inferCallMeta', () => {
  it('maps known LLM hosts', () => {
    expect(inferCallMeta('https://api.anthropic.com/v1/messages')).toEqual({
      provider: 'anthropic',
      kind: 'llm',
    });
    expect(inferCallMeta('https://api.openai.com/v1/chat/completions')).toEqual({
      provider: 'openai',
      kind: 'llm',
    });
    expect(inferCallMeta('https://openrouter.ai/api/v1/chat/completions')).toEqual({
      provider: 'openrouter',
      kind: 'llm',
    });
  });

  it('maps video/image generation hosts', () => {
    expect(inferCallMeta('https://api.heygen.com/v2/video/generate')).toEqual({
      provider: 'heygen',
      kind: 'asset-gen',
    });
    expect(inferCallMeta('https://api.kie.ai/api/v1/jobs/createTask')).toEqual({
      provider: 'kie',
      kind: 'asset-gen',
    });
    expect(inferCallMeta('https://queue.fal.run/fal-ai/flux-pro')).toEqual({
      provider: 'fal',
      kind: 'asset-gen',
    });
  });

  it('maps TTS and transcription hosts', () => {
    expect(inferCallMeta('https://api.elevenlabs.io/v1/text-to-speech/abc')).toEqual({
      provider: 'elevenlabs',
      kind: 'tts',
    });
  });

  it('falls back to hostname parsing for unknown hosts', () => {
    const out = inferCallMeta('https://api.example.net/v1/thing');
    expect(out.provider).toBe('example');
    expect(out.kind).toBe('other');
  });

  it('returns unknown for invalid URLs', () => {
    expect(inferCallMeta('not a url')).toEqual({ provider: 'unknown', kind: 'other' });
  });
});
