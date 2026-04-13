/**
 * Describes user-provided assets (screenshots, screencasts, images) using vision models.
 *
 * Strategy:
 * - Gemini 2.5 Flash (primary): handles BOTH images and video, cheap, fast
 * - Anthropic Haiku (fallback for images): if no GEMINI_API_KEY
 *
 * Returns a 1-2 sentence description for the AI director.
 */
import { createLogger } from '@reelstack/logger';
import { getModel } from '../config/models';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const log = createLogger('asset-describer');

/**
 * Lazy-resolve GEMINI_API_KEY from env or Vaultwarden.
 * Cached after first call so subsequent describeAsset() calls don't re-fetch.
 */
let cachedGeminiKey: string | null | undefined;
function getGeminiKey(): string | null {
  if (cachedGeminiKey !== undefined) return cachedGeminiKey;

  if (process.env.GEMINI_API_KEY) {
    cachedGeminiKey = process.env.GEMINI_API_KEY;
    return cachedGeminiKey;
  }

  // Fallback: fetch from Vaultwarden (only works if user is logged in + BW_SESSION set)
  try {
    const key = execSync('bw get password "Gemini API Key (plkjurczyk)"', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
    if (key) {
      log.info('GEMINI_API_KEY loaded from Vaultwarden');
      cachedGeminiKey = key;
      // Export for downstream calls in this process
      process.env.GEMINI_API_KEY = key;
      return cachedGeminiKey;
    }
  } catch {
    /* bw not available or not unlocked */
  }

  cachedGeminiKey = null;
  return null;
}

const DESCRIBE_PROMPT = `Describe this for a video production AI director.
Return ONLY a SHORT description (1-2 sentences, max 30 words) of what's visible.
Focus on: what app/tool/UI is shown, what content is visible, what action is happening.
Examples:
- "VS Code editor with Python file open, terminal showing test output"
- "Screen recording of someone navigating Google AI Studio, downloading a model"
- "Terminal with Docker containers running, 3 services healthy"
Do NOT describe quality, resolution, or style. Just what's IN the image/video.`;

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
};

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']);

/**
 * Describe an asset file (image or video) using a vision model.
 * Tries Gemini first (supports video + images), falls back to Anthropic (images only).
 */
export async function describeAsset(filePath: string): Promise<string> {
  const fallback = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_MAP[ext];
  if (!mimeType) return fallback;

  const isVideo = VIDEO_EXTS.has(ext);

  // Check file size — Gemini inline limit is 100MB
  const stat = fs.statSync(filePath);
  if (stat.size > 95 * 1024 * 1024) {
    log.warn(
      { file: fallback, sizeMB: (stat.size / 1024 / 1024).toFixed(0) },
      'File too large for inline vision, using filename'
    );
    return `${isVideo ? 'Video' : 'Image'}: ${fallback} (${(stat.size / 1024 / 1024).toFixed(0)}MB)`;
  }

  // Try Gemini first (handles both images and video)
  const geminiKey = getGeminiKey();
  if (geminiKey) {
    const result = await describeWithGemini(filePath, mimeType, geminiKey);
    if (result) return result;
  }

  // Fallback: Anthropic (images only)
  if (!isVideo && process.env.ANTHROPIC_API_KEY) {
    const result = await describeWithAnthropic(filePath, mimeType);
    if (result) return result;
  }

  log.info({ file: fallback }, 'No vision API available, using filename');
  return `${isVideo ? 'Video' : 'Image'}: ${fallback}`;
}

async function describeWithGemini(
  filePath: string,
  mimeType: string,
  apiKey: string
): Promise<string | null> {
  const fallback = path.basename(filePath);

  try {
    const fileData = fs.readFileSync(filePath);
    const base64 = fileData.toString('base64');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mimeType, data: base64 } },
                { text: DESCRIBE_PROMPT },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
        redirect: 'error',
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      log.warn({ status: res.status, error: errText.substring(0, 200) }, 'Gemini vision error');
      return null;
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) return null;

    log.info({ file: fallback, description: text, provider: 'gemini' }, 'Asset described');
    return text;
  } catch (err) {
    log.warn({ error: String(err), file: fallback }, 'Gemini vision call failed');
    return null;
  }
}

async function describeWithAnthropic(filePath: string, mediaType: string): Promise<string | null> {
  const fallback = path.basename(filePath);

  try {
    const imageData = fs.readFileSync(filePath);
    const base64 = imageData.toString('base64');
    const model = getModel('assetDescriber', 'anthropic');

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return null;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 150,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              { type: 'text', text: DESCRIBE_PROMPT },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });

    if (!res.ok) {
      log.warn({ status: res.status }, 'Anthropic vision error');
      return null;
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((b) => b.type === 'text')?.text?.trim();

    if (!text) return null;

    log.info({ file: fallback, description: text, provider: 'anthropic' }, 'Asset described');
    return text;
  } catch (err) {
    log.warn({ error: String(err), file: fallback }, 'Anthropic vision call failed');
    return null;
  }
}
