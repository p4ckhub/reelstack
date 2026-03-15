#!/usr/bin/env npx tsx
/**
 * CLI: Text script → full reel via Agent pipeline (local rendering, no storage needed)
 *
 * Supports iterative director workflow:
 *   --save-plan         Save plan after LLM planning and exit (don't render)
 *   --plan-file path    Load a previously saved plan (skip TTS/whisper/planning)
 *   --director-notes    Revise loaded plan with feedback before rendering
 *
 * Bypasses S3/MinIO storage by using local file paths for voiceover.
 * Uses Remotion local renderer.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { createTTSProvider } from '@reelstack/tts';
import type { TTSConfig } from '@reelstack/tts';
import { groupWordsIntoCues } from '@reelstack/transcription';
import { normalizeAudioForWhisper, getAudioDuration, transcribeAudio } from '@reelstack/remotion/pipeline';
import { createRenderer } from '@reelstack/remotion/render';
import { ToolRegistry } from '../../agent/src/registry/tool-registry';
import { discoverTools } from '../../agent/src/registry/discovery';
import { planProduction, revisePlan } from '../../agent/src/planner/production-planner';
import { generateAssets } from '../../agent/src/orchestrator/asset-generator';
// adjustTimeline removed — director now plans to exact transcription timestamps
import { assembleComposition } from '../../agent/src/orchestrator/composition-assembler';
import { validatePlan } from '../../agent/src/planner/plan-validator';
import { supervisePlan } from '../../agent/src/planner/plan-supervisor';
import { BUILT_IN_CAPTION_PRESETS, DEFAULT_CAPTION_PRESET } from '@reelstack/types';
import type { BrandPreset, GeneratedAsset, ProductionPlan } from '../../agent/src/types';

/** Saved plan file structure */
interface SavedPlan {
  script: string;
  plan: ProductionPlan;
  assets: GeneratedAsset[];
  cues: Array<{
    id: string;
    text: string;
    startTime: number;
    endTime: number;
    words?: Array<{ text: string; startTime: number; endTime: number }>;
    animationStyle?: string;
  }>;
  voiceoverPath: string;
  audioDuration: number;
  style: 'dynamic' | 'calm' | 'cinematic' | 'educational';
  presetName: string;
  lang: string;
}

const BOOLEAN_FLAGS = new Set(['save-plan']);

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        result[key] = 'true';
      } else if (i + 1 < args.length) {
        result[key] = args[++i];
      }
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const planFilePath = args['plan-file'];
  const savePlan = args['save-plan'] === 'true';
  const directorNotes = args['director-notes']
    ?? (args['director-notes-file'] ? fs.readFileSync(args['director-notes-file'], 'utf-8').trim() : undefined);

  // ── LOAD PLAN MODE ──
  if (planFilePath) {
    await runFromPlan(args, planFilePath, directorNotes);
    return;
  }

  // ── NORMAL MODE (with optional --save-plan) ──
  let script = args['script'];
  if (!script && args['script-file']) {
    script = fs.readFileSync(args['script-file'], 'utf-8').trim();
  }
  if (!script) {
    printUsage();
    process.exit(1);
  }

  const presetName = args['preset'] ?? 'tiktok';
  const brandPreset: BrandPreset = { captionPreset: presetName };
  const style = (args['style'] as 'dynamic' | 'calm' | 'cinematic' | 'educational') ?? 'dynamic';
  const lang = args['lang'] ?? 'pl-PL';
  const outputPath = args['output'] ?? path.join(process.cwd(), 'out', `agent-reel-${Date.now()}.mp4`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-local-'));

  console.log('ReelStack Agent Pipeline (local)');
  console.log('─'.repeat(50));
  console.log(`Script:  "${script.slice(0, 80)}${script.length > 80 ? '...' : ''}"`);
  console.log(`Preset:  ${presetName}`);
  console.log(`Style:   ${style}`);
  console.log(`Mode:    ${savePlan ? 'save-plan (no render)' : 'full pipeline'}`);
  console.log(`LLM:     ${process.env.ANTHROPIC_API_KEY ? 'Anthropic Claude' : process.env.OPENROUTER_API_KEY ? 'OpenRouter' : 'rule-based'}`);
  console.log(`Pexels:  ${process.env.PEXELS_API_KEY ? 'enabled' : 'disabled'}`);
  console.log('─'.repeat(50));

  const t0 = performance.now();

  // ── 1. DISCOVER TOOLS ──
  console.log('  → Discovering tools...');
  const registry = new ToolRegistry();
  for (const tool of discoverTools()) registry.register(tool);
  await registry.discover();
  const manifest = registry.getToolManifest();
  console.log(`    Tools: ${manifest.tools.filter(t => t.available).map(t => t.id).join(', ')}`);

  // ── 2. TTS ──
  console.log('  → Generating voiceover (edge-tts)...');
  const ttsConfig: TTSConfig = { provider: 'edge-tts', defaultLanguage: lang };
  const ttsProvider = createTTSProvider(ttsConfig);
  const ttsResult = await ttsProvider.synthesize(script, { language: lang });
  const voiceoverPath = path.join(tmpDir, `voiceover.${ttsResult.format}`);
  fs.writeFileSync(voiceoverPath, ttsResult.audioBuffer);

  // ── 3. NORMALIZE + WHISPER ──
  console.log('  → Normalizing audio...');
  const wavBuffer = normalizeAudioForWhisper(ttsResult.audioBuffer, ttsResult.format);
  const audioDuration = getAudioDuration(ttsResult.audioBuffer, ttsResult.format);
  console.log(`    Duration: ${audioDuration.toFixed(1)}s`);

  console.log('  → Transcribing (Whisper)...');
  const transcription = await transcribeAudio(wavBuffer, {
    language: lang.split('-')[0],
    text: script,
    durationSeconds: audioDuration,
  });
  console.log(`    Words: ${transcription.words.length}`);

  // ── 4. GROUP CUES (using preset config) ──
  const preset = BUILT_IN_CAPTION_PRESETS[presetName] ?? BUILT_IN_CAPTION_PRESETS[DEFAULT_CAPTION_PRESET];
  const animStyle = brandPreset.animationStyle ?? preset.animationStyle;
  const maxWords = brandPreset.maxWordsPerCue ?? preset.maxWordsPerCue;
  const maxDur = brandPreset.maxDurationPerCue ?? preset.maxDurationPerCue;
  console.log(`  → Grouping cues: ${maxWords} words/cue, animation=${animStyle}`);
  const cues = groupWordsIntoCues(transcription.words, {
    maxWordsPerCue: maxWords,
    maxDurationPerCue: maxDur,
    breakOnPunctuation: true,
  }, animStyle);
  console.log(`    Cues: ${cues.length}`);

  // ── 5. LLM PLAN ──
  console.log('  → Planning production (LLM)...');
  // Build timing reference from transcription so LLM knows EXACTLY when each sentence is spoken
  const timingReference = buildTimingReference(transcription.words);
  let plan = await planProduction({
    script,
    durationEstimate: audioDuration,
    style,
    toolManifest: manifest,
    layout: 'fullscreen',
    timingReference,
  });
  console.log(`    Shots: ${plan.shots.length}, Effects: ${plan.effects.length}, Layout: ${plan.layout}`);
  console.log(`    Reasoning: ${plan.reasoning.slice(0, 120)}`);

  // ── 5b. SUPERVISOR REVIEW ──
  console.log('  → Supervisor reviewing plan...');
  const supervision = await supervisePlan({
    plan,
    script,
    audioDuration,
    style,
    toolManifest: manifest,
    timingReference,
  });
  plan = supervision.plan;
  for (const review of supervision.reviews) {
    const icon = review.verdict === 'approved' ? '✅' : '🔄';
    console.log(`    ${icon} Round ${review.iteration}: score ${review.score}/10 — ${review.verdict}`);
    if (review.notes) console.log(`       ${review.notes.slice(0, 200)}`);
  }
  console.log(`    Final: ${supervision.approved ? 'APPROVED' : 'BEST EFFORT'} after ${supervision.iterations} review(s)`);
  console.log(`    Shots: ${plan.shots.length}, Effects: ${plan.effects.length}`);

  // ── 6. GENERATE ASSETS ──
  console.log('  → Generating assets...');
  const assets = await generateAssets(plan, registry, (msg) => console.log(`    ${msg}`));
  console.log(`    Assets: ${assets.length}`);

  // ── SAVE PLAN & EXIT ──
  if (savePlan) {
    // Copy voiceover to out/ so it persists after tmpDir cleanup
    const outDir = path.join(process.cwd(), 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const persistedVoiceover = path.join(outDir, `voiceover-${Date.now()}.mp3`);
    fs.copyFileSync(voiceoverPath, persistedVoiceover);

    const serializedCues = cues.map(c => ({
      id: c.id, text: c.text, startTime: c.startTime, endTime: c.endTime,
      words: c.words?.map(w => ({ text: w.text, startTime: w.startTime, endTime: w.endTime })),
      animationStyle: c.animationStyle,
    }));

    const savedPlan: SavedPlan = {
      script,
      plan,
      assets,
      cues: serializedCues,
      voiceoverPath: persistedVoiceover,
      audioDuration,
      style,
      presetName,
      lang,
    };

    const planPath = path.join(outDir, `plan-${Date.now()}.json`);
    fs.writeFileSync(planPath, JSON.stringify(savedPlan, null, 2));

    const totalSec = ((performance.now() - t0) / 1000).toFixed(1);
    printPlanSummary(plan, assets, audioDuration);
    console.log('');
    console.log('─'.repeat(50));
    console.log(`Plan saved: ${planPath}`);
    console.log(`Voiceover:  ${persistedVoiceover}`);
    console.log(`Time:       ${totalSec}s`);
    console.log('');
    console.log('Next steps:');
    console.log(`  Render as-is:  bun run agent-reel.ts --plan-file "${planPath}"`);
    console.log(`  Revise & render: bun run agent-reel.ts --plan-file "${planPath}" --director-notes "your feedback"`);

    // Cleanup tmp
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  // ── 7. COPY VOICEOVER TO REMOTION PUBLIC DIR ──
  // No adjustTimeline needed — director planned to exact timestamps
  // Copy into BOTH source public/ (for fresh bundles) and cached bundle public/ (for reuse)
  const remotionPublicDir = path.resolve(import.meta.dirname!, '../public');
  const bundlePublicDir = path.join(os.tmpdir(), 'remotion-bundle', 'public');
  const voiceoverFilename = `voiceover-${randomUUID().slice(0, 8)}.mp3`;
  const voiceoverPublicPath = path.join(remotionPublicDir, voiceoverFilename);
  fs.mkdirSync(remotionPublicDir, { recursive: true });
  fs.copyFileSync(voiceoverPath, voiceoverPublicPath);
  // Also copy to cached bundle dir so Remotion can serve it
  if (fs.existsSync(path.dirname(bundlePublicDir))) {
    fs.mkdirSync(bundlePublicDir, { recursive: true });
    fs.copyFileSync(voiceoverPath, path.join(bundlePublicDir, voiceoverFilename));
  }

  // ── 8. ASSEMBLE ──
  console.log('  → Assembling composition...');
  const props = assembleComposition({
    plan,
    assets,
    cues: cues.map(c => ({
      id: c.id, text: c.text, startTime: c.startTime, endTime: c.endTime,
      words: c.words?.map(w => ({ text: w.text, startTime: w.startTime, endTime: w.endTime })),
      animationStyle: c.animationStyle,
    })),
    voiceoverFilename,
    brandPreset,
  });

  console.log(`    Layout: ${props.layout}`);
  console.log(`    B-roll segments: ${props.bRollSegments.length}`);
  console.log(`    Effects: ${props.effects.length}`);
  console.log(`    Music volume: ${props.musicVolume}`);
  console.log(`    Caption style: ${(props.captionStyle as any)?.fontSize}px ${(props.captionStyle as any)?.fontFamily} ${(props.captionStyle as any)?.textTransform}`);

  // ── 9. RENDER ──
  console.log('  → Rendering video (Remotion local)...');
  const renderer = createRenderer();
  const renderResult = await renderer.render(props as never, { outputPath });

  const totalSec = ((performance.now() - t0) / 1000).toFixed(1);
  const fileSize = fs.statSync(outputPath).size;

  console.log('');
  console.log('─'.repeat(50));
  console.log(`Output:   ${outputPath}`);
  console.log(`Size:     ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Duration: ${audioDuration.toFixed(1)}s`);
  console.log(`Total:    ${totalSec}s`);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  try { fs.unlinkSync(voiceoverPublicPath); } catch {};
  try { fs.unlinkSync(path.join(bundlePublicDir, voiceoverFilename)); } catch {};
}

/**
 * Load a saved plan and render (optionally revising with director notes first).
 */
async function runFromPlan(
  args: Record<string, string>,
  planFilePath: string,
  directorNotes?: string,
) {
  if (!fs.existsSync(planFilePath)) {
    console.error(`Plan file not found: ${planFilePath}`);
    process.exit(1);
  }

  const saved: SavedPlan = JSON.parse(fs.readFileSync(planFilePath, 'utf-8'));
  const { script, cues, audioDuration, style, presetName, lang } = saved;
  let { plan, assets } = saved;
  let voiceoverSourcePath = saved.voiceoverPath;

  const brandPreset: BrandPreset = { captionPreset: presetName };
  const outputPath = args['output'] ?? path.join(process.cwd(), 'out', `agent-reel-${Date.now()}.mp4`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log('ReelStack Agent Pipeline (from plan)');
  console.log('─'.repeat(50));
  console.log(`Plan:    ${planFilePath}`);
  console.log(`Script:  "${script.slice(0, 80)}${script.length > 80 ? '...' : ''}"`);
  console.log(`Preset:  ${presetName}`);
  console.log(`Style:   ${style}`);
  console.log(`Mode:    ${directorNotes ? 'revise + render' : 'render from plan'}`);
  console.log('─'.repeat(50));

  const t0 = performance.now();

  // Check voiceover exists; if not, re-generate via TTS
  if (!fs.existsSync(voiceoverSourcePath)) {
    console.log('  → Voiceover file missing, re-generating (edge-tts)...');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelstack-tts-'));
    const ttsConfig: TTSConfig = { provider: 'edge-tts', defaultLanguage: lang };
    const ttsProvider = createTTSProvider(ttsConfig);
    const ttsResult = await ttsProvider.synthesize(script, { language: lang });
    voiceoverSourcePath = path.join(tmpDir, `voiceover.${ttsResult.format}`);
    fs.writeFileSync(voiceoverSourcePath, ttsResult.audioBuffer);
  }

  // ── REVISE PLAN (if director notes provided) ──
  if (directorNotes) {
    console.log('  → Discovering tools...');
    const registry = new ToolRegistry();
    for (const tool of discoverTools()) registry.register(tool);
    await registry.discover();
    const manifest = registry.getToolManifest();

    console.log('  → Revising plan with director notes...');
    console.log(`    Notes: "${directorNotes.slice(0, 120)}${directorNotes.length > 120 ? '...' : ''}"`);
    const revisedPlan = await revisePlan({
      originalPlan: plan,
      directorNotes,
      script,
      durationEstimate: audioDuration,
      style,
      toolManifest: manifest,
    });
    console.log(`    Revised shots: ${revisedPlan.shots.length}, Effects: ${revisedPlan.effects.length}`);

    // Find new shots that need asset generation
    const existingAssetShotIds = new Set(assets.map(a => a.shotId).filter(Boolean));
    const newShots = revisedPlan.shots.filter(s => !existingAssetShotIds.has(s.id));

    if (newShots.length > 0) {
      console.log(`  → Generating assets for ${newShots.length} new shot(s)...`);
      // Create a partial plan with only new shots for asset generation
      const partialPlan: ProductionPlan = {
        ...revisedPlan,
        shots: newShots,
      };
      const newAssets = await generateAssets(partialPlan, registry, (msg) => console.log(`    ${msg}`));
      // Keep existing assets for unchanged shots, add new ones
      const revisedShotIds = new Set(revisedPlan.shots.map(s => s.id));
      assets = [
        ...assets.filter(a => a.shotId && revisedShotIds.has(a.shotId)),
        ...newAssets,
      ];
      console.log(`    Total assets: ${assets.length}`);
    }

    plan = revisedPlan;

    // Save revised plan
    const revisedSaved: SavedPlan = { ...saved, plan, assets };
    const version = getNextVersion(planFilePath);
    const revisedPath = planFilePath.replace(/(-v\d+)?\.json$/, `-v${version}.json`);
    fs.writeFileSync(revisedPath, JSON.stringify(revisedSaved, null, 2));
    console.log(`    Revised plan saved: ${revisedPath}`);
  }

  // ── COPY VOICEOVER TO REMOTION PUBLIC DIR ──
  // No adjustTimeline needed — director planned to exact timestamps
  // Copy into BOTH source public/ (for fresh bundles) and cached bundle public/ (for reuse)
  const remotionPublicDir = path.resolve(import.meta.dirname!, '../public');
  const bundlePublicDir = path.join(os.tmpdir(), 'remotion-bundle', 'public');
  const voiceoverFilename = `voiceover-${randomUUID().slice(0, 8)}.mp3`;
  const voiceoverPublicPath = path.join(remotionPublicDir, voiceoverFilename);
  fs.mkdirSync(remotionPublicDir, { recursive: true });
  fs.copyFileSync(voiceoverSourcePath, voiceoverPublicPath);
  // Also copy to cached bundle dir so Remotion can serve it
  if (fs.existsSync(path.dirname(bundlePublicDir))) {
    fs.mkdirSync(bundlePublicDir, { recursive: true });
    fs.copyFileSync(voiceoverSourcePath, path.join(bundlePublicDir, voiceoverFilename));
  }

  // ── VALIDATE PLAN ──
  console.log('  → Validating plan...');
  const validation = validatePlan(plan, audioDuration);
  if (validation.issues.length > 0) {
    for (const issue of validation.issues) {
      const icon = issue.autoFixed ? '🔧' : issue.severity === 'error' ? '❌' : '⚠️';
      console.log(`    ${icon} [${issue.type}] ${issue.message}`);
    }
    plan = validation.fixedPlan;
    console.log(`    Plan after validation: ${plan.effects.length} effects, ${(plan.counters ?? []).length} counters`);
  } else {
    console.log('    ✓ Plan is valid');
  }

  // ── ASSEMBLE ──
  console.log('  → Assembling composition...');
  const props = assembleComposition({
    plan,
    assets,
    cues: cues.map(c => ({
      id: c.id, text: c.text, startTime: c.startTime, endTime: c.endTime,
      words: c.words?.map(w => ({ text: w.text, startTime: w.startTime, endTime: w.endTime })),
      animationStyle: c.animationStyle,
    })),
    voiceoverFilename,
    brandPreset,
  });

  console.log(`    Layout: ${props.layout}`);
  console.log(`    B-roll segments: ${props.bRollSegments.length}`);
  console.log(`    Effects: ${props.effects.length}`);
  console.log(`    Music volume: ${props.musicVolume}`);
  console.log(`    Caption style: ${(props.captionStyle as any)?.fontSize}px ${(props.captionStyle as any)?.fontFamily} ${(props.captionStyle as any)?.textTransform}`);

  // ── RENDER ──
  console.log('  → Rendering video (Remotion local)...');
  const renderer = createRenderer();
  const renderResult = await renderer.render(props as never, { outputPath });

  const totalSec = ((performance.now() - t0) / 1000).toFixed(1);
  const fileSize = fs.statSync(outputPath).size;

  console.log('');
  console.log('─'.repeat(50));
  console.log(`Output:   ${outputPath}`);
  console.log(`Size:     ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Duration: ${audioDuration.toFixed(1)}s`);
  console.log(`Total:    ${totalSec}s`);

  // Cleanup
  try { fs.unlinkSync(voiceoverPublicPath); } catch {};
  try { fs.unlinkSync(path.join(bundlePublicDir, voiceoverFilename)); } catch {};
}

/** Determine the next version number for a revised plan file */
function getNextVersion(planFilePath: string): number {
  const dir = path.dirname(planFilePath);
  const base = path.basename(planFilePath, '.json').replace(/-v\d+$/, '');
  const existing = fs.readdirSync(dir)
    .filter(f => f.startsWith(base) && f.endsWith('.json'))
    .map(f => {
      const match = f.match(/-v(\d+)\.json$/);
      return match ? parseInt(match[1], 10) : 0;
    });
  return Math.max(0, ...existing) + 1;
}

/** Print human-readable plan summary */
function printPlanSummary(plan: ProductionPlan, assets: GeneratedAsset[], audioDuration: number) {
  console.log('');
  console.log('Plan Summary');
  console.log('─'.repeat(50));
  console.log(`  Layout:   ${plan.layout}`);
  console.log(`  Duration: ${audioDuration.toFixed(1)}s`);
  console.log(`  Shots:    ${plan.shots.length}`);
  console.log(`  Effects:  ${plan.effects.length}`);
  console.log(`  Assets:   ${assets.length}`);
  console.log('');

  for (const shot of plan.shots) {
    const dur = (shot.endTime - shot.startTime).toFixed(1);
    const visual = shot.visual.type === 'b-roll'
      ? `b-roll "${shot.visual.searchQuery}" (${shot.visual.toolId})`
      : shot.visual.type === 'ai-image'
        ? `ai-image "${shot.visual.prompt?.slice(0, 40)}" (${shot.visual.toolId})`
        : shot.visual.type === 'ai-video'
          ? `ai-video "${shot.visual.prompt?.slice(0, 40)}" (${shot.visual.toolId})`
          : shot.visual.type === 'text-card'
            ? `text-card "${shot.visual.headline?.slice(0, 40)}"`
            : shot.visual.type;
    console.log(`  [${shot.startTime.toFixed(1)}s-${shot.endTime.toFixed(1)}s] ${shot.id}: ${visual} (${dur}s)`);
    if (shot.reason) console.log(`    reason: ${shot.reason}`);
  }

  if (plan.effects.length > 0) {
    console.log('');
    console.log('  Effects:');
    for (const fx of plan.effects) {
      console.log(`    [${fx.startTime.toFixed(1)}s-${fx.endTime.toFixed(1)}s] ${fx.type}: ${fx.reason}`);
    }
  }

  if (plan.reasoning) {
    console.log('');
    console.log(`  Reasoning: ${plan.reasoning}`);
  }
}

/**
 * Build timing reference from transcription words so the LLM knows when each sentence is spoken.
 * Groups words into sentences by punctuation and returns a compact timing map.
 */
function buildTimingReference(words: Array<{ text: string; startTime: number; endTime: number }>): string {
  if (words.length === 0) return '';
  const sentences: Array<{ text: string; start: number; end: number }> = [];
  let current: typeof words = [];

  for (const word of words) {
    current.push(word);
    // Flush on sentence-ending punctuation
    if (/[.!?]$/.test(word.text.trim())) {
      sentences.push({
        text: current.map(w => w.text).join(' '),
        start: current[0].startTime,
        end: current[current.length - 1].endTime,
      });
      current = [];
    }
  }
  // Flush remaining
  if (current.length > 0) {
    sentences.push({
      text: current.map(w => w.text).join(' '),
      start: current[0].startTime,
      end: current[current.length - 1].endTime,
    });
  }

  return sentences.map(s => `[${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] ${s.text}`).join('\n');
}

function printUsage() {
  console.error('Usage: bun run agent-reel.ts --script "Text" [options]');
  console.error('  --script text              Script text');
  console.error('  --script-file path         Script from file');
  console.error('  --preset name              tiktok, mrbeast, cinematic, minimal, neon, classic');
  console.error('  --style type               dynamic | calm | cinematic | educational');
  console.error('  --lang code                Language (default: pl-PL)');
  console.error('  --output path              Output MP4 path');
  console.error('  --save-plan                Save plan and exit (don\'t render)');
  console.error('  --plan-file path           Load plan from file (skip TTS/whisper/planning)');
  console.error('  --director-notes text      Feedback for the director (used with --plan-file)');
  console.error('  --director-notes-file path Read director notes from file');
}

main().catch((err) => {
  console.error('Pipeline failed:', err.message ?? err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
