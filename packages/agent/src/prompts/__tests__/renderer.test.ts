import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../renderer';

describe('renderTemplate', () => {
  it('replaces variables with values', () => {
    const result = renderTemplate('Hello {{name}}, welcome to {{place}}!', {
      name: 'Paweł',
      place: 'ReelStack',
    });
    expect(result).toBe('Hello Paweł, welcome to ReelStack!');
  });

  it('resolves partials before variables', () => {
    const result = renderTemplate(
      '{{> header}}\n{{content}}',
      { content: 'Body text', title: 'My Title' },
      { header: '# {{title}}' }
    );
    expect(result).toBe('# My Title\nBody text');
  });

  it('replaces missing variables with empty string', () => {
    const result = renderTemplate('Hello {{name}}!', {});
    expect(result).toBe('Hello !');
  });

  it('marks missing partials', () => {
    const result = renderTemplate('{{> missing-partial}}', {}, {});
    expect(result).toBe('[MISSING PARTIAL: missing-partial]');
  });

  it('handles template with no placeholders', () => {
    const result = renderTemplate('Plain text, no placeholders.');
    expect(result).toBe('Plain text, no placeholders.');
  });

  it('handles multiple occurrences of the same variable', () => {
    const result = renderTemplate('{{x}} and {{x}} again', { x: 'foo' });
    expect(result).toBe('foo and foo again');
  });

  it('handles partial with spaces around name', () => {
    const result = renderTemplate('{{>  spaced  }}', {}, { spaced: 'OK' });
    expect(result).toBe('OK');
  });

  it('does not replace variables inside partial names', () => {
    // {{> name}} is a partial reference, not a variable
    const result = renderTemplate(
      '{{> my-partial}}',
      { 'my-partial': 'WRONG' },
      { 'my-partial': 'RIGHT' }
    );
    expect(result).toBe('RIGHT');
  });

  it('handles underscore in variable names', () => {
    const result = renderTemplate('{{tool_section}}', { tool_section: 'tools here' });
    expect(result).toBe('tools here');
  });

  it('preserves curly braces that are not template syntax', () => {
    const result = renderTemplate('JSON: {"key": "value"}', {});
    expect(result).toBe('JSON: {"key": "value"}');
  });

  it('handles multiline templates and partials', () => {
    const template = `Line 1
{{> rules}}
Line 3`;
    const partials = { rules: 'Rule A\nRule B' };
    const result = renderTemplate(template, {}, partials);
    expect(result).toBe('Line 1\nRule A\nRule B\nLine 3');
  });

  it('handles empty template', () => {
    expect(renderTemplate('', { x: 'y' }, { z: 'w' })).toBe('');
  });

  it('handles large variable values (prompt-sized)', () => {
    const bigValue = 'x'.repeat(10_000);
    const result = renderTemplate('{{big}}', { big: bigValue });
    expect(result).toBe(bigValue);
  });

  it('chains partials containing variables correctly', () => {
    const result = renderTemplate(
      '{{> wrapper}}',
      { name: 'World' },
      { wrapper: 'Hello {{name}}!' }
    );
    expect(result).toBe('Hello World!');
  });
});
