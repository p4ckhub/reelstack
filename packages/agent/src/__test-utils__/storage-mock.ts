import { vi } from 'vitest';

export const mockUpload = vi.fn();
export const mockGetSignedUrl = vi.fn();
export const mockDownload = vi.fn();
export const mockDelete = vi.fn();
export const mockExists = vi.fn();

const storageInstance = {
  upload: (...args: unknown[]) => mockUpload(...args),
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
  download: (...args: unknown[]) => mockDownload(...args),
  delete: (...args: unknown[]) => mockDelete(...args),
  exists: (...args: unknown[]) => mockExists(...args),
};

export const mockCreateStorage = vi.fn().mockResolvedValue(storageInstance);

export function storageMockFactory() {
  return {
    createStorage: (...args: unknown[]) => mockCreateStorage(...args),
  };
}
