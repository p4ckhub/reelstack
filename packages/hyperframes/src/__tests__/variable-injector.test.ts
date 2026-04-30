import { describe, it, expect } from 'vitest';
import { injectVariables } from '../variable-injector';

describe('injectVariables', () => {
  it('replaces {{key}} placeholders with HTML-escaped values', () => {
    const template = '<h1>{{headline}}</h1>';
    const out = injectVariables(template, { headline: 'Hello <world>' });
    expect(out).toBe('<h1>Hello &lt;world&gt;</h1>');
  });

  it('tolerates whitespace inside placeholders', () => {
    const out = injectVariables('{{  headline  }}', { headline: 'Hi' });
    expect(out).toBe('Hi');
  });

  it('handles numbers and booleans by coercing to string', () => {
    const out = injectVariables('{{a}}-{{b}}', { a: 5, b: true });
    expect(out).toBe('5-true');
  });

  it('throws when a placeholder has no corresponding variable', () => {
    expect(() => injectVariables('{{missing}}', {})).toThrow(/missing/);
  });

  it('allows safe http(s) URLs in *Url / *Src keys without HTML-escaping', () => {
    const out = injectVariables('<img src="{{imageUrl}}" />', {
      imageUrl: 'https://example.com/pic.png?q=1&r=2',
    });
    expect(out).toContain('src="https://example.com/pic.png?q=1&r=2"');
  });

  it('rejects javascript: URIs in URL keys', () => {
    expect(() => injectVariables('{{imageUrl}}', { imageUrl: 'javascript:alert(1)' })).toThrow(
      /Unsafe URL/
    );
  });

  it('rejects relative paths in URL keys', () => {
    expect(() => injectVariables('{{videoSrc}}', { videoSrc: '../local/file.mp4' })).toThrow(
      /Unsafe URL/
    );
  });

  it('replaces the same placeholder multiple times', () => {
    const out = injectVariables('{{n}} and {{n}} again', { n: 'test' });
    expect(out).toBe('test and test again');
  });

  it('preserves non-placeholder HTML unchanged', () => {
    const template = '<div class="x" data-n="1">text</div>';
    const out = injectVariables(template, {});
    expect(out).toBe(template);
  });

  it('passes *Block / *Html keys through without escaping', () => {
    const block = '<div id="x" style="color:#fff">hi</div><script>foo();</script>';
    const out = injectVariables('<body>{{endCardBlock}}</body>', { endCardBlock: block });
    expect(out).toBe(`<body>${block}</body>`);
  });

  it('still escapes a key that does not match URL / Block / Html suffix', () => {
    const out = injectVariables('<p>{{title}}</p>', { title: '<x>' });
    expect(out).toBe('<p>&lt;x&gt;</p>');
  });
});
