/**
 * Detect language from explicit setting, TTS locale, or fallback.
 * Handles edge cases: empty string, undefined, no dash in locale.
 */
export function detectLanguage(explicit?: string, ttsLocale?: string, fallback = 'en'): string {
  if (explicit) return explicit;
  if (ttsLocale) {
    const lang = ttsLocale.split('-')[0];
    if (lang) return lang;
  }
  return fallback;
}
