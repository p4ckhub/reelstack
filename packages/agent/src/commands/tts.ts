/**
 * TTS command - Generate voiceover + transcription.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  B,
  G,
  R,
  D,
  X,
  positional,
  opt,
  save,
  elapsed,
  outDir,
  cleanScriptFile,
} from '../cli-utils';

export async function tts() {
  let script = positional(1);
  if (!script) {
    console.log(
      `Usage: bun run rs tts "Tekst do mówienia" [--voice pl-PL-MarekNeural] [--lang pl-PL]\n       bun run rs tts --file skrypt.txt`
    );
    process.exit(1);
  }

  // --file flag: read script from file, strip timing markers
  const filePath = opt('file');
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      console.log(`${R}File not found: ${filePath}${X}`);
      process.exit(1);
    }
    script = cleanScriptFile(fs.readFileSync(filePath, 'utf-8'));
  } else if (script && fs.existsSync(script)) {
    // Positional arg is a file path
    script = cleanScriptFile(fs.readFileSync(script, 'utf-8'));
  }

  const { runTTSPipeline } = await import('../index');
  const voice = opt('voice') ?? 'pl-PL-MarekNeural';
  const lang = opt('lang') ?? 'pl-PL';

  console.log(`${B}TTS + Whisper${X}`);
  console.log(`Script: "${script.substring(0, 80)}${script.length > 80 ? '...' : ''}"`);
  console.log(`Voice: ${voice}, Lang: ${lang}`);

  const t0 = performance.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-tts-'));
  const result = await runTTSPipeline(
    { script, tts: { provider: 'edge-tts', voice, language: lang } },
    tmpDir,
    (msg) => console.log(`  ${D}${msg}${X}`)
  );

  fs.copyFileSync(result.voiceoverPath, path.join(outDir, 'voiceover.mp3'));
  save('tts.json', {
    voiceoverPath: path.join(outDir, 'voiceover.mp3'),
    audioDuration: result.audioDuration,
    cues: result.cues,
    words: result.transcriptionWords,
  });

  console.log(
    `${G}Done${X} (${elapsed(t0)}): ${result.audioDuration.toFixed(1)}s audio, ${result.cues.length} cues`
  );
  console.log(`${D}Listen: open ${outDir}/voiceover.mp3${X}`);
  console.log(`${D}Next:   bun run rs plan ${outDir}/tts.json${X}`);
}
