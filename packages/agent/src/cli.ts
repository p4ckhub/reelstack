#!/usr/bin/env bun
/**
 * ReelStack CLI -- step-by-step pipeline testing.
 *
 * Usage:
 *   bun run rs tts "Tekst do mówienia"
 *   bun run rs plan <tts.json> [--template jump-cut-dynamic]
 *   bun run rs assemble <plan.json> <tts.json>
 *   bun run rs render <composition.json>
 *   bun run rs heygen "Tekst dla avatara" [--iv] [--emotion Friendly]
 *   bun run rs heygen-poll <job-id>
 *   bun run rs heygen-status
 *   bun run rs image "prompt" [--tool nanobanana2-kie]
 *   bun run rs branded-image --template tip-card --brand techskills
 *
 * All outputs go to out/ (or --out <dir>).
 * Each command reads the previous step's output file.
 */
import { tts } from './commands/tts';
import { plan } from './commands/plan';
import { assemble } from './commands/assemble';
import { render } from './commands/render';
import { heygen, heygenPoll, heygenStatus, heygenLooks } from './commands/heygen';
import { lipsync, splitAudio } from './commands/lipsync';
import { assets } from './commands/assets';
import { transcribe } from './commands/transcribe';
import { regen } from './commands/regen';
import { replace } from './commands/replace';
import { image } from './commands/image';
import { brandedImage } from './commands/branded-image';

const B = '\x1b[36m',
  Y = '\x1b[33m',
  X = '\x1b[0m';

const command = process.argv[2];

const commands: Record<string, () => Promise<void>> = {
  tts,
  transcribe,
  plan,
  assets,
  assemble,
  render,
  regen,
  replace,
  heygen,
  'heygen-poll': heygenPoll,
  'heygen-status': heygenStatus,
  'heygen-looks': heygenLooks,
  'split-audio': splitAudio,
  lipsync,
  image,
  'branded-image': brandedImage,
};

if (!command || !commands[command]) {
  console.log(`${B}ReelStack CLI${X}

${Y}Pipeline A: Voiceover (TTS + przebitki):${X}
  bun run rs tts "Tekst"                    Generate voiceover + transcription
  bun run rs tts skrypt.txt                 Read script from file
  bun run rs plan tts.json                  Build template montage plan
  bun run rs assemble plan.json tts.json    Compose Remotion props
  bun run rs render composition.json        Render to MP4

${Y}Pipeline B: HeyGen avatar (talking head + przebitki):${X}
  bun run rs heygen "Tekst"                 Avatar III (1 cr/min, test mode)
  bun run rs heygen "Tekst" --iv            Avatar IV (5 cr/min)
  bun run rs heygen "Tekst" --avatar-v      Avatar V (10 cr/min, latest engine)
  bun run rs heygen-poll <job-id>           Check/resume generation
  bun run rs heygen-looks                   List available avatar looks (outfits)
  bun run rs heygen-looks --public          List HeyGen stock avatars
  bun run rs transcribe heygen.mp4          Extract audio -> Whisper transcription
  bun run rs plan tts.json --director       Build montage plan (AI director, LLM)
  bun run rs plan tts.json --director --assets ./my-assets/
  bun run rs assets plan.json               Generate images/videos for b-roll shots
  bun run rs assemble plan.json tts.json    Compose Remotion props
  bun run rs render composition.json        Render to MP4

  NOTE: HeyGen gives you audio+video in one file. Do NOT run tts.
  Use 'transcribe' to get word timestamps from the existing audio.

${Y}Asset management:${X}
  bun run rs regen <shot-id>                Regenerate one asset
  bun run rs regen shot-10 --prompt "..."   Regenerate with new prompt
  bun run rs replace <shot-id> <file>       Replace asset with your own file
  bun run rs replace shot-5 screen.mp4      Use your screencast for shot-5

${Y}Image generation:${X}
  bun run rs image "prompt"                 AI image via tool registry
  bun run rs image "prompt" --tool <id>     Specify tool (default: nanobanana2-kie)
  bun run rs branded-image                  List available templates and brands
  bun run rs branded-image --template tip-card --brand techskills --text "Hello"

${Y}Lip sync (AI talking head from image):${X}
  bun run rs lipsync <image.jpg>            Generate lip-synced clips per scene
  bun run rs lipsync img.jpg --tool seedance  Use Seedance instead of Kling

${Y}Utilities:${X}
  bun run rs split-audio tts.json           Split audio into per-scene segments
  bun run rs heygen-status                  Check HeyGen quota

${Y}Options:${X}
  --template <id>    Template (default: jump-cut-dynamic)
  --voice <id>       TTS voice (default: pl-PL-MarekNeural)
  --avatar-v         HeyGen Avatar V (10 cr/min, latest engine)
  --iv               HeyGen Avatar IV (5 cr/min)
  --look <id>        Avatar look ID (outfit/style from heygen-looks)
  --background <val> Background color "#hex" or image URL
  --motion <prompt>  Body motion (Avatar V: natural language, IV: gesture desc)
  --emotion <name>   Voice emotion (Excited, Friendly, Serious)
  --speed <n>        Voice speed (0.5-1.5)
  --tool <name>      Tool ID for image/lipsync commands
  --aspect <ratio>   Aspect ratio for image command (1:1, 9:16, 16:9)
  --assets <dir>     User assets dir for AI director (screenshots, screencasts)
  --out <dir>        Output directory (default: project out/)
`);
  process.exit(0);
}

await commands[command]();
