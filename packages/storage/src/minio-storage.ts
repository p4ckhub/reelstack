import * as Minio from 'minio';
import type { StorageAdapter } from '@reelstack/types';
import { StorageError } from '@reelstack/types';
import { createLogger } from '@reelstack/logger';

const log = createLogger('minio-storage');

export class MinioStorageAdapter implements StorageAdapter {
  private client: Minio.Client;
  /**
   * Separate presign client pointing at the *external* hostname
   * (MINIO_PUBLIC_ENDPOINT). Only used when a caller explicitly asks for
   * a public URL — default `getSignedUrl()` still returns internal URLs
   * so pipeline steps that need to fetch the file back (e.g. Remotion
   * rendering in the same container) keep working.
   * Falls back to the internal client when no public endpoint is set.
   */
  private presignClientPublic: Minio.Client;
  private bucket: string;

  constructor() {
    const accessKey = process.env.MINIO_ACCESS_KEY;
    const secretKey = process.env.MINIO_SECRET_KEY;
    if (!accessKey || !secretKey) {
      throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY environment variables are required');
    }
    // Explicit region skips MinIO's bucket-location probe on first call,
    // which would otherwise try to reach the public endpoint via HTTP —
    // fatal when that endpoint (e.g. "localhost") isn't routable from the
    // worker container.
    const region = process.env.MINIO_REGION || 'us-east-1';
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000', 10) || 9000,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey,
      secretKey,
      region,
    });
    const publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT;
    this.presignClientPublic = publicEndpoint
      ? new Minio.Client({
          endPoint: publicEndpoint,
          port:
            parseInt(process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || '9000', 10) || 9000,
          useSSL: (process.env.MINIO_PUBLIC_USE_SSL ?? process.env.MINIO_USE_SSL) === 'true',
          accessKey,
          secretKey,
          region,
        })
      : this.client;
    this.bucket = process.env.MINIO_BUCKET || 'reelstack';
  }

  private validatePath(path: string): void {
    if (path.includes('..') || path.startsWith('/')) {
      throw new StorageError('Invalid storage path: must be relative and cannot contain ".."', {
        path,
      });
    }
  }

  private async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
  }

  async upload(file: Buffer, path: string): Promise<string> {
    this.validatePath(path);
    await this.ensureBucket();
    const startTime = performance.now();
    await this.client.putObject(this.bucket, path, file);
    const durationMs = Math.round(performance.now() - startTime);
    log.debug(
      { key: path, sizeKB: Math.round(file.length / 1024), durationMs },
      'Upload completed'
    );
    return path;
  }

  async download(path: string): Promise<Buffer> {
    this.validatePath(path);
    const startTime = performance.now();
    const stream = await this.client.getObject(this.bucket, path);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const result = Buffer.concat(chunks);
    const durationMs = Math.round(performance.now() - startTime);
    log.debug(
      { key: path, sizeKB: Math.round(result.length / 1024), durationMs },
      'Download completed'
    );
    return result;
  }

  async getSignedUrl(
    path: string,
    expiresIn = 3600,
    opts?: { audience?: 'internal' | 'external' }
  ): Promise<string> {
    this.validatePath(path);
    // Default to internal so pipeline steps inside the docker network keep
    // working. API routes that return a URL to the browser must pass
    // `{ audience: 'external' }`.
    const client = opts?.audience === 'external' ? this.presignClientPublic : this.client;
    return client.presignedGetObject(this.bucket, path, expiresIn);
  }

  async delete(path: string): Promise<void> {
    this.validatePath(path);
    await this.client.removeObject(this.bucket, path);
  }
}
