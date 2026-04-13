/**
 * Transcribe command - Extract audio from video, run Whisper, output tts.json.
 */
import fs from 'fs';
import path from 'path';
import { B, G, D, X, positional, opt, save, elapsed, outDir, uploadToR2 } from '../cli-utils';

export async function transcribe() {
  const videoFile = positional(1);
  if (!videoFile || !fs.existsSync(videoFile)) {
    console.log(
      `Usage: bun run rs transcribe <video.mp4>\n\nExtracts audio from video (e.g. HeyGen), runs Whisper, outputs tts.json.\nUse this instead of 'tts' when you already have audio (HeyGen, screen recording, etc.).`
    );
    process.exit(1);
  }

  const { normalizeAudioForWhisper, getAudioDuration, transcribeAudio } =
    await import('@reelstack/remotion/pipeline');
  const { groupWordsIntoCues, alignWordsWithScript } = await import('@reelstack/transcription');

  console.log(`${B}Transcribe${X} ${videoFile}`);
  const t0 = performance.now();

  // Extract audio from video using ffmpeg
  const audioPath = path.join(outDir, 'extracted-audio.wav');
  const { execSync } = await import('child_process');
  console.log(`  ${D}Extracting audio...${X}`);
  execSync(`ffmpeg -y -i "${videoFile}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`, {
    stdio: 'pipe',
  });

  const audioBuffer = fs.readFileSync(audioPath);
  const audioDuration = getAudioDuration(audioBuffer, 'wav');
  console.log(`  ${D}Audio: ${audioDuration.toFixed(1)}s${X}`);

  // Run Whisper
  console.log(`  ${D}Running Whisper...${X}`);
  const transcription = await transcribeAudio(audioBuffer, {
    language: opt('lang')?.split('-')[0] ?? 'pl',
  });
  console.log(`  ${D}Whisper: ${transcription.words.length} words${X}`);

  // Group into cues
  const cues = groupWordsIntoCues(transcription.words, {
    maxWordsPerCue: 5,
    maxDurationPerCue: 3,
    breakOnPunctuation: true,
  });

  // Copy source video to out dir
  const videoOutPath = path.join(outDir, 'heygen.mp4');
  if (path.resolve(videoFile) !== path.resolve(videoOutPath)) {
    fs.copyFileSync(videoFile, videoOutPath);
  }

  // Upload video to R2 so Lambda can access it during render
  console.log(`  ${D}Uploading to R2...${X}`);
  const videoUrl = await uploadToR2(videoOutPath, 'heygen/');

  // Save tts.json (compatible with plan/assemble)
  // voiceoverPath = signed R2 URL (Lambda needs remote access)
  save('tts.json', {
    voiceoverPath: videoUrl,
    audioDuration,
    cues,
    words: transcription.words,
    source: 'transcribe',
    sourceVideo: videoUrl,
  });

  // Update heygen.json with R2 URL so plan uses accessible URL for primaryVideo
  const heygenJsonPath = path.join(outDir, 'heygen.json');
  if (fs.existsSync(heygenJsonPath)) {
    const hg = JSON.parse(fs.readFileSync(heygenJsonPath, 'utf-8'));
    hg.url = videoUrl;
    fs.writeFileSync(heygenJsonPath, JSON.stringify(hg, null, 2));
    console.log(`  ${D}Updated heygen.json with R2 URL${X}`);
  } else {
    // No heygen.json yet (e.g. transcribing screen recording) - create one
    save('heygen.json', { url: videoUrl, durationSeconds: audioDuration });
  }

  // Clean up temp audio
  fs.unlinkSync(audioPath);

  console.log(`${G}Done${X} (${elapsed(t0)}): ${audioDuration.toFixed(1)}s, ${cues.length} cues`);
  console.log(`${D}Next: bun run rs plan ${outDir}/tts.json${X}`);
}
