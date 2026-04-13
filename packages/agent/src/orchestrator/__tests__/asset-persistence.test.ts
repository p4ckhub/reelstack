import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────

import {
  storageMockFactory,
  mockUpload,
  mockGetSignedUrl,
  mockCreateStorage,
} from '../../__test-utils__/storage-mock';

vi.mock('@reelstack/storage', storageMockFactory);
mockUpload.mockResolvedValue(undefined);
mockGetSignedUrl.mockResolvedValue('https://r2.example.com/signed-url');

vi.mock('crypto', () => ({
  randomUUID: () => 'mock-uuid-1234',
}));

import { isOwnStorageUrl, persistAssetsToStorage } from '../asset-persistence';
import type { GeneratedAsset } from '../../types';

const originalFetch = globalThis.fetch;

function mockFetch(impl: (...args: unknown[]) => unknown): void {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
}

// ── Helpers ────────────────────────────────────────────────────

function makeAsset(overrides: Partial<GeneratedAsset> = {}): GeneratedAsset {
  return {
    toolId: 'test-tool',
    url: 'https://external.example.com/video.mp4',
    type: 'ai-video',
    shotId: 'shot-1',
    ...overrides,
  };
}

// ── isOwnStorageUrl ────────────────────────────────────────────

describe('isOwnStorageUrl', () => {
  const savedEnv = { MINIO_ENDPOINT: '', MINIO_PORT: '' };

  beforeEach(() => {
    savedEnv.MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? '';
    savedEnv.MINIO_PORT = process.env.MINIO_PORT ?? '';
    delete process.env.MINIO_ENDPOINT;
    delete process.env.MINIO_PORT;
  });

  afterEach(() => {
    if (savedEnv.MINIO_ENDPOINT) process.env.MINIO_ENDPOINT = savedEnv.MINIO_ENDPOINT;
    else delete process.env.MINIO_ENDPOINT;
    if (savedEnv.MINIO_PORT) process.env.MINIO_PORT = savedEnv.MINIO_PORT;
    else delete process.env.MINIO_PORT;
  });

  it('recognizes R2 URLs', () => {
    expect(isOwnStorageUrl('https://bucket.r2.cloudflarestorage.com/key')).toBe(true);
    expect(isOwnStorageUrl('https://abc123.r2.cloudflarestorage.com/path/to/file.mp4')).toBe(true);
  });

  it('recognizes localhost URLs', () => {
    expect(isOwnStorageUrl('http://localhost:9000/bucket/key')).toBe(true);
    expect(isOwnStorageUrl('http://127.0.0.1:9000/bucket/key')).toBe(true);
  });

  it('recognizes Supabase storage URLs', () => {
    expect(isOwnStorageUrl('https://abc.supabase.co/storage/v1/object/key')).toBe(true);
  });

  it('rejects Supabase non-storage URLs', () => {
    expect(isOwnStorageUrl('https://abc.supabase.co/rest/v1/table')).toBe(false);
  });

  it('recognizes custom MinIO endpoint', () => {
    process.env.MINIO_ENDPOINT = 'minio.internal.example.com';
    expect(isOwnStorageUrl('https://minio.internal.example.com/bucket/key')).toBe(true);
  });

  it('recognizes custom MinIO endpoint with port', () => {
    process.env.MINIO_ENDPOINT = 'minio.local';
    process.env.MINIO_PORT = '9001';
    expect(isOwnStorageUrl('http://minio.local:9001/bucket/key')).toBe(true);
  });

  it('uses default MinIO port 9000 when MINIO_PORT not set', () => {
    process.env.MINIO_ENDPOINT = 'minio.local';
    expect(isOwnStorageUrl('http://minio.local:9000/bucket/key')).toBe(true);
  });

  it('rejects external URLs', () => {
    expect(isOwnStorageUrl('https://cdn.replicate.delivery/video.mp4')).toBe(false);
    expect(isOwnStorageUrl('https://s3.amazonaws.com/bucket/key')).toBe(false);
    expect(isOwnStorageUrl('https://storage.googleapis.com/bucket/key')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(isOwnStorageUrl('not-a-url')).toBe(false);
    expect(isOwnStorageUrl('')).toBe(false);
  });

  it('returns false for non-matching MinIO endpoint', () => {
    process.env.MINIO_ENDPOINT = 'minio.internal.example.com';
    expect(isOwnStorageUrl('https://other-host.com/bucket/key')).toBe(false);
  });
});

// ── persistAssetsToStorage ─────────────────────────────────────

describe('persistAssetsToStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
    // Ensure external URLs are not recognized as own storage
    delete process.env.MINIO_ENDPOINT;
    delete process.env.MINIO_PORT;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns unchanged array when all assets are own-storage URLs', async () => {
    const assets = [
      makeAsset({ url: 'https://bucket.r2.cloudflarestorage.com/key.mp4' }),
      makeAsset({ url: 'http://localhost:9000/bucket/key.mp4', shotId: 'shot-2' }),
    ];

    const result = await persistAssetsToStorage(assets, 'job-1');

    expect(mockCreateStorage).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('https://bucket.r2.cloudflarestorage.com/key.mp4');
    expect(result[1].url).toBe('http://localhost:9000/bucket/key.mp4');
  });

  it('re-uploads external remote URLs to storage', async () => {
    const fakeBuffer = new ArrayBuffer(100);
    const mockResponse = {
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(fakeBuffer),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch;

    const assets = [makeAsset({ url: 'https://external.example.com/video.mp4', type: 'ai-video' })];

    const result = await persistAssetsToStorage(assets, 'job-42');

    expect(mockCreateStorage).toHaveBeenCalledOnce();
    expect(mockUpload).toHaveBeenCalledOnce();
    expect(mockGetSignedUrl).toHaveBeenCalledWith('assets/job-42/shot-1.mp4', 7200);
    expect(result[0].url).toBe('https://r2.example.com/signed-url');
  });

  it('uses .jpg extension for image assets', async () => {
    const fakeBuffer = new ArrayBuffer(50);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(fakeBuffer),
    }) as unknown as typeof fetch;

    const assets = [makeAsset({ url: 'https://external.example.com/img.png', type: 'ai-image' })];

    await persistAssetsToStorage(assets, 'job-1');

    expect(mockUpload).toHaveBeenCalledWith(expect.any(Buffer), 'assets/job-1/shot-1.jpg');
  });

  it('uses .mp4 extension for stock-video assets', async () => {
    const fakeBuffer = new ArrayBuffer(50);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(fakeBuffer),
    }) as unknown as typeof fetch;

    const assets = [
      makeAsset({ url: 'https://external.example.com/vid.webm', type: 'stock-video' }),
    ];

    await persistAssetsToStorage(assets, 'job-1');

    expect(mockUpload).toHaveBeenCalledWith(expect.any(Buffer), 'assets/job-1/shot-1.mp4');
  });

  it('reads local files within tmpdir', async () => {
    const os = await import('os');
    const fs = await import('fs');
    const tmpRoot = os.tmpdir();
    const localPath = `${tmpRoot}/reelstack-test/video.mp4`;

    const readSpy = vi.spyOn(fs.default, 'readFileSync').mockReturnValue(Buffer.from('fake-data'));

    const assets = [makeAsset({ url: localPath, type: 'ai-video' })];

    const result = await persistAssetsToStorage(assets, 'job-1');

    expect(readSpy).toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalledOnce();
    expect(result[0].url).toBe('https://r2.example.com/signed-url');

    readSpy.mockRestore();
  });

  it('reads file:// URLs within tmpdir', async () => {
    const os = await import('os');
    const fs = await import('fs');
    const tmpRoot = os.tmpdir();
    const localPath = `file://${tmpRoot}/reelstack-test/video.mp4`;

    const readSpy = vi.spyOn(fs.default, 'readFileSync').mockReturnValue(Buffer.from('fake-data'));

    const assets = [makeAsset({ url: localPath, type: 'ai-video' })];

    const result = await persistAssetsToStorage(assets, 'job-1');

    expect(readSpy).toHaveBeenCalled();
    expect(result[0].url).toBe('https://r2.example.com/signed-url');

    readSpy.mockRestore();
  });

  it('rejects local file paths outside tmpdir (path traversal protection)', async () => {
    const assets = [makeAsset({ url: '/etc/passwd', type: 'ai-video' })];

    const result = await persistAssetsToStorage(assets, 'job-1');

    // Should keep original URL (not uploaded)
    expect(mockUpload).not.toHaveBeenCalled();
    expect(result[0].url).toBe('/etc/passwd');
  });

  it('rejects path traversal via ../', async () => {
    const os = await import('os');
    const tmpRoot = os.tmpdir();
    const traversalPath = `${tmpRoot}/../../../etc/shadow`;

    const assets = [makeAsset({ url: traversalPath, type: 'ai-video' })];

    const result = await persistAssetsToStorage(assets, 'job-1');

    expect(mockUpload).not.toHaveBeenCalled();
    expect(result[0].url).toBe(traversalPath);
  });

  it('keeps original URL when download fails (non-ok response)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;

    const originalUrl = 'https://external.example.com/missing.mp4';
    const assets = [makeAsset({ url: originalUrl })];

    const result = await persistAssetsToStorage(assets, 'job-1');

    expect(result[0].url).toBe(originalUrl);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('keeps original URL when upload fails', async () => {
    const fakeBuffer = new ArrayBuffer(50);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(fakeBuffer),
    }) as unknown as typeof fetch;
    mockUpload.mockRejectedValueOnce(new Error('Upload failed'));

    const originalUrl = 'https://external.example.com/video.mp4';
    const assets = [makeAsset({ url: originalUrl })];

    const result = await persistAssetsToStorage(assets, 'job-1');

    expect(result[0].url).toBe(originalUrl);
  });

  it('keeps original URL when local file read fails', async () => {
    const os = await import('os');
    const fs = await import('fs');
    const tmpRoot = os.tmpdir();
    const localPath = `${tmpRoot}/nonexistent/video.mp4`;

    const readSpy = vi.spyOn(fs.default, 'readFileSync').mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    const assets = [makeAsset({ url: localPath, type: 'ai-video' })];

    const result = await persistAssetsToStorage(assets, 'job-1');

    expect(result[0].url).toBe(localPath);
    expect(mockUpload).not.toHaveBeenCalled();

    readSpy.mockRestore();
  });

  it('handles mixed own-storage and external assets', async () => {
    const fakeBuffer = new ArrayBuffer(50);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(fakeBuffer),
    }) as unknown as typeof fetch;

    const assets = [
      makeAsset({ url: 'https://bucket.r2.cloudflarestorage.com/own.mp4', shotId: 'shot-own' }),
      makeAsset({
        url: 'https://external.example.com/external.mp4',
        shotId: 'shot-ext',
        type: 'ai-video',
      }),
    ];

    const result = await persistAssetsToStorage(assets, 'job-1');

    expect(result).toHaveLength(2);
    // Own storage: URL unchanged
    expect(result[0].url).toBe('https://bucket.r2.cloudflarestorage.com/own.mp4');
    // External: re-uploaded
    expect(result[1].url).toBe('https://r2.example.com/signed-url');
    // Only one upload (for the external asset)
    expect(mockUpload).toHaveBeenCalledOnce();
  });

  it('uses randomUUID for jobId when not provided', async () => {
    const fakeBuffer = new ArrayBuffer(50);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(fakeBuffer),
    }) as unknown as typeof fetch;

    const assets = [makeAsset({ url: 'https://external.example.com/video.mp4', type: 'ai-video' })];

    await persistAssetsToStorage(assets, undefined);

    // randomUUID mocked to 'mock-uuid-1234'
    expect(mockUpload).toHaveBeenCalledWith(expect.any(Buffer), 'assets/mock-uuid-1234/shot-1.mp4');
  });

  it('handles empty assets array', async () => {
    const result = await persistAssetsToStorage([], 'job-1');

    expect(result).toEqual([]);
    expect(mockCreateStorage).not.toHaveBeenCalled();
  });

  it('preserves asset properties other than url', async () => {
    const fakeBuffer = new ArrayBuffer(50);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(fakeBuffer),
    }) as unknown as typeof fetch;

    const assets = [
      makeAsset({
        url: 'https://external.example.com/video.mp4',
        toolId: 'veo31',
        shotId: 'shot-5',
        type: 'ai-video',
        durationSeconds: 5.2,
      }),
    ];

    const result = await persistAssetsToStorage(assets, 'job-1');

    expect(result[0].toolId).toBe('veo31');
    expect(result[0].shotId).toBe('shot-5');
    expect(result[0].type).toBe('ai-video');
    expect(result[0].durationSeconds).toBe(5.2);
    expect(result[0].url).toBe('https://r2.example.com/signed-url');
  });

  it('handles fetch throwing (network error)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;

    const originalUrl = 'https://external.example.com/video.mp4';
    const assets = [makeAsset({ url: originalUrl })];

    const result = await persistAssetsToStorage(assets, 'job-1');

    expect(result[0].url).toBe(originalUrl);
  });
});
