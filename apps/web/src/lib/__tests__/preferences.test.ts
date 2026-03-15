import { describe, it, expect } from 'vitest';
import { updatePreferencesSchema } from '../api/v1/schemas';

describe('updatePreferencesSchema', () => {
  it('accepts valid full preferences', () => {
    const result = updatePreferencesSchema.safeParse({
      brandPreset: {
        highlightColor: '#F59E0B',
        backgroundColor: '#0E0E12',
        captionPreset: 'bold-dark',
      },
      defaultLayout: 'fullscreen',
      defaultTtsProvider: 'edge-tts',
      defaultTtsVoice: 'en-US-GuyNeural',
      defaultTtsLanguage: 'en-US',
      defaultVideoStyle: 'dynamic',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (no changes)', () => {
    const result = updatePreferencesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial brandPreset', () => {
    const result = updatePreferencesSchema.safeParse({
      brandPreset: { highlightColor: '#FF0000' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid layout', () => {
    const result = updatePreferencesSchema.safeParse({
      defaultLayout: 'widescreen',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid ttsProvider', () => {
    const result = updatePreferencesSchema.safeParse({
      defaultTtsProvider: 'google',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid videoStyle', () => {
    const result = updatePreferencesSchema.safeParse({
      defaultVideoStyle: 'crazy',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid layouts', () => {
    for (const layout of ['fullscreen', 'split-screen', 'picture-in-picture']) {
      const result = updatePreferencesSchema.safeParse({ defaultLayout: layout });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid video styles', () => {
    for (const style of ['dynamic', 'calm', 'cinematic', 'educational']) {
      const result = updatePreferencesSchema.safeParse({ defaultVideoStyle: style });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid TTS providers', () => {
    for (const provider of ['edge-tts', 'elevenlabs', 'openai']) {
      const result = updatePreferencesSchema.safeParse({ defaultTtsProvider: provider });
      expect(result.success).toBe(true);
    }
  });
});
