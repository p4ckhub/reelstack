/**
 * Test TTS script - generates speech audio from text.
 *
 * Usage:
 *   bun run tts:test "Cześć, to jest test"
 *   bun run tts:test "Hello world" --provider edge-tts --voice en-US-AriaNeural
 *   bun run tts:test "Test" --provider elevenlabs  (requires ELEVENLABS_API_KEY)
 *
 * Output: out/test-tts.mp3
 */
import fs from 'fs';
import path from 'path';
import { createTTSProvider } from '../src/index';
import type { TTSConfig } from '../src/types';

const OUTPUT_DIR = path.resolve(import.meta.dirname, '../out');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'test-tts.mp3');

// Parse args
const args = process.argv.slice(2);
const text = args.find((a) => !a.startsWith('--')) ?? 'Cześć, to jest testowy voiceover wygenerowany przez ReelStack.';
const providerArg = args.find((a) => a.startsWith('--provider='))?.split('=')[1]
  ?? (args.indexOf('--provider') !== -1 ? args[args.indexOf('--provider') + 1] : 'edge-tts');
const voiceArg = args.find((a) => a.startsWith('--voice='))?.split('=')[1]
  ?? (args.indexOf('--voice') !== -1 ? args[args.indexOf('--voice') + 1] : undefined);

// Build config
let config: TTSConfig | undefined;
if (providerArg === 'elevenlabs') {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('ELEVENLABS_API_KEY env var required for elevenlabs provider');
    process.exit(1);
  }
  config = { provider: 'elevenlabs', apiKey };
} else if (providerArg === 'openai') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY env var required for openai provider');
    process.exit(1);
  }
  config = { provider: 'openai', apiKey };
} else {
  config = { provider: 'edge-tts', defaultLanguage: 'pl-PL' };
}

const provider = createTTSProvider(config);

console.log(`Provider: ${provider.name}`);
console.log(`Text: "${text}"`);
console.log(`Voice: ${voiceArg ?? '(default)'}`);

const start = performance.now();
const result = await provider.synthesize(text, { voice: voiceArg });
const elapsed = ((performance.now() - start) / 1000).toFixed(1);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_PATH, result.audioBuffer);

const sizeKB = (result.audioBuffer.length / 1024).toFixed(1);
console.log(`\nDone in ${elapsed}s`);
console.log(`Output: ${OUTPUT_PATH}`);
console.log(`Format: ${result.format}, ${result.sampleRate}Hz`);
console.log(`Size: ${sizeKB} KB`);
