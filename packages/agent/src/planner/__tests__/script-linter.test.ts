import { describe, expect, it } from 'vitest';
import { lintScript } from '../script-linter';

describe('lintScript — regression: cached bełkot from presenter run d4f59c5d', () => {
  it('flags both the duplicate Python intro AND the "Obserwuj po więcej tipów dla devów" CTA', () => {
    const report = lintScript({
      language: 'pl',
      hook: 'Trzy triki Pythona, które musisz znać',
      sections: [
        'Trzy triki w Pythonie, które zaoszczędzą ci czas.',
        'Numer jeden: f-stringi z wyrażeniami.',
        'Zamiast konkatenacji, wstawiasz zmienne prosto w string.',
      ],
      cta: 'Obserwuj po więcej tipów dla devów',
    });
    expect(report.passed).toBe(false);
    const rules = report.issues.map((i) => i.rule);
    expect(rules).toContain('duplicate-intro');
    expect(rules).toContain('pl-calque');
    // CTA has THREE separate calques: "Obserwuj po", "tipów", "devów"
    const ctaCalques = report.issues.filter((i) => i.rule === 'pl-calque' && i.field === 'cta');
    expect(ctaCalques.length).toBeGreaterThanOrEqual(3);
  });
});

describe('lintScript — duplicate intro', () => {
  it('flags hook ↔ section[0] paraphrase (Polish)', () => {
    const report = lintScript({
      language: 'pl',
      hook: 'Trzy triki Pythona, które musisz znać',
      sections: ['Trzy triki w Pythonie, które zaoszczędzą ci czas.', 'Numer jeden: f-stringi.'],
      cta: 'Więcej w bio.',
    });
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.rule === 'duplicate-intro')).toBe(true);
  });

  it('passes when section[0] drives into content', () => {
    const report = lintScript({
      language: 'pl',
      hook: 'Trzy triki Pythona, które musisz znać',
      sections: ['Numer jeden: f-stringi z wyrażeniami.', 'Numer dwa: list comprehensions.'],
      cta: 'Więcej w bio.',
    });
    expect(report.passed).toBe(true);
  });

  it('does not over-flag short generic openers like "Numer jeden"', () => {
    const report = lintScript({
      language: 'pl',
      hook: 'Pięć błędów junior dev',
      sections: ['Numer jeden: nie czytasz dokumentacji.', 'Numer dwa: brak testów.'],
      cta: 'Wpadnij na profil.',
    });
    expect(report.passed).toBe(true);
  });
});

describe('lintScript — Polish calques', () => {
  it('flags "Obserwuj po więcej" calque', () => {
    const report = lintScript({
      language: 'pl',
      hook: 'Trzy triki',
      sections: ['Numer jeden: x.', 'Numer dwa: y.'],
      cta: 'Obserwuj po więcej tipów.',
    });
    expect(report.passed).toBe(false);
    const calques = report.issues.filter((i) => i.rule === 'pl-calque');
    // Both "Obserwuj po" AND "tipów" should fire.
    expect(calques.length).toBeGreaterThanOrEqual(2);
    expect(calques.some((i) => /Follow for more/.test(i.message))).toBe(true);
  });

  it('flags "tipów dla devów" mixed PL/EN', () => {
    const report = lintScript({
      language: 'pl',
      sections: ['Trzy tipy dla devów.'],
    });
    expect(report.issues.filter((i) => i.rule === 'pl-calque').length).toBeGreaterThanOrEqual(2);
  });

  it('flags "robi sens"', () => {
    const report = lintScript({
      language: 'pl',
      sections: ['To rozwiązanie robi sens w produkcji.'],
    });
    expect(report.issues.some((i) => i.match === 'robi sens')).toBe(true);
  });

  it('does NOT flag English text when language is "en"', () => {
    const report = lintScript({
      language: 'en',
      hook: 'Three Python tricks',
      sections: ['Number one: f-strings with expressions.'],
      cta: 'Follow for more dev tips.',
    });
    expect(report.passed).toBe(true);
  });

  it('passes natural Polish CTA "Wpadnij na profil"', () => {
    const report = lintScript({
      language: 'pl',
      hook: 'Trzy triki Pythona',
      sections: ['Numer jeden: f-stringi.'],
      cta: 'Wpadnij na profil po więcej.',
    });
    expect(report.passed).toBe(true);
  });
});
