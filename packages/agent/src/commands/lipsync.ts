/**
 * Lipsync and split-audio commands.
 */
import fs from 'fs';
import path from 'path';
import {
  B,
  G,
  Y,
  R,
  D,
  X,
  positional,
  opt,
  save,
  outDir,
  setupRegistry,
  uploadToR2,
} from '../cli-utils';

export async function splitAudio() {
  const ttsFile = positional(1);
  if (!ttsFile || !fs.existsSync(ttsFile)) {
    console.log(`Usage: bun run rs split-audio <tts.json>`);
    process.exit(1);
  }

  const { splitAudioByTimings } = await import('../../../ffmpeg/src/audio-split');
  const ttsData = JSON.parse(fs.readFileSync(ttsFile, 'utf-8'));

  if (!ttsData.voiceoverPath || !ttsData.words) {
    console.log(`${R}tts.json must have voiceoverPath and words${X}`);
    process.exit(1);
  }

  // Build sections from word timing (split on sentence boundaries)
  const words = ttsData.words as Array<{ text: string; startTime: number; endTime: number }>;
  const segments: Array<{ startTime: number; endTime: number; text: string }> = [];
  let secStart = 0;
  let secWords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    secWords.push(words[i].text);
    if (/[.!?]$/.test(words[i].text) || i === words.length - 1) {
      if (secWords.length >= 2) {
        segments.push({
          startTime: words[secStart].startTime,
          endTime: words[i].endTime,
          text: secWords.join(' '),
        });
      }
      secStart = i + 1;
      secWords = [];
    }
  }

  console.log(`${B}Split Audio${X}`);
  console.log(`Audio: ${ttsData.voiceoverPath}`);
  console.log(`Segments: ${segments.length}`);

  const audioDir = path.join(outDir, 'audio-segments');
  const results = splitAudioByTimings(ttsData.voiceoverPath, segments, audioDir);

  save(
    'segments.json',
    segments.map((s, i) => ({
      ...s,
      audioPath: results[i]?.path,
    }))
  );

  for (const [i, r] of results.entries()) {
    console.log(
      `  [${r.startTime.toFixed(1)}s-${r.endTime.toFixed(1)}s] ${segments[i].text.substring(0, 50)}... -> ${path.basename(r.path)}`
    );
  }

  console.log(`${G}Done${X}: ${results.length} segments in ${audioDir}/`);
  console.log(
    `${D}Next: bun run rs lipsync <character-image> --segments ${outDir}/segments.json${X}`
  );
}

export async function lipsync() {
  const imageFile = positional(1);
  const segmentsFile = opt('segments') ?? path.join(outDir, 'segments.json');

  if (!imageFile) {
    console.log(
      `Usage: bun run rs lipsync <character-image.jpg> [--segments segments.json] [--tool seedance|kling]`
    );
    process.exit(1);
  }

  if (!fs.existsSync(segmentsFile)) {
    console.log(`${R}Segments file not found: ${segmentsFile}${X}`);
    console.log(`${D}Run 'bun run rs split-audio tts.json' first${X}`);
    process.exit(1);
  }

  const registry = await setupRegistry();

  const segments = JSON.parse(fs.readFileSync(segmentsFile, 'utf-8')) as Array<{
    startTime: number;
    endTime: number;
    text: string;
    audioPath?: string;
  }>;

  const preferredTool = opt('tool') ?? 'kling';

  const toolId = preferredTool === 'seedance' ? 'seedance2-kie' : 'kling-avatar-fal';
  const maybeTool = registry.get(toolId);
  if (!maybeTool) {
    console.log(`${R}Tool ${toolId} not available. Check API keys.${X}`);
    const available = registry
      .getAvailable()
      .map((t) => t.id)
      .join(', ');
    console.log(`${D}Available: ${available}${X}`);
    process.exit(1);
    return;
  }
  const tool = maybeTool;

  // Upload character image to storage for URL access
  const imageUrl = await uploadToR2(imageFile, 'lipsync/', `character-${Date.now()}`);

  console.log(`${B}Lip Sync Generation${X} (${tool.name})`);
  console.log(`Character: ${imageFile}`);
  console.log(`Segments: ${segments.length}`);
  console.log(`Tool: ${toolId}`);

  const results: Array<{ segmentIndex: number; url?: string; error?: string }> = [];

  for (const [i, seg] of segments.entries()) {
    if (!seg.audioPath || !fs.existsSync(seg.audioPath)) {
      console.log(`  ${R}Segment ${i}: no audio file${X}`);
      results.push({ segmentIndex: i, error: 'no audio' });
      continue;
    }

    // Upload audio segment
    const audioUrl = await uploadToR2(seg.audioPath, 'lipsync/', `audio-${Date.now()}-${i}`);

    console.log(
      `  ${Y}Segment ${i}${X}: [${seg.startTime.toFixed(1)}-${seg.endTime.toFixed(1)}s] "${seg.text.substring(0, 40)}..."`
    );

    const job = await tool.generate({
      purpose: `Lip sync scene ${i}`,
      prompt: seg.text,
      imageUrl,
      audioUrl,
      aspectRatio: '9:16',
    });

    if (job.status === 'failed') {
      console.log(`    ${R}Failed: ${job.error}${X}`);
      results.push({ segmentIndex: i, error: job.error });
      continue;
    }

    // Poll
    console.log(`    Polling (${job.jobId})...`);
    let poll = job;
    for (let p = 0; p < 60; p++) {
      await new Promise((r) => setTimeout(r, 5000));
      poll = await tool.poll!(job.jobId);
      if (poll.status === 'completed') {
        console.log(`    ${G}Done${X}: ${poll.durationSeconds?.toFixed(1)}s`);
        results.push({ segmentIndex: i, url: poll.url });
        break;
      }
      if (poll.status === 'failed') {
        console.log(`    ${R}Failed: ${poll.error}${X}`);
        results.push({ segmentIndex: i, error: poll.error });
        break;
      }
      if (((p + 1) * 5) % 30 === 0) console.log(`    ${D}${(p + 1) * 5}s...${X}`);
    }
  }

  save('lipsync.json', results);
  const ok = results.filter((r) => r.url).length;
  console.log(`\n${G}${ok}/${segments.length} clips generated${X}`);
  if (ok > 0)
    console.log(
      `${D}Next: bun run rs plan ${outDir}/tts.json  (lipsync.json will be picked up)${X}`
    );
}
