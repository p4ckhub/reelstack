import { describe, test, expect, beforeEach } from 'vitest';
import { registerPersona, getPersona, listPersonas } from '../config/personas';

describe('persona registry', () => {
  beforeEach(() => {
    // Register a test persona
    registerPersona({
      id: 'test-persona',
      name: 'Test Persona',
      avatarPrompt: 'A test character for unit testing',
      scenery: 'white void',
      narrationStyle: 'Neutral and factual.',
      anchorTag: '@TestPersona',
      defaultVoice: 'en-US-GuyNeural',
      defaultLayout: 'fullscreen',
      avatarFraming: 'centered',
    });
  });

  test('registerPersona and getPersona round-trip', () => {
    const persona = getPersona('test-persona');
    expect(persona).toBeDefined();
    expect(persona!.name).toBe('Test Persona');
    expect(persona!.avatarFraming).toBe('centered');
  });

  test('getPersona returns undefined for unknown ID', () => {
    expect(getPersona('nonexistent')).toBeUndefined();
  });

  test('listPersonas includes registered personas', () => {
    const all = listPersonas();
    expect(all.length).toBeGreaterThanOrEqual(1);
    const ids = all.map((p) => p.id);
    expect(ids).toContain('test-persona');
  });

  test('registerPersona overwrites existing persona', () => {
    registerPersona({
      id: 'test-persona',
      name: 'Updated Name',
      avatarPrompt: 'updated prompt',
      scenery: 'updated scenery',
      narrationStyle: 'Updated style.',
      anchorTag: '@Updated',
    });
    expect(getPersona('test-persona')!.name).toBe('Updated Name');
  });

  test('persona has all required fields', () => {
    const persona = getPersona('test-persona')!;
    expect(persona.id).toBeTruthy();
    expect(persona.name).toBeTruthy();
    expect(persona.avatarPrompt).toBeTruthy();
    expect(persona.scenery).toBeTruthy();
    expect(persona.narrationStyle).toBeTruthy();
    expect(persona.anchorTag).toBeTruthy();
  });
});
