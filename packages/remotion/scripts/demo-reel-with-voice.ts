#!/usr/bin/env npx tsx
/**
 * Reel Demo with real TTS + Whisper karaoke
 *
 * Pipeline: text → Edge TTS → whisper.cpp word timestamps → Remotion render
 * Generates all 3 reel demos with real voiceover and accurate karaoke.
 *
 * Usage: npx tsx scripts/demo-reel-with-voice.ts
 */
import fs from 'fs';
import path from 'path';
import { createTTSProvider } from '@reelstack/tts';
import { groupWordsIntoCues } from '@reelstack/transcription';
import { normalizeAudioForWhisper, getAudioDuration } from '../src/pipeline/audio-utils';
import { transcribeAudio } from '../src/pipeline/transcribe';
import { createRenderer } from '../src/render';
import type { ReelProps } from '../src/schemas/reel-props';

import { fileURLToPath } from 'url';
const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const REMOTION_PKG_DIR = path.resolve(__dirname, '..');

interface DemoConfig {
  name: string;
  script: string;
  buildProps: (cues: ReelProps['cues'], voiceoverFile: string, duration: number) => ReelProps;
  features: string[];
}

async function generateVoiceAndCues(
  script: string,
  name: string,
): Promise<{ cues: ReelProps['cues']; voiceoverFile: string; duration: number }> {
  const tts = createTTSProvider({ provider: 'edge-tts', defaultLanguage: 'en-US' });

  console.log(`  → TTS (Edge): generating voiceover...`);
  const ttsResult = await tts.synthesize(script, {
    voice: 'en-US-GuyNeural',
    language: 'en-US',
    rate: 1.05,
  });

  const duration = ttsResult.durationSeconds ?? getAudioDuration(ttsResult.audioBuffer, ttsResult.format);
  console.log(`    ${duration.toFixed(1)}s audio generated`);

  // Save voiceover to public/ for Remotion
  const voiceoverFile = `demo-${name}-voice.mp3`;
  const voiceoverPath = path.join(REMOTION_PKG_DIR, 'public', voiceoverFile);
  fs.mkdirSync(path.dirname(voiceoverPath), { recursive: true });
  fs.writeFileSync(voiceoverPath, ttsResult.audioBuffer);

  // Normalize for whisper
  console.log(`  → Normalizing audio for Whisper...`);
  const wavBuffer = normalizeAudioForWhisper(ttsResult.audioBuffer, ttsResult.format);

  // Transcribe with word-level timestamps
  console.log(`  → Whisper transcription (word-level)...`);
  const transcription = await transcribeAudio(wavBuffer, {
    language: 'en',
    text: script,
    durationSeconds: duration,
  });
  console.log(`    ${transcription.words.length} words transcribed`);

  // Group into cues with karaoke
  const rawCues = groupWordsIntoCues(transcription.words, {
    maxWordsPerCue: 5,
    maxDurationPerCue: 2.5,
    breakOnPunctuation: true,
  }, 'karaoke');

  const cues: ReelProps['cues'] = rawCues.map((c) => ({
    id: c.id,
    text: c.text,
    startTime: c.startTime,
    endTime: c.endTime,
    animationStyle: c.animationStyle as any,
    words: c.words?.map((w) => ({
      text: w.text,
      startTime: w.startTime,
      endTime: w.endTime,
    })),
  }));

  console.log(`    ${cues.length} cues with word-level karaoke`);

  return { cues, voiceoverFile, duration };
}

// ─── Demo configs ────────────────────────────────────────

const CAPTION_STYLE: ReelProps['captionStyle'] = {
  fontFamily: 'Outfit, sans-serif',
  fontSize: 48,
  fontColor: '#F5F5F0',
  fontWeight: 'bold',
  fontStyle: 'normal',
  backgroundColor: '#0E0E12',
  backgroundOpacity: 0.85,
  outlineColor: '#0E0E12',
  outlineWidth: 3,
  shadowColor: '#000000',
  shadowBlur: 12,
  position: 78,
  alignment: 'center',
  lineHeight: 1.3,
  padding: 14,
  highlightColor: '#F59E0B',
  upcomingColor: '#8888A0',
};

function buildShowcaseProps(cues: ReelProps['cues'], voiceoverFile: string, duration: number): ReelProps {
  const d = duration;
  return {
    layout: 'fullscreen',
    voiceoverUrl: voiceoverFile,

    bRollSegments: [
      // Text card intro (first 15% of duration)
      {
        startTime: 0,
        endTime: d * 0.12,
        media: {
          url: '',
          type: 'text-card',
          textCard: {
            headline: 'ReelStack',
            subtitle: 'Programmatic Video Pipeline',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 64,
          },
        },
        transition: { type: 'crossfade', durationMs: 600 },
      },
      // B-roll at ~30%
      {
        startTime: d * 0.28,
        endTime: d * 0.40,
        media: { url: '#0D2137', type: 'color', label: '💻 Code Demo' },
        animation: 'spring-scale',
        transition: { type: 'slide-left', durationMs: 300 },
      },
      // Text card mid
      {
        startTime: d * 0.50,
        endTime: d * 0.60,
        media: {
          url: '',
          type: 'text-card',
          textCard: {
            headline: 'Automated',
            subtitle: 'Captions, B-roll, transitions',
            background: 'linear-gradient(135deg, #2D1A2E 0%, #1A0F2E 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 64,
          },
        },
        transition: { type: 'zoom-in', durationMs: 500 },
      },
      // B-roll at ~70%
      {
        startTime: d * 0.68,
        endTime: d * 0.78,
        media: { url: '#1A2E1A', type: 'color', label: '📊 Output Preview' },
        animation: 'fade',
        transition: { type: 'wipe', durationMs: 400 },
      },
    ],

    pipSegments: [],

    zoomSegments: [
      { startTime: d * 0.22, endTime: d * 0.30, scale: 1.4, focusPoint: { x: 50, y: 40 }, easing: 'spring' },
      { startTime: d * 0.58, endTime: d * 0.68, scale: 1.25, focusPoint: { x: 50, y: 50 }, easing: 'smooth' },
    ],

    highlights: [
      {
        startTime: d * 0.78,
        endTime: d * 0.87,
        x: 10, y: 20, width: 80, height: 45,
        color: '#F59E0B',
        borderWidth: 3,
        borderRadius: 12,
        label: 'TEXT CARD',
        glow: true,
      },
    ],

    lowerThirds: [
      {
        startTime: d * 0.12,
        endTime: d * 0.25,
        title: 'ReelStack Pipeline',
        subtitle: 'Open Source Video Automation',
        accentColor: '#3B82F6',
      },
    ],

    counters: [
      {
        startTime: d * 0.60,
        endTime: d * 0.72,
        value: 10000,
        suffix: ' renders',
        format: 'abbreviated',
        textColor: '#FFFFFF',
        fontSize: 80,
        position: 'top',
      },
    ],

    ctaSegments: [
      {
        startTime: d * 0.87,
        endTime: d,
        text: 'Star on GitHub',
        style: 'button',
        backgroundColor: '#3B82F6',
        position: 'center',
      },
      {
        startTime: d * 0.92,
        endTime: d,
        text: 'Follow for more',
        style: 'pill',
        backgroundColor: '#DC2626',
        position: 'bottom',
      },
    ],

    cues,
    captionStyle: CAPTION_STYLE,
    musicVolume: 0,
    showProgressBar: true,
    backgroundColor: '#0E0E12',
  };
}

function buildLayersProps(cues: ReelProps['cues'], voiceoverFile: string, duration: number): ReelProps {
  const d = duration;
  return {
    layout: 'fullscreen',
    voiceoverUrl: voiceoverFile,

    bRollSegments: [
      {
        startTime: 0,
        endTime: d * 0.12,
        media: {
          url: '',
          type: 'text-card',
          textCard: {
            headline: 'How I Automate\nEverything',
            subtitle: 'A quick breakdown',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 56,
          },
        },
        transition: { type: 'crossfade', durationMs: 500 },
      },
      {
        startTime: d * 0.38,
        endTime: d * 0.50,
        media: { url: '#1A1A2E', type: 'color', label: '🔧 n8n Workflow' },
        animation: 'spring-scale',
        transition: { type: 'slide-left', durationMs: 300 },
      },
      {
        startTime: d * 0.62,
        endTime: d * 0.74,
        media: { url: '#0D2137', type: 'color', label: '📈 Analytics Dashboard' },
        animation: 'fade',
        transition: { type: 'zoom-in', durationMs: 400 },
      },
    ],

    pipSegments: [],
    zoomSegments: [],
    highlights: [],

    lowerThirds: [
      {
        startTime: d * 0.12,
        endTime: d * 0.28,
        title: 'Pawel Jurczyk',
        subtitle: 'TechSkills Academy',
        accentColor: '#3B82F6',
      },
      {
        startTime: d * 0.50,
        endTime: d * 0.62,
        title: 'n8n + Docker',
        subtitle: 'Self-hosted automation stack',
        accentColor: '#10B981',
      },
    ],

    counters: [
      {
        startTime: d * 0.55,
        endTime: d * 0.72,
        value: 247,
        suffix: ' hours saved',
        format: 'full',
        textColor: '#FFFFFF',
        fontSize: 72,
        position: 'top',
      },
    ],

    ctaSegments: [
      {
        startTime: d * 0.82,
        endTime: d,
        text: 'Free Setup Guide',
        style: 'button',
        backgroundColor: '#3B82F6',
        position: 'center',
      },
      {
        startTime: d * 0.90,
        endTime: d,
        text: 'Follow for more',
        style: 'pill',
        backgroundColor: '#DC2626',
        position: 'bottom',
      },
    ],

    cues,
    captionStyle: CAPTION_STYLE,
    musicVolume: 0,
    showProgressBar: true,
    backgroundColor: '#0E0E12',
  };
}

function buildTextcardsProps(cues: ReelProps['cues'], voiceoverFile: string, duration: number): ReelProps {
  const d = duration;
  return {
    layout: 'fullscreen',
    voiceoverUrl: voiceoverFile,

    bRollSegments: [
      {
        startTime: 0,
        endTime: d * 0.15,
        media: {
          url: '',
          type: 'text-card',
          textCard: {
            headline: 'Deploy Faster',
            subtitle: 'Self-hosted workflow automation',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 64,
          },
        },
        transition: { type: 'crossfade', durationMs: 600 },
      },
      {
        startTime: d * 0.28,
        endTime: d * 0.42,
        media: { url: '#0D2137', type: 'color', label: '⌨️ Terminal Output' },
        animation: 'spring-scale',
        transition: { type: 'slide-left', durationMs: 300 },
      },
      {
        startTime: d * 0.55,
        endTime: d * 0.68,
        media: {
          url: '',
          type: 'text-card',
          textCard: {
            headline: '10x Faster',
            subtitle: 'Than manual editing',
            background: 'linear-gradient(135deg, #1A2E1A 0%, #0F3F0F 100%)',
            textColor: '#FFFFFF',
            textAlign: 'center',
            fontSize: 72,
          },
        },
        transition: { type: 'zoom-in', durationMs: 500 },
      },
      {
        startTime: d * 0.78,
        endTime: d * 0.92,
        media: { url: '#2D1A2E', type: 'color', label: '📊 Dashboard Preview' },
        animation: 'fade',
        transition: { type: 'wipe', durationMs: 400 },
      },
    ],

    pipSegments: [],
    lowerThirds: [],
    ctaSegments: [],
    zoomSegments: [],
    highlights: [],
    counters: [],

    cues,
    captionStyle: CAPTION_STYLE,
    musicVolume: 0,
    showProgressBar: true,
    backgroundColor: '#0E0E12',
  };
}

// ─── Demo definitions ──────────────────────────────────

const DEMOS: DemoConfig[] = [
  {
    name: 'showcase',
    script: [
      'ReelStack. Programmatic video pipeline.',
      'Create reels with code. No manual editing needed.',
      'B-roll cutaways with smooth transitions.',
      'Lower thirds for context.',
      'Everything automated. Captions, overlays, progress.',
      'Ten thousand renders and counting.',
      'Text cards for emphasis. CTA buttons to convert.',
      'Star us on GitHub!',
    ].join(' '),
    buildProps: buildShowcaseProps,
    features: [
      'Text card intros (gradient backgrounds)',
      'B-roll cutaways (slide-left, wipe)',
      'Punch-in zoom effects (spring + smooth)',
      'Highlight box (amber glow)',
      'Lower third (title + subtitle)',
      'Animated counter (10K renders)',
      'CTA button + pill',
      'Karaoke captions (real whisper timestamps)',
      'TTS voiceover (Edge)',
      'Progress bar',
    ],
  },
  {
    name: 'layers',
    script: [
      'How I automate everything. In sixty seconds.',
      'Hi, I am Pawel, and I build self-hosted tools.',
      'The secret is n8n. A workflow automation platform.',
      'Running on my own server. With Docker containers.',
      'Two hundred forty seven hours saved. And everything stays private.',
      'Check the analytics. Get the free setup guide. Link in bio.',
    ].join(' '),
    buildProps: buildLayersProps,
    features: [
      'Text card intro (gradient)',
      '2 Lower thirds (speaker + topic)',
      'Animated counter (247 hours saved)',
      '2 CTA overlays (button + pill)',
      'B-roll cutaways with transitions',
      'Karaoke captions (real whisper timestamps)',
      'TTS voiceover (Edge)',
      'Progress bar',
    ],
  },
  {
    name: 'textcards',
    script: [
      'Deploy faster with self-hosted automation.',
      'Set up your pipeline in just five minutes.',
      'No more manual editing. Everything runs automatically.',
      'Ten times faster. Monitor your workflow from a single dashboard.',
      'Start building today.',
    ].join(' '),
    buildProps: buildTextcardsProps,
    features: [
      'Gradient text card intro',
      'Text card mid-section (zoom-in transition)',
      'Color B-roll with labels',
      '4 transition types (crossfade, slide-left, zoom-in, wipe)',
      'Karaoke captions (real whisper timestamps)',
      'TTS voiceover (Edge)',
      'Progress bar',
    ],
  },
];

// ─── Main ──────────────────────────────────────────────

async function main() {
  console.log('ReelStack — Reel Demos with TTS + Whisper Karaoke');
  console.log('═'.repeat(55));
  console.log('Pipeline: Text → Edge TTS → whisper.cpp → Remotion');
  console.log('═'.repeat(55));

  const renderer = createRenderer();

  for (const demo of DEMOS) {
    console.log('');
    console.log(`▸ ${demo.name.toUpperCase()}`);

    const { cues, voiceoverFile, duration } = await generateVoiceAndCues(demo.script, demo.name);
    const props = demo.buildProps(cues, voiceoverFile, duration);

    const outputPath = path.join(REMOTION_PKG_DIR, 'out', `demo-reel-${demo.name}.mp4`);
    console.log(`  → Rendering (${duration.toFixed(1)}s video)...`);

    const result = await renderer.render(props as any, {
      outputPath,
      compositionId: 'Reel',
    });

    const sec = (result.durationMs / 1000).toFixed(1);
    const mb = (result.sizeBytes / 1024 / 1024).toFixed(1);

    console.log(`  ✓ ${demo.name}: ${mb} MB | Render: ${sec}s`);

    // Cleanup voiceover from public/
    const voicePath = path.join(REMOTION_PKG_DIR, 'public', voiceoverFile);
    if (fs.existsSync(voicePath)) fs.unlinkSync(voicePath);
  }

  console.log('');
  console.log('═'.repeat(55));
  console.log('ALL DEMOS RENDERED:');
  for (const demo of DEMOS) {
    console.log(`\n  ${demo.name.toUpperCase()}:`);
    for (const f of demo.features) {
      console.log(`    ✓ ${f}`);
    }
  }
  console.log('');
  console.log('═'.repeat(55));
  console.log(`Output: ${path.join(REMOTION_PKG_DIR, 'out', 'demo-reel-*.mp4')}`);
}

main().catch((err) => {
  console.error('Demo failed:', err.message ?? err);
  process.exit(1);
});
