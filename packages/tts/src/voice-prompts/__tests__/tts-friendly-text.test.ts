import { describe, it, expect } from 'vitest';
import { phoneticizeAcronyms, spellOutNumbers, makeTTSFriendly } from '../index';

describe('phoneticizeAcronyms', () => {
  it('rewrites well-known tech acronyms in Polish text', () => {
    const out = phoneticizeAcronyms('Wywołaj API z URL i sparsuj JSON.', 'pl');
    expect(out).toBe('Wywołaj a-pi z u-er-el i sparsuj dżejson.');
  });

  it('handles n8n specifically (mixed letter+digit)', () => {
    const out = phoneticizeAcronyms('Workflow w n8n jest świetny.', 'pl');
    expect(out).toBe('Workflow w en-osiem-en jest świetny.');
  });

  it('respects word boundaries — does not touch substrings', () => {
    const out = phoneticizeAcronyms('rapid prototyping with API', 'pl');
    // "rapid" stays untouched even though it contains "rap"
    expect(out).toContain('rapid');
    expect(out).toContain('a-pi');
  });

  it('passes English text through unchanged', () => {
    const text = 'Call the API with a URL and parse JSON.';
    expect(phoneticizeAcronyms(text, 'en')).toBe(text);
    expect(phoneticizeAcronyms(text, 'en-US')).toBe(text);
  });

  it('handles pl-PL locale', () => {
    expect(phoneticizeAcronyms('API', 'pl-PL')).toBe('a-pi');
  });
});

describe('spellOutNumbers', () => {
  it('leaves small numbers (≤50) numeric', () => {
    expect(spellOutNumbers('Mam 5 jabłek i 50 gruszek.', 'pl')).toBe('Mam 5 jabłek i 50 gruszek.');
  });

  it('spells out numbers > 50', () => {
    expect(spellOutNumbers('Sprzedałem 327 sztuk.', 'pl')).toContain('trzysta dwadzieścia siedem');
  });

  it('handles thousands with correct Polish declension', () => {
    expect(spellOutNumbers('To kosztuje 1500 dolarów.', 'pl')).toContain('tysiąc pięćset');
    expect(spellOutNumbers('Zarobił 2026 złotych.', 'pl')).toContain(
      'dwa tysiące dwadzieścia sześć'
    );
    expect(spellOutNumbers('Sprzedanych 5234 produktów.', 'pl')).toContain(
      'pięć tysięcy dwieście trzydzieści cztery'
    );
  });

  it('passes English text through unchanged', () => {
    const text = 'I sold 327 units last quarter for $1500.';
    expect(spellOutNumbers(text, 'en')).toBe(text);
  });
});

describe('makeTTSFriendly', () => {
  it('chains acronym + number transforms', () => {
    const out = makeTTSFriendly('Wywołaj API 327 razy w 2026 roku.', 'pl');
    expect(out).toContain('a-pi');
    expect(out).toContain('trzysta dwadzieścia siedem');
    expect(out).toContain('dwa tysiące dwadzieścia sześć');
  });

  it('is a no-op for English', () => {
    const text = 'Call the API 327 times in 2026.';
    expect(makeTTSFriendly(text, 'en')).toBe(text);
  });
});
