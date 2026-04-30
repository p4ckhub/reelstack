import { describe, it, expect } from 'vitest';
import { buildVoicePrompt, getVoicePreset, VOICE_PRESETS } from '../index';
import type { VoiceUseCase } from '../index';

describe('buildVoicePrompt', () => {
  it('builds a 3-section prompt with the requested preset', () => {
    const { voicePrompt, recommendedVoice, preset } = buildVoicePrompt({
      useCase: 'tutorial-pl',
    });

    expect(recommendedVoice).toBe('Charon');
    expect(preset).toBe(VOICE_PRESETS['tutorial-pl']);
    expect(voicePrompt).toContain('AUDIO PROFILE');
    expect(voicePrompt).toContain('SCENE');
    expect(voicePrompt).toContain("DIRECTOR'S NOTES");
    expect(voicePrompt).toContain(preset.audioProfile);
    expect(voicePrompt).toContain(preset.scene);
    expect(voicePrompt).toContain(preset.directorsNotes);
  });

  it('honors per-section overrides', () => {
    const { voicePrompt } = buildVoicePrompt({
      useCase: 'slideshow',
      audioProfileOverride: 'Custom narrator profile',
      sceneOverride: 'Custom scene description',
      directorsNotesOverride: 'Custom notes',
    });

    expect(voicePrompt).toContain('Custom narrator profile');
    expect(voicePrompt).toContain('Custom scene description');
    expect(voicePrompt).toContain('Custom notes');
    expect(voicePrompt).not.toContain(VOICE_PRESETS.slideshow.audioProfile);
  });

  it("appends extraNotes after the preset Director's Notes", () => {
    const { voicePrompt } = buildVoicePrompt({
      useCase: 'n8n-explainer',
      extraNotes: 'Mention the workflow uses 5 nodes.',
    });

    expect(voicePrompt).toContain(unwrapLocalized(VOICE_PRESETS['n8n-explainer'].directorsNotes));
    expect(voicePrompt).toContain('Mention the workflow uses 5 nodes.');
    // extraNotes joined with a space, not a newline
    expect(voicePrompt).toMatch(/\. Mention the workflow uses 5 nodes\./);
  });

  it('preset use cases all have non-empty fields', () => {
    const useCases: VoiceUseCase[] = [
      'hook-reel',
      'tutorial-pl',
      'build-in-public',
      'long-form-course',
      'asmr-intimate',
      'hype-launch',
      'n8n-explainer',
      'slideshow',
    ];
    for (const uc of useCases) {
      const preset = getVoicePreset(uc);
      expect(preset.defaultVoice.length).toBeGreaterThan(0);
      expect(unwrapLocalized(preset.audioProfile).length).toBeGreaterThan(20);
      expect(preset.scene.length).toBeGreaterThan(20);
      expect(unwrapLocalized(preset.directorsNotes).length).toBeGreaterThan(20);
    }
  });
});

// Voice presets carry `audioProfile` and `directorsNotes` as a
// `LocalizedString` (string | {default, byLanguage}); these assertions
// only need to know the default text exists, so unwrap once and reuse.
function unwrapLocalized(value: string | { default: string }): string {
  return typeof value === 'string' ? value : value.default;
}
