import { describe, it, expect, beforeAll } from 'vitest';
import { buildProfileSupervisorChecks } from '../montage-profile';
import {
  getMontageProfile,
  registerMontageProfile,
  type MontageProfileEntry,
} from '@reelstack/remotion/catalog';

// ── Test profile factories ──────────────────────────────────

function makeTestProfile(
  overrides: Partial<MontageProfileEntry> & { id: string }
): MontageProfileEntry {
  return {
    name: overrides.id,
    description: `Test profile for ${overrides.id}`,
    pacing: 'fast',
    maxShotDurationSec: 4,
    effectsPerThirtySec: 10,
    allowedTransitions: ['crossfade', 'none'],
    sfxMapping: { 'text-appear': 'pop' },
    directorRules: ['Test rule'],
    topicKeywords: ['test'],
    toolPreference: ['pexels'],
    colorPalette: { accent: '#FF0000' },
    ...overrides,
  };
}

beforeAll(() => {
  // Register profiles that match the switch/case in buildPerProfileRejectionRules.
  // Only register if not already present (avoids overwriting real profiles if they exist).
  if (!getMontageProfile('cyber-retro')) {
    registerMontageProfile(
      makeTestProfile({
        id: 'cyber-retro',
        name: 'Cyber Retro',
        maxShotDurationSec: 4,
        allowedTransitions: ['zoom-in', 'whip-pan', 'flash-white', 'none'],
        directorRules: [
          'Visual change every 2-3s with jump-cut zooms.',
          'FORBIDDEN transitions: crossfade, blur-dissolve, slide-left, slide-right',
          'crt-overlay + chromatic-aberration full-reel.',
        ],
      })
    );
  }

  if (!getMontageProfile('clean-corporate')) {
    registerMontageProfile(
      makeTestProfile({
        id: 'clean-corporate',
        name: 'Clean Corporate',
        maxShotDurationSec: 1.5,
        allowedTransitions: ['crossfade', 'slide-left', 'zoom-in', 'blur-dissolve', 'flash-white'],
        directorRules: [
          'Visual change every 1-1.5s.',
          'FORBIDDEN transitions: none/hard-cut, glitch, wipe, slide-perspective-right',
          'parallax-screenshot with tiltMode 3d for screenshots.',
        ],
      })
    );
  }

  if (!getMontageProfile('ai-tool-showcase')) {
    registerMontageProfile(
      makeTestProfile({
        id: 'ai-tool-showcase',
        name: 'AI Tool Showcase',
        maxShotDurationSec: 5,
        allowedTransitions: ['crossfade', 'slide-left', 'zoom-in', 'blur-dissolve'],
        directorRules: [
          'Each tool gets max 3-5s of screen time.',
          'FORBIDDEN transitions: none/hard-cut, glitch, wipe',
          'Use png-overlay for tool logos.',
        ],
      })
    );
  }
});

// ── Existing tests ──────────────────────────────────────────

describe('buildProfileSupervisorChecks', () => {
  it('includes max shot duration for default profile', () => {
    const profile = getMontageProfile('default')!;
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('4s');
    expect(checks).toContain('REJECT');
  });

  it('includes allowed transitions whitelist', () => {
    const profile = getMontageProfile('default')!;
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('crossfade');
    expect(checks).toContain('NOT in this list');
  });

  it('includes effect density requirement', () => {
    const profile = getMontageProfile('default')!;
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('10'); // effectsPerThirtySec
  });

  it('includes director rules for review', () => {
    const profile = getMontageProfile('default')!;
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('Visual change every');
  });

  it('includes SFX mapping check', () => {
    const profile = getMontageProfile('default')!;
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('SFX');
    expect(checks).toContain('pop');
  });

  // ── Per-profile rejection rules ─────────────────────────────

  it('includes cyber-retro specific rejection rules', () => {
    const profile = getMontageProfile('cyber-retro')!;
    expect(profile).toBeDefined();
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('shot >4s without a zoom');
    expect(checks).toContain('glitch-transition');
    expect(checks).toContain('FORBIDDEN transitions');
  });

  it('includes clean-corporate specific rejection rules', () => {
    const profile = getMontageProfile('clean-corporate')!;
    expect(profile).toBeDefined();
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('segment >1.5s');
    expect(checks).toContain('50%');
    expect(checks).toContain('crossfade');
    expect(checks).toContain('FORBIDDEN transitions');
  });

  it('includes ai-tool-showcase specific rejection rules', () => {
    const profile = getMontageProfile('ai-tool-showcase')!;
    expect(profile).toBeDefined();
    const checks = buildProfileSupervisorChecks(profile);
    expect(checks).toContain('TOOL_REVIEW');
    expect(checks).toContain('5s');
    expect(checks).toContain('png-overlay');
    expect(checks).toContain('FORBIDDEN transitions');
  });

  it('includes forbidden transitions in supervisor checks', () => {
    // All three profiles have FORBIDDEN transitions in directorRules.
    // Verify they appear in the output via extractForbiddenTransitions.
    for (const id of ['cyber-retro', 'clean-corporate', 'ai-tool-showcase'] as const) {
      const profile = getMontageProfile(id)!;
      expect(profile).toBeDefined();
      const checks = buildProfileSupervisorChecks(profile);
      // extractForbiddenTransitions finds "FORBIDDEN transitions:" in directorRules
      // and buildProfileSupervisorChecks injects it with "= REJECT"
      expect(checks).toContain('FORBIDDEN transitions:');
      expect(checks).toContain('= REJECT');
    }
  });

  it('returns empty string for per-profile rules on unknown profile', () => {
    const unknownProfile = makeTestProfile({
      id: '__unknown-profile-test__',
      directorRules: ['Some generic rule'],
    });
    registerMontageProfile(unknownProfile);
    const checks = buildProfileSupervisorChecks(unknownProfile);
    // Should still have generic checks (shot duration, transitions, etc.)
    expect(checks).toContain('PROFILE-SPECIFIC CHECKS');
    // But no per-profile section headers like "cyber-retro Specific Checks"
    expect(checks).not.toContain('cyber-retro Specific Checks');
    expect(checks).not.toContain('clean-corporate Specific Checks');
    expect(checks).not.toContain('ai-tool-showcase Specific Checks');
  });
});
