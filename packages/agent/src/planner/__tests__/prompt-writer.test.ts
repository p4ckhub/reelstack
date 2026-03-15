import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writePrompt, isPromptWriterEnabled, getGuidelinesForTool } from '../prompt-writer';
import type { ShotBrief } from '../prompt-writer';
import {
  SEEDANCE_GUIDELINES,
  NANOBANANA_GUIDELINES,
  VEO3_GUIDELINES,
  KLING_GUIDELINES,
  HAILUO_GUIDELINES,
} from '../../tools/prompt-guidelines';

describe('isPromptWriterEnabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns true by default when PROMPT_WRITER is not set', () => {
    delete process.env.PROMPT_WRITER;
    expect(isPromptWriterEnabled()).toBe(true);
  });

  it('returns true when PROMPT_WRITER is empty string', () => {
    process.env.PROMPT_WRITER = '';
    expect(isPromptWriterEnabled()).toBe(true);
  });

  it('returns false when PROMPT_WRITER is "false"', () => {
    process.env.PROMPT_WRITER = 'false';
    expect(isPromptWriterEnabled()).toBe(false);
  });

  it('returns false when PROMPT_WRITER is "FALSE"', () => {
    process.env.PROMPT_WRITER = 'FALSE';
    expect(isPromptWriterEnabled()).toBe(false);
  });

  it('returns false when PROMPT_WRITER is "0"', () => {
    process.env.PROMPT_WRITER = '0';
    expect(isPromptWriterEnabled()).toBe(false);
  });

  it('returns true for any other value', () => {
    process.env.PROMPT_WRITER = 'true';
    expect(isPromptWriterEnabled()).toBe(true);
  });
});

describe('getGuidelinesForTool', () => {
  it('returns SEEDANCE_GUIDELINES for seedance tools', () => {
    expect(getGuidelinesForTool('seedance2-piapi')).toBe(SEEDANCE_GUIDELINES);
    expect(getGuidelinesForTool('seedance-kie')).toBe(SEEDANCE_GUIDELINES);
  });

  it('returns VEO3_GUIDELINES for veo tools', () => {
    expect(getGuidelinesForTool('veo31-gemini')).toBe(VEO3_GUIDELINES);
  });

  it('returns NANOBANANA_GUIDELINES for nanobanana tools', () => {
    expect(getGuidelinesForTool('nanobanana2-kie')).toBe(NANOBANANA_GUIDELINES);
  });

  it('returns NANOBANANA_GUIDELINES for flux tools', () => {
    expect(getGuidelinesForTool('flux-kie')).toBe(NANOBANANA_GUIDELINES);
    expect(getGuidelinesForTool('flux-piapi')).toBe(NANOBANANA_GUIDELINES);
  });

  it('returns KLING_GUIDELINES for kling tools', () => {
    expect(getGuidelinesForTool('kling-piapi')).toBe(KLING_GUIDELINES);
  });

  it('returns HAILUO_GUIDELINES for hailuo tools', () => {
    expect(getGuidelinesForTool('hailuo-piapi')).toBe(HAILUO_GUIDELINES);
  });

  it('returns SEEDANCE_GUIDELINES as default for unknown tools', () => {
    expect(getGuidelinesForTool('some-unknown-tool')).toBe(SEEDANCE_GUIDELINES);
  });
});

describe('writePrompt', () => {
  const originalEnv = process.env;

  const baseBrief: ShotBrief = {
    shotId: 'shot-1',
    description: 'Developer typing on mechanical keyboard, dark room, monitor glow on face',
    toolId: 'seedance2-piapi',
    assetType: 'ai-video',
    durationSeconds: 5,
    aspectRatio: '9:16',
    scriptSegment: 'Every developer needs this tool',
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns brief as-is when no API keys are set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const result = await writePrompt(baseBrief);
    expect(result).toBe(baseBrief.description);
  });

  it('calls OpenRouter with default promptWriter model', async () => {
    process.env.OPENROUTER_API_KEY = 'test-or-key';
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.PROMPT_WRITER_MODEL;

    const expandedPrompt =
      'Developer hunches over mechanical keyboard in dark room. Monitor glow illuminates face from front, cool blue cast. Medium close-up, locked shot, eye level. Low-key, digital clean.';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: expandedPrompt } }],
      }),
    } as Response);

    const result = await writePrompt(baseBrief);

    expect(result).toBe(expandedPrompt);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');

    const body = JSON.parse(opts!.body as string);
    expect(body.model).toBe('anthropic/claude-sonnet-4.6');
    expect(body.max_tokens).toBe(1024);
  });

  it('calls Anthropic when only ANTHROPIC_API_KEY is set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-ant-key';

    const expandedPrompt = 'Expanded prompt from Anthropic';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: expandedPrompt }],
      }),
    } as Response);

    const result = await writePrompt(baseBrief);

    expect(result).toBe(expandedPrompt);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');

    const body = JSON.parse(opts!.body as string);
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('injects correct guidelines per toolId into system prompt', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'expanded prompt' } }],
      }),
    } as Response);

    await writePrompt({ ...baseBrief, toolId: 'nanobanana2-kie', assetType: 'ai-image' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    const systemContent = body.messages[0].content;
    expect(systemContent).toContain('NanoBanana');
    expect(systemContent).toContain('Negative');
  });

  it('includes forbidden words list in system prompt', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'expanded' } }],
      }),
    } as Response);

    await writePrompt(baseBrief);

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    const systemContent = body.messages[0].content;
    expect(systemContent).toContain('cinematic');
    expect(systemContent).toContain('epic');
    expect(systemContent).toContain('masterpiece');
    expect(systemContent).toContain('stunning');
    expect(systemContent).toContain('NEVER use forbidden words');
  });

  it('returns brief on API error (graceful fallback)', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);

    const result = await writePrompt(baseBrief);
    expect(result).toBe(baseBrief.description);
  });

  it('returns brief on fetch exception (graceful fallback)', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await writePrompt(baseBrief);
    expect(result).toBe(baseBrief.description);
  });

  it('returns brief when response is empty', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '   ' } }],
      }),
    } as Response);

    const result = await writePrompt(baseBrief);
    expect(result).toBe(baseBrief.description);
  });

  it('respects PROMPT_WRITER_MODEL env var', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.PROMPT_WRITER_MODEL = 'anthropic/claude-haiku-4-5-20251001';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'expanded' } }],
      }),
    } as Response);

    await writePrompt(baseBrief);

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.model).toBe('anthropic/claude-haiku-4-5-20251001');
  });

  it('prefers OpenRouter when both keys are set', async () => {
    process.env.OPENROUTER_API_KEY = 'test-or-key';
    process.env.ANTHROPIC_API_KEY = 'test-ant-key';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'expanded' } }],
      }),
    } as Response);

    await writePrompt(baseBrief);

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('includes duration and aspect ratio in user message for video', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'expanded' } }],
      }),
    } as Response);

    await writePrompt(baseBrief);

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    const userContent = body.messages[1].content;
    expect(userContent).toContain('Duration: 5s');
    expect(userContent).toContain('Aspect ratio: 9:16');
    expect(userContent).toContain('video prompt');
  });

  it('includes "image prompt" text for ai-image shots', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'expanded' } }],
      }),
    } as Response);

    await writePrompt({
      ...baseBrief,
      assetType: 'ai-image',
      toolId: 'nanobanana2-kie',
      durationSeconds: undefined,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    const userContent = body.messages[1].content;
    expect(userContent).toContain('image prompt');
    expect(userContent).not.toContain('Duration:');
  });
});
