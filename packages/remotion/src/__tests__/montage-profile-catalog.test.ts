import { describe, it, expect } from 'vitest';
import {
  registerMontageProfile,
  getMontageProfile,
  listMontageProfiles,
  getMontageProfileCatalog,
  MONTAGE_PROFILE_CATALOG,
  type MontageProfileEntry,
  TRANSITION_CATALOG,
  SFX_CATALOG,
} from '../schemas/catalog';

describe('Montage profile registry', () => {
  it('has at least the default profile', () => {
    const profiles = listMontageProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(1);
    expect(profiles.find((p) => p.id === 'default')).toBeDefined();
  });

  it('getMontageProfile returns default profile', () => {
    const profile = getMontageProfile('default');
    expect(profile).toBeDefined();
    expect(profile!.name).toBe('Dynamic General');
  });

  it('getMontageProfile returns undefined for unknown id', () => {
    expect(getMontageProfile('nonexistent-profile-xyz')).toBeUndefined();
  });

  it('registerMontageProfile adds a new profile', () => {
    const testProfile: MontageProfileEntry = {
      id: '__test-profile__',
      name: 'Test Profile',
      description: 'For unit tests only',
      pacing: 'fast',
      maxShotDurationSec: 5,
      effectsPerThirtySec: 8,
      allowedTransitions: ['crossfade', 'none'],
      sfxMapping: { test: 'pop' },
      directorRules: ['Test rule'],
      topicKeywords: ['test'],
      toolPreference: ['pexels'],
      colorPalette: { accent: '#FF0000' },
    };
    registerMontageProfile(testProfile);
    expect(getMontageProfile('__test-profile__')).toEqual(testProfile);
  });

  it('getMontageProfileCatalog returns same as listMontageProfiles', () => {
    const list = listMontageProfiles();
    const catalog = getMontageProfileCatalog();
    expect(catalog).toEqual(list);
  });

  it('MONTAGE_PROFILE_CATALOG proxy works for backward compat', () => {
    expect(MONTAGE_PROFILE_CATALOG.length).toBeGreaterThanOrEqual(1);
    expect(MONTAGE_PROFILE_CATALOG.find((p) => p.id === 'default')).toBeDefined();
    expect(MONTAGE_PROFILE_CATALOG.map((p) => p.id)).toContain('default');
  });

  it('each profile has required fields', () => {
    for (const profile of listMontageProfiles()) {
      expect(profile.id).toBeTruthy();
      expect(profile.name).toBeTruthy();
      expect(profile.description).toBeTruthy();
      expect(profile.pacing).toBeTruthy();
      expect(profile.maxShotDurationSec).toBeGreaterThan(0);
      expect(profile.effectsPerThirtySec).toBeDefined();
      expect(profile.allowedTransitions.length).toBeGreaterThan(0);
      expect(Object.keys(profile.sfxMapping).length).toBeGreaterThan(0);
      expect(profile.directorRules.length).toBeGreaterThan(0);
    }
  });

  it('default profile allowedTransitions reference valid transition types', () => {
    const validTypes = TRANSITION_CATALOG.map((t) => t.type);
    const defaultProfile = getMontageProfile('default')!;
    for (const t of defaultProfile.allowedTransitions) {
      expect(validTypes).toContain(t);
    }
  });

  it('default profile sfxMapping values reference valid SFX IDs', () => {
    const validSfxIds = SFX_CATALOG.map((s) => s.id);
    const defaultProfile = getMontageProfile('default')!;
    for (const sfxId of Object.values(defaultProfile.sfxMapping)) {
      expect(validSfxIds).toContain(sfxId);
    }
  });

  it('default profile has topic keywords for auto-selection', () => {
    const defaultProfile = getMontageProfile('default')!;
    expect(defaultProfile.topicKeywords.length).toBeGreaterThan(0);
  });
});
