#!/usr/bin/env npx tsx
/**
 * CLI: Text script → full reel MP4 via the ReelStack pipeline.
 *
 * Usage:
 *   npx tsx scripts/create-reel.ts --script "Your text here"
 *   npx tsx scripts/create-reel.ts --script "Text" --style cinematic --layout fullscreen
 *   npx tsx scripts/create-reel.ts --script-file script.txt --brand brand.json
 *
 * Required env vars:
 *   - OPENAI_API_KEY or OPENROUTER_API_KEY (for Whisper transcription)
 *
 * Optional env vars:
 *   - ANTHROPIC_API_KEY or OPENAI_API_KEY (for AI Director, falls back to rule-based)
 *   - PEXELS_API_KEY (for B-roll stock footage search)
 *   - ELEVENLABS_API_KEY (if using --tts elevenlabs)
 */
import fs from 'fs';
import path from 'path';
import { createReel } from '../src/pipeline/reel-creator';
import type { ReelCreationRequest } from '../src/pipeline/types';

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && i + 1 < args.length) {
      result[arg.slice(2)] = args[++i];
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Get script text
  let script = args['script'];
  if (!script && args['script-file']) {
    script = fs.readFileSync(args['script-file'], 'utf-8').trim();
  }
  if (!script) {
    console.error('Usage: npx tsx scripts/create-reel.ts --script "Your text" [options]');
    console.error('');
    console.error('Options:');
    console.error('  --script "text"       Script text (inline)');
    console.error('  --script-file path    Script from file');
    console.error('  --layout type         split-screen | fullscreen | picture-in-picture (default: fullscreen)');
    console.error('  --style type          dynamic | calm | cinematic | educational (default: dynamic)');
    console.error('  --tts provider        edge-tts | elevenlabs | openai (default: edge-tts)');
    console.error('  --voice name          TTS voice name');
    console.error('  --lang code           Language code, e.g. pl-PL, en-US (default: pl-PL)');
    console.error('  --brand path          Brand preset JSON file');
    console.error('  --output path         Output MP4 path');
    console.error('  --video path          Primary video URL or filename in public/');
    console.error('  --video2 path         Secondary video URL or filename in public/');
    process.exit(1);
  }

  // Load brand preset if provided
  let brandPreset: ReelCreationRequest['brandPreset'];
  if (args['brand']) {
    const brandJson = fs.readFileSync(args['brand'], 'utf-8');
    try {
      brandPreset = JSON.parse(brandJson);
    } catch {
      console.error(`Failed to parse JSON from brand file: ${args['brand']}`);
      process.exit(1);
    }
  }

  const request: ReelCreationRequest = {
    script,
    layout: (args['layout'] as ReelCreationRequest['layout']) ?? 'fullscreen',
    style: (args['style'] as ReelCreationRequest['style']) ?? 'dynamic',
    tts: {
      provider: (args['tts'] as 'edge-tts' | 'elevenlabs' | 'openai') ?? 'edge-tts',
      voice: args['voice'],
      language: args['lang'] ?? 'pl-PL',
    },
    primaryVideoUrl: args['video'],
    secondaryVideoUrl: args['video2'],
    brandPreset,
    outputPath: args['output'],
  };

  console.log('ReelStack Pipeline');
  console.log('─'.repeat(50));
  console.log(`Script: "${script.slice(0, 80)}${script.length > 80 ? '...' : ''}"`);
  console.log(`Layout: ${request.layout}`);
  console.log(`Style:  ${request.style}`);
  console.log(`TTS:    ${request.tts?.provider} (${request.tts?.language})`);
  console.log(`Whisper: ${process.env.OPENAI_API_KEY ? 'OpenAI API' : 'whisper.cpp local (fallback: synthetic)'}`);
  console.log(`AI Director: ${process.env.ANTHROPIC_API_KEY ? 'Claude' : process.env.OPENAI_API_KEY ? 'OpenAI' : 'rule-based (no API key)'}`);
  console.log(`Pexels: ${process.env.PEXELS_API_KEY ? 'enabled' : 'disabled (no PEXELS_API_KEY)'}`);
  console.log('─'.repeat(50));

  const startTime = performance.now();

  const result = await createReel(request, (step) => {
    console.log(`  → ${step}`);
  });

  const totalSec = ((performance.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('Pipeline steps:');
  for (const step of result.steps) {
    console.log(`  ${step.name.padEnd(22)} ${(step.durationMs / 1000).toFixed(1)}s  ${step.detail ?? ''}`);
  }

  const fileSize = fs.statSync(result.outputPath).size;
  console.log('');
  console.log(`Output: ${result.outputPath}`);
  console.log(`Size:   ${(fileSize / 1024).toFixed(0)} KB`);
  console.log(`Duration: ${result.durationSeconds.toFixed(1)}s`);
  console.log(`Total time: ${totalSec}s`);

  if (result.props.bRollSegments.length > 0) {
    console.log('');
    console.log('B-roll segments:');
    for (const seg of result.props.bRollSegments) {
      const t = seg.transition ? ` [${seg.transition.type}]` : '';
      console.log(`  ${seg.startTime.toFixed(1)}s-${seg.endTime.toFixed(1)}s  ${seg.media.type}${t}`);
    }
  }
}

main().catch((err) => {
  console.error('Pipeline failed:', err.message ?? err);
  process.exit(1);
});
