import { createStorage } from '@reelstack/storage';
import {
  getReelJobInternal,
  updateReelJobStatus,
} from '@reelstack/database';
import { createLogger } from '@reelstack/logger';
import { generateASS } from '@reelstack/ffmpeg';
import type { SubtitleCue, SubtitleStyle } from '@reelstack/types';
import { spawn } from 'child_process';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const log = createLogger('render-worker');

export async function processRenderJob(jobId: string): Promise<void> {
  const job = await getReelJobInternal(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const storage = await createStorage();

  await updateReelJobStatus(jobId, {
    status: 'PROCESSING',
    progress: 0,
    startedAt: new Date(),
  });

  const tempDir = await mkdtemp(join(tmpdir(), 'sb-render-'));
  const inputPath = join(tempDir, 'input.mp4');
  const assPath = join(tempDir, 'subtitles.ass');
  const outputPath = join(tempDir, 'output.mp4');

  try {
    // Get subtitles from reelConfig
    const reelConfig = job.reelConfig as Record<string, unknown> | null;
    const cues = ((reelConfig?.cues as SubtitleCue[]) ?? []);
    const style = (reelConfig?.style ?? null) as SubtitleStyle | null;
    const videoFilePath = reelConfig?.videoFilePath as string | undefined;

    if (!videoFilePath) {
      throw new Error('No videoFilePath in reelConfig');
    }

    if (cues.length === 0) {
      throw new Error('No subtitle cues found');
    }

    // Download video from storage
    await updateReelJobStatus(jobId, { progress: 5 });
    const videoData = await storage.download(videoFilePath);
    await writeFile(inputPath, videoData);

    // Get video dimensions from reelConfig
    const width = (reelConfig?.width as number | undefined) ?? 1920;
    const height = (reelConfig?.height as number | undefined) ?? 1080;

    // Generate ASS file
    const assContent = generateASS(cues, style as SubtitleStyle, width, height);
    await writeFile(assPath, assContent, 'utf-8');
    await updateReelJobStatus(jobId, { progress: 10 });

    // Run FFmpeg
    const progress = await runFFmpeg(inputPath, assPath, outputPath, (p) => {
      updateReelJobStatus(jobId, { progress: 10 + Math.round(p * 80) }).catch(err => log.warn({ jobId, err }, 'Progress update failed'));
    });

    if (!progress) {
      throw new Error('FFmpeg failed');
    }

    // Upload output
    await updateReelJobStatus(jobId, { progress: 95 });
    const outputBuffer = await readFile(outputPath);
    const outputKey = `renders/${jobId}/output.mp4`;
    await storage.upload(outputBuffer, outputKey);

    const outputUrl = await storage.getSignedUrl(outputKey, 86400); // 24h

    await updateReelJobStatus(jobId, {
      status: 'COMPLETED',
      progress: 100,
      outputUrl,
      completedAt: new Date(),
    });
  } catch (err) {
    await updateReelJobStatus(jobId, {
      status: 'FAILED',
      error: err instanceof Error ? err.message : 'Unknown error',
      completedAt: new Date(),
    });
    throw err;
  } finally {
    // Cleanup temp files
    await Promise.allSettled([
      unlink(inputPath),
      unlink(assPath),
      unlink(outputPath),
    ]);
  }
}

function runFFmpeg(
  inputPath: string,
  assPath: string,
  outputPath: string,
  onProgress: (fraction: number) => void,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vf', `ass=${assPath}`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'copy',
      '-y',
      '-progress', 'pipe:1',
      outputPath,
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let duration = 0;
    let stderr = '';
    const MAX_STDERR_LENGTH = 10_000;

    proc.stderr.on('data', (data: Buffer) => {
      if (stderr.length < MAX_STDERR_LENGTH) {
        stderr += data.toString();
      }
      const match = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      if (match && duration === 0) {
        duration = parseFloat(match[1]) * 3600 + parseFloat(match[2]) * 60 + parseFloat(match[3]);
      }
    });

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      const match = text.match(/out_time_us=(\d+)/);
      if (match && duration > 0) {
        const currentTime = parseInt(match[1]) / 1_000_000;
        onProgress(Math.min(currentTime / duration, 1));
      }
    });

    proc.on('close', (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });

    proc.on('error', (err) => {
      proc.kill();
      reject(err);
    });
  });
}
