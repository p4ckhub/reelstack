/**
 * R2/storage helpers for CLI commands.
 * Consolidates 5+ duplicated upload patterns from cli.ts.
 */
import fs from 'fs';
import path from 'path';
import { D, X } from './cli-helpers';

let storageInstance: Awaited<ReturnType<typeof import('@reelstack/storage').createStorage>> | null =
  null;

/** Get or create storage client (cached). */
export async function createStorageClient() {
  if (storageInstance) return storageInstance;
  const { createStorage } = await import('@reelstack/storage');
  storageInstance = await createStorage();
  return storageInstance;
}

/**
 * Upload a local file to R2 and return a signed URL.
 *
 * @param filePath - Local file to upload
 * @param prefix - R2 key prefix (e.g. "assets/", "user-assets/", "lipsync/")
 * @param suffix - Optional suffix before extension (default: timestamp)
 * @param ttl - Signed URL TTL in seconds (default: 7200 = 2h)
 */
export async function uploadToR2(
  filePath: string,
  prefix: string,
  suffix?: string,
  ttl = 7200
): Promise<string> {
  const storage = await createStorageClient();
  const ext = path.extname(filePath) || '.bin';
  const name = path.basename(filePath, ext);
  const key = `${prefix}${name}-${suffix ?? Date.now()}${ext}`;
  await storage.upload(fs.readFileSync(filePath), key);
  const url = await storage.getSignedUrl(key, ttl);
  console.log(`${D}  Uploaded: ${key}${X}`);
  return url;
}

/**
 * Download a URL to a local file.
 */
export async function downloadFile(url: string, outputPath: string): Promise<boolean> {
  const res = await fetch(url);
  if (!res.ok) return false;
  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
  return true;
}
