import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { generateASS } from '@reelstack/ffmpeg';
import type { SubtitleCue, SubtitleStyle } from '@reelstack/types';

let ffmpeg: FFmpeg | null = null;

export type RenderProgress = {
  phase: 'loading' | 'rendering' | 'done' | 'error';
  progress: number; // 0-100
  message: string;
};

type ProgressCallback = (progress: RenderProgress) => void;

async function getFFmpeg(onProgress: ProgressCallback): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  onProgress({ phase: 'loading', progress: 0, message: 'Loading FFmpeg...' });

  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[ffmpeg]', message);
    }
  });

  ffmpeg.on('progress', ({ progress }) => {
    const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    onProgress({ phase: 'rendering', progress: pct, message: `Rendering: ${pct}%` });
  });

  const baseURL =
    process.env.NEXT_PUBLIC_FFMPEG_CORE_URL ??
    'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  onProgress({ phase: 'loading', progress: 100, message: 'FFmpeg loaded' });
  return ffmpeg;
}

export async function renderVideo(
  videoFile: File,
  cues: SubtitleCue[],
  style: SubtitleStyle,
  videoWidth: number,
  videoHeight: number,
  onProgress: ProgressCallback
): Promise<Blob> {
  const ff = await getFFmpeg(onProgress);

  onProgress({ phase: 'rendering', progress: 0, message: 'Preparing files...' });

  // Write video file
  const videoData = await fetchFile(videoFile);
  await ff.writeFile('input.mp4', videoData);

  // Generate and write ASS subtitle file
  const assContent = generateASS(cues, style, videoWidth, videoHeight);
  const encoder = new TextEncoder();
  await ff.writeFile('subtitles.ass', encoder.encode(assContent));

  onProgress({ phase: 'rendering', progress: 5, message: 'Burning subtitles...' });

  // Render with subtitles filter
  await ff.exec([
    '-i', 'input.mp4',
    '-vf', `ass=subtitles.ass`,
    '-c:a', 'copy',
    '-preset', 'fast',
    'output.mp4',
  ]);

  // Read result
  const data = (await ff.readFile('output.mp4')) as Uint8Array;

  // Cleanup
  await ff.deleteFile('input.mp4');
  await ff.deleteFile('subtitles.ass');
  await ff.deleteFile('output.mp4');

  onProgress({ phase: 'done', progress: 100, message: 'Done!' });

  // Copy to plain ArrayBuffer to avoid SharedArrayBuffer TS incompatibility
  const buffer = new Uint8Array(data).buffer as ArrayBuffer;
  return new Blob([buffer], { type: 'video/mp4' });
}
