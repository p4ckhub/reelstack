import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reviewScript, isScriptReviewEnabled } from '../script-reviewer';
import { getModel } from '../../config/models';
import type { ScriptReview } from '../script-reviewer';

describe('isScriptReviewEnabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns true by default when SCRIPT_REVIEW is not set', () => {
    delete process.env.SCRIPT_REVIEW;
    expect(isScriptReviewEnabled()).toBe(true);
  });

  it('returns true when SCRIPT_REVIEW is empty string', () => {
    process.env.SCRIPT_REVIEW = '';
    expect(isScriptReviewEnabled()).toBe(true);
  });

  it('returns true when SCRIPT_REVIEW is "true"', () => {
    process.env.SCRIPT_REVIEW = 'true';
    expect(isScriptReviewEnabled()).toBe(true);
  });

  it('returns false when SCRIPT_REVIEW is "false"', () => {
    process.env.SCRIPT_REVIEW = 'false';
    expect(isScriptReviewEnabled()).toBe(false);
  });

  it('returns false when SCRIPT_REVIEW is "FALSE"', () => {
    process.env.SCRIPT_REVIEW = 'FALSE';
    expect(isScriptReviewEnabled()).toBe(false);
  });

  it('returns false when SCRIPT_REVIEW is "0"', () => {
    process.env.SCRIPT_REVIEW = '0';
    expect(isScriptReviewEnabled()).toBe(false);
  });

  it('returns true for any other value', () => {
    process.env.SCRIPT_REVIEW = '1';
    expect(isScriptReviewEnabled()).toBe(true);
  });
});

describe('reviewScript', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Ensure we control which LLM provider is used
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns approved when no ANTHROPIC_API_KEY is set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await reviewScript('Some script about AI tools');
    expect(result.approved).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.suggestions).toEqual([]);
    expect(result.correctedScript).toBeUndefined();
  });

  it('returns approved when API returns an approved review', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const mockResponse: ScriptReview = {
      approved: true,
      issues: [],
      suggestions: [],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      }),
    } as Response);

    const result = await reviewScript('A perfectly accurate script');
    expect(result.approved).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('returns issues and corrected script when review finds problems', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const mockResponse = {
      approved: false,
      issues: ['n8n is an automation platform, not an AI tool'],
      suggestions: ['Replace "AI tools" with "automation tools" or remove n8n from the list'],
      correctedScript: 'Here are 5 automation tools that will change your workflow...',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      }),
    } as Response);

    const result = await reviewScript('Here are 5 AI tools: ChatGPT, n8n, Claude...');
    expect(result.approved).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain('n8n');
    expect(result.correctedScript).toBeDefined();
  });

  it('returns approved on API error (graceful degradation)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);

    const result = await reviewScript('Some script');
    expect(result.approved).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('returns approved on unparseable response (graceful degradation)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'This is not JSON at all' }],
      }),
    } as Response);

    const result = await reviewScript('Some script');
    expect(result.approved).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('sends the correct model from config', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.REVIEWER_MODEL;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: '{"approved": true, "issues": [], "suggestions": []}' }],
      }),
    } as Response);

    await reviewScript('Test script');

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.model).toBe(getModel('scriptReviewer', 'anthropic'));
  });

  it('respects REVIEWER_MODEL env var', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.REVIEWER_MODEL = 'claude-sonnet-4-6';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: '{"approved": true, "issues": [], "suggestions": []}' }],
      }),
    } as Response);

    await reviewScript('Test script');

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('treats approved=true with non-empty issues as not approved', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const mockResponse = {
      approved: true,
      issues: ['Minor factual error found'],
      suggestions: [],
      correctedScript: null,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      }),
    } as Response);

    const result = await reviewScript('Script with subtle error');
    expect(result.approved).toBe(false);
    expect(result.issues).toHaveLength(1);
  });

  it('handles null correctedScript from LLM', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const mockResponse = {
      approved: false,
      issues: ['Some issue'],
      suggestions: ['Fix it'],
      correctedScript: null,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      }),
    } as Response);

    const result = await reviewScript('Script');
    expect(result.approved).toBe(false);
    expect(result.correctedScript).toBeUndefined();
  });

  it('limits issues and suggestions arrays to 20 items', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const mockResponse = {
      approved: false,
      issues: Array.from({ length: 30 }, (_, i) => `Issue ${i + 1}`),
      suggestions: Array.from({ length: 30 }, (_, i) => `Suggestion ${i + 1}`),
      correctedScript: null,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      }),
    } as Response);

    const result = await reviewScript('Script with many issues');
    expect(result.issues).toHaveLength(20);
    expect(result.suggestions).toHaveLength(20);
  });
});
