import { createClient } from '@supabase/supabase-js';
import type { StorageAdapter } from '@reelstack/types';
import { StorageError } from '@reelstack/types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('supabase-storage');

export class SupabaseStorageAdapter implements StorageAdapter {
  private supabase;
  private bucket: string;

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    this.supabase = createClient(url, key);
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'videos';
  }

  private validatePath(path: string): void {
    if (path.includes('..') || path.startsWith('/')) {
      throw new StorageError('Invalid storage path: must be relative and cannot contain ".."', {
        path,
      });
    }
  }

  async upload(file: Buffer, path: string): Promise<string> {
    this.validatePath(path);
    const startTime = performance.now();
    const { error } = await this.supabase.storage.from(this.bucket).upload(path, file, {
      upsert: true,
    });
    if (error) throw new StorageError('Upload failed', { path, error: error.message });
    const durationMs = Math.round(performance.now() - startTime);
    log.debug(
      { key: path, sizeKB: Math.round(file.length / 1024), durationMs },
      'Upload completed'
    );
    return path;
  }

  private static readonly MAX_DOWNLOAD_SIZE = 500 * 1024 * 1024; // 500MB

  async download(path: string): Promise<Buffer> {
    this.validatePath(path);
    const startTime = performance.now();
    const { data, error } = await this.supabase.storage.from(this.bucket).download(path);
    if (error || !data) throw new StorageError('Download failed', { path, error: error?.message });
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > SupabaseStorageAdapter.MAX_DOWNLOAD_SIZE) {
      const sizeMb = (buffer.length / 1024 / 1024).toFixed(0);
      const limitMb = SupabaseStorageAdapter.MAX_DOWNLOAD_SIZE / 1024 / 1024;
      throw new StorageError(`File too large: ${sizeMb}MB exceeds ${limitMb}MB limit`, {
        path,
        sizeMb,
        limitMb,
      });
    }
    const durationMs = Math.round(performance.now() - startTime);
    log.debug(
      { key: path, sizeKB: Math.round(buffer.length / 1024), durationMs },
      'Download completed'
    );
    return buffer;
  }

  async getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
    this.validatePath(path);
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresIn);
    if (error || !data)
      throw new StorageError('Signed URL failed', { path, error: error?.message });
    return data.signedUrl;
  }

  async delete(path: string): Promise<void> {
    this.validatePath(path);
    const { error } = await this.supabase.storage.from(this.bucket).remove([path]);
    if (error) throw new StorageError('Delete failed', { path, error: error.message });
  }
}
