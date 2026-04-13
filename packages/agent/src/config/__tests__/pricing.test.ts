import { describe, it, expect } from 'vitest';
import {
  calculateLLMCost,
  calculateToolCost,
  calculateTTSCost,
  calculateWhisperCost,
} from '../pricing';

describe('calculateLLMCost', () => {
  it('calculates cost for claude-sonnet-4-6', () => {
    // 1000 input tokens at $3/1M + 500 output tokens at $15/1M
    const cost = calculateLLMCost('claude-sonnet-4-6', 1000, 500);
    expect(cost).toBeCloseTo((1000 * 3 + 500 * 15) / 1_000_000, 10);
    expect(cost).toBeCloseTo(0.0105, 5);
  });

  it('calculates cost for claude-opus-4-6', () => {
    const cost = calculateLLMCost('claude-opus-4-6', 10_000, 2_000);
    expect(cost).toBeCloseTo((10_000 * 5 + 2_000 * 25) / 1_000_000, 10);
    expect(cost).toBeCloseTo(0.1, 5);
  });

  it('calculates cost for gpt-4o', () => {
    const cost = calculateLLMCost('gpt-4o', 5_000, 1_000);
    expect(cost).toBeCloseTo((5_000 * 2.5 + 1_000 * 10) / 1_000_000, 10);
  });

  it('calculates cost for gpt-4o-mini', () => {
    const cost = calculateLLMCost('gpt-4o-mini', 100_000, 50_000);
    expect(cost).toBeCloseTo((100_000 * 0.15 + 50_000 * 0.6) / 1_000_000, 10);
  });

  it('calculates cost for OpenRouter model IDs', () => {
    const cost = calculateLLMCost('anthropic/claude-sonnet-4.6', 1_000, 500);
    expect(cost).toBeCloseTo((1_000 * 3 + 500 * 15) / 1_000_000, 10);
  });

  it('returns 0 for unknown model', () => {
    expect(calculateLLMCost('unknown-model', 1000, 500)).toBe(0);
  });

  it('returns 0 for 0 tokens', () => {
    expect(calculateLLMCost('claude-sonnet-4-6', 0, 0)).toBe(0);
  });

  it('handles very large token counts', () => {
    const cost = calculateLLMCost('claude-opus-4-6', 1_000_000, 500_000);
    // 1M input * $5/1M + 500K output * $25/1M = $5 + $12.5 = $17.5
    expect(cost).toBeCloseTo(17.5, 2);
  });
});

describe('calculateToolCost', () => {
  it('calculates per-second cost for exact match (kling)', () => {
    const cost = calculateToolCost('kling', 10);
    expect(cost).toBeCloseTo(0.1 * 10, 5);
  });

  it('calculates per-second cost for veo31-gemini', () => {
    const cost = calculateToolCost('veo31-gemini', 5);
    expect(cost).toBeCloseTo(0.2 * 5, 5);
  });

  it('returns per-request cost for pexels (free)', () => {
    expect(calculateToolCost('pexels')).toBe(0);
  });

  it('returns per-request cost for nanobanana', () => {
    expect(calculateToolCost('nanobanana')).toBe(0.01);
  });

  it('falls back to provider suffix when no exact match (kling-piapi -> piapi)', () => {
    const cost = calculateToolCost('kling-piapi', 10);
    // Falls back to 'piapi' which is $0.1/s
    expect(cost).toBeCloseTo(0.1 * 10, 5);
  });

  it('falls back to provider suffix for unknown-fal tool', () => {
    // 'unknown-fal' -> tries 'fal' suffix, but 'fal' is not in TOOL_PRICING
    // Actually let me check: 'kling-fal' IS in TOOL_PRICING
    // 'something-kling-fal' -> split('-').pop() = 'fal' -> no match
    // Let me use a real case: 'seedance-fal' is exact match
    // For fallback test: 'myseedance-fal' -> pop() = 'fal' -> not in TOOL_PRICING -> 0
    expect(calculateToolCost('myseedance-fal', 10)).toBe(0);
  });

  it('returns 0 for completely unknown tool', () => {
    expect(calculateToolCost('nonexistent-tool', 10)).toBe(0);
  });

  it('returns 0 for per-second tool when no duration provided', () => {
    // kling has perSecond pricing but no perRequest
    const cost = calculateToolCost('kling');
    expect(cost).toBe(0);
  });

  it('returns per-request cost for user-upload (free)', () => {
    expect(calculateToolCost('user-upload')).toBe(0);
  });

  it('handles 0 duration seconds', () => {
    expect(calculateToolCost('kling', 0)).toBe(0);
  });

  it('handles very large duration', () => {
    const cost = calculateToolCost('runway', 3600);
    expect(cost).toBeCloseTo(0.25 * 3600, 2);
  });
});

describe('calculateTTSCost', () => {
  it('returns 0 for edge-tts (free)', () => {
    expect(calculateTTSCost('edge-tts', 1000)).toBe(0);
  });

  it('calculates per-char cost for elevenlabs', () => {
    const cost = calculateTTSCost('elevenlabs', 500);
    expect(cost).toBeCloseTo(0.00003 * 500, 10);
  });

  it('calculates per-char cost for openai', () => {
    const cost = calculateTTSCost('openai', 1000);
    expect(cost).toBeCloseTo(0.000015 * 1000, 10);
  });

  it('returns 0 for unknown provider', () => {
    expect(calculateTTSCost('unknown-tts', 500)).toBe(0);
  });

  it('returns 0 for 0 chars', () => {
    expect(calculateTTSCost('elevenlabs', 0)).toBe(0);
  });

  it('handles very large char counts', () => {
    const cost = calculateTTSCost('elevenlabs', 1_000_000);
    expect(cost).toBeCloseTo(0.00003 * 1_000_000, 2);
    expect(cost).toBeCloseTo(30, 2);
  });
});

describe('calculateWhisperCost', () => {
  it('returns 0 for cloudflare (free)', () => {
    expect(calculateWhisperCost('cloudflare', 120)).toBe(0);
  });

  it('returns 0 for local (free)', () => {
    expect(calculateWhisperCost('local', 300)).toBe(0);
  });

  it('returns 0 for ollama (free)', () => {
    expect(calculateWhisperCost('ollama', 60)).toBe(0);
  });

  it('calculates per-minute cost for openrouter', () => {
    // 120 seconds = 2 minutes at $0.006/min = $0.012
    const cost = calculateWhisperCost('openrouter', 120);
    expect(cost).toBeCloseTo(0.006 * 2, 10);
  });

  it('returns 0 for unknown provider', () => {
    expect(calculateWhisperCost('unknown-whisper', 60)).toBe(0);
  });

  it('handles 0 duration', () => {
    expect(calculateWhisperCost('openrouter', 0)).toBe(0);
  });

  it('handles fractional durations', () => {
    // 30 seconds = 0.5 minutes
    const cost = calculateWhisperCost('openrouter', 30);
    expect(cost).toBeCloseTo(0.006 * 0.5, 10);
  });

  it('handles very large durations', () => {
    // 1 hour = 3600 seconds = 60 minutes
    const cost = calculateWhisperCost('openrouter', 3600);
    expect(cost).toBeCloseTo(0.006 * 60, 5);
    expect(cost).toBeCloseTo(0.36, 5);
  });
});
