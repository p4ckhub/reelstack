import type { StorageAdapter } from '@reelstack/types';
import { detectDeploymentMode } from '@reelstack/queue';

export async function createStorage(): Promise<StorageAdapter> {
  const mode = detectDeploymentMode();

  if (mode === 'cloud') {
    const { SupabaseStorageAdapter } = await import('./supabase-storage');
    return new SupabaseStorageAdapter();
  }

  const { MinioStorageAdapter } = await import('./minio-storage');
  return new MinioStorageAdapter();
}

export { SupabaseStorageAdapter } from './supabase-storage';
export { MinioStorageAdapter } from './minio-storage';
