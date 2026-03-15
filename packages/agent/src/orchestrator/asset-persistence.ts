/**
 * Asset persistence — re-upload external assets to our own storage (R2/MinIO)
 * so URLs don't expire during render.
 *
 * Extracted from production-orchestrator.ts for reuse across pipeline modes.
 */
import { randomUUID } from 'crypto';
import fs from 'fs';
import { createStorage } from '@reelstack/storage';
import { createLogger } from '@reelstack/logger';
import type { GeneratedAsset } from '../types';

const defaultLog = createLogger('asset-persistence');

/**
 * Check if a URL already points to our own storage (MinIO/R2/Supabase).
 * These URLs don't need re-uploading since they won't expire unexpectedly.
 */
export function isOwnStorageUrl(url: string): boolean {
  const minioEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
  const minioPort = process.env.MINIO_PORT || '9000';
  try {
    const parsed = new URL(url);
    // MinIO URLs (local or custom endpoint)
    if (
      parsed.hostname === minioEndpoint ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1'
    ) {
      return true;
    }
    // MinIO with port in URL
    if (parsed.host === `${minioEndpoint}:${minioPort}`) {
      return true;
    }
    // R2 URLs
    if (parsed.hostname.endsWith('.r2.cloudflarestorage.com')) {
      return true;
    }
    // Supabase storage URLs
    if (parsed.hostname.endsWith('.supabase.co') && parsed.pathname.includes('/storage/')) {
      return true;
    }
  } catch {
    // Invalid URL - not our storage
  }
  return false;
}

/**
 * Re-upload external assets to our own storage so URLs don't expire during render.
 * Returns a new array with updated URLs; assets that fail to re-upload keep their original URL.
 */
export async function persistAssetsToStorage(
  assets: readonly GeneratedAsset[],
  jobId: string | undefined,
  log: ReturnType<typeof createLogger> = defaultLog
): Promise<GeneratedAsset[]> {
  const externalAssets = assets.filter((a) => a.url && !isOwnStorageUrl(a.url));
  if (externalAssets.length === 0) return [...assets];

  const storage = await createStorage();
  const prefix = `assets/${jobId ?? randomUUID()}`;

  const updatedMap = new Map<GeneratedAsset, string>();

  await Promise.all(
    externalAssets.map(async (asset) => {
      try {
        let buffer: Buffer;

        // Handle local file paths (e.g. Veo 3.1 returns /var/folders/... temp files)
        if (asset.url.startsWith('/') || asset.url.startsWith('file://')) {
          const filePath = asset.url.startsWith('file://') ? asset.url.slice(7) : asset.url;
          if (!fs.existsSync(filePath)) {
            log.warn(
              { path: filePath, shotId: asset.shotId },
              'Local asset file not found, keeping original path'
            );
            return;
          }
          buffer = fs.readFileSync(filePath);
        } else {
          const response = await fetch(asset.url, {
            signal: AbortSignal.timeout(60_000),
            redirect: 'error',
          });
          if (!response.ok) {
            log.warn(
              { url: asset.url, status: response.status, shotId: asset.shotId },
              'Failed to download asset, keeping original URL'
            );
            return;
          }
          buffer = Buffer.from(await response.arrayBuffer());
        }
        const ext = asset.type === 'ai-video' || asset.type === 'stock-video' ? 'mp4' : 'jpg';
        const key = `${prefix}/${asset.shotId ?? randomUUID()}.${ext}`;

        await storage.upload(buffer, key);
        const signedUrl = await storage.getSignedUrl(key, 7200);

        updatedMap.set(asset, signedUrl);
        log.info(
          { shotId: asset.shotId, key, originalUrl: asset.url.substring(0, 100) },
          'Asset persisted to storage'
        );
      } catch (err) {
        log.warn(
          { url: asset.url, shotId: asset.shotId, error: String(err) },
          'Failed to persist asset, keeping original URL'
        );
      }
    })
  );

  return assets.map((asset) => {
    const newUrl = updatedMap.get(asset);
    if (newUrl) {
      return { ...asset, url: newUrl };
    }
    return { ...asset };
  });
}
