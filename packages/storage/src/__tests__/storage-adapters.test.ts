import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==========================================
// Mock MinIO client
// ==========================================
const mockMinioClient = {
  bucketExists: vi.fn().mockResolvedValue(true),
  makeBucket: vi.fn().mockResolvedValue(undefined),
  putObject: vi.fn().mockResolvedValue(undefined),
  getObject: vi.fn(),
  presignedGetObject: vi.fn().mockResolvedValue('https://signed.url/file'),
  removeObject: vi.fn().mockResolvedValue(undefined),
};

vi.mock('minio', () => {
  return {
    Client: class MockClient {
      bucketExists = mockMinioClient.bucketExists;
      makeBucket = mockMinioClient.makeBucket;
      putObject = mockMinioClient.putObject;
      getObject = mockMinioClient.getObject;
      presignedGetObject = mockMinioClient.presignedGetObject;
      removeObject = mockMinioClient.removeObject;
    },
  };
});

// ==========================================
// Mock Supabase client
// ==========================================
const mockStorageFrom = {
  upload: vi.fn(),
  download: vi.fn(),
  createSignedUrl: vi.fn(),
  remove: vi.fn(),
};

const mockSupabaseClient = {
  storage: {
    from: vi.fn().mockReturnValue(mockStorageFrom),
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue(mockSupabaseClient),
}));

describe('MinioStorageAdapter', () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set required env vars
    process.env.MINIO_ACCESS_KEY = 'test-access';
    process.env.MINIO_SECRET_KEY = 'test-secret';
    process.env.MINIO_ENDPOINT = 'localhost';
    process.env.MINIO_PORT = '9000';
    process.env.MINIO_BUCKET = 'test-bucket';

    const { MinioStorageAdapter } = await import('../minio-storage');
    adapter = new MinioStorageAdapter();
  });

  describe('path validation', () => {
    it('rejects paths with ".."', async () => {
      await expect(adapter.upload(Buffer.from('x'), '../etc/passwd')).rejects.toThrow(
        'Invalid storage path'
      );
    });

    it('rejects absolute paths', async () => {
      await expect(adapter.upload(Buffer.from('x'), '/etc/passwd')).rejects.toThrow(
        'Invalid storage path'
      );
    });

    it('accepts valid relative paths', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);
      mockMinioClient.putObject.mockResolvedValue(undefined);

      const result = await adapter.upload(Buffer.from('data'), 'videos/test.mp4');
      expect(result).toBe('videos/test.mp4');
    });
  });

  describe('validatePath called on all operations', () => {
    it('validates path on download', async () => {
      await expect(adapter.download('../secret')).rejects.toThrow('Invalid storage path');
    });

    it('validates path on getSignedUrl', async () => {
      await expect(adapter.getSignedUrl('/absolute/path')).rejects.toThrow('Invalid storage path');
    });

    it('validates path on delete', async () => {
      await expect(adapter.delete('../../../etc/shadow')).rejects.toThrow('Invalid storage path');
    });
  });

  describe('upload', () => {
    it('calls putObject with correct arguments', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);
      mockMinioClient.putObject.mockResolvedValue(undefined);

      const buf = Buffer.from('file content');
      await adapter.upload(buf, 'uploads/video.mp4');

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'test-bucket',
        'uploads/video.mp4',
        buf
      );
    });

    it('creates bucket if it does not exist', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(false);
      mockMinioClient.makeBucket.mockResolvedValue(undefined);
      mockMinioClient.putObject.mockResolvedValue(undefined);

      await adapter.upload(Buffer.from('x'), 'file.mp4');

      expect(mockMinioClient.makeBucket).toHaveBeenCalledWith('test-bucket');
    });
  });

  describe('error handling', () => {
    it('propagates upload errors', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);
      mockMinioClient.putObject.mockRejectedValue(new Error('Network error'));

      await expect(adapter.upload(Buffer.from('x'), 'file.mp4')).rejects.toThrow('Network error');
    });
  });
});

describe('SupabaseStorageAdapter', () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.SUPABASE_STORAGE_BUCKET = 'test-bucket';

    const { SupabaseStorageAdapter } = await import('../supabase-storage');
    adapter = new SupabaseStorageAdapter();
  });

  describe('path validation', () => {
    it('rejects paths with ".."', async () => {
      await expect(adapter.upload(Buffer.from('x'), '../escape')).rejects.toThrow(
        'Invalid storage path'
      );
    });

    it('rejects absolute paths', async () => {
      await expect(adapter.upload(Buffer.from('x'), '/root/file')).rejects.toThrow(
        'Invalid storage path'
      );
    });

    it('accepts valid relative paths', async () => {
      mockStorageFrom.upload.mockResolvedValue({ error: null });

      const result = await adapter.upload(Buffer.from('data'), 'videos/test.mp4');
      expect(result).toBe('videos/test.mp4');
    });
  });

  describe('validatePath called on all operations', () => {
    it('validates path on download', async () => {
      await expect(adapter.download('../secret')).rejects.toThrow('Invalid storage path');
    });

    it('validates path on getSignedUrl', async () => {
      await expect(adapter.getSignedUrl('/absolute/path')).rejects.toThrow('Invalid storage path');
    });

    it('validates path on delete', async () => {
      await expect(adapter.delete('../../../etc/shadow')).rejects.toThrow('Invalid storage path');
    });
  });

  describe('upload', () => {
    it('throws on upload failure', async () => {
      mockStorageFrom.upload.mockResolvedValue({ error: { message: 'Quota exceeded' } });

      await expect(adapter.upload(Buffer.from('x'), 'file.mp4')).rejects.toThrow('Upload failed');
    });
  });

  describe('download size limit', () => {
    it('throws if downloaded file exceeds 500MB', async () => {
      // Create a mock blob whose arrayBuffer returns a large buffer
      const largeSize = 501 * 1024 * 1024;
      const mockBlob = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(largeSize)),
      };
      mockStorageFrom.download.mockResolvedValue({ data: mockBlob, error: null });

      await expect(adapter.download('large-file.mp4')).rejects.toThrow('File too large');
    });

    it('succeeds for files within size limit', async () => {
      const smallBuf = new ArrayBuffer(1024);
      const mockBlob = {
        arrayBuffer: vi.fn().mockResolvedValue(smallBuf),
      };
      mockStorageFrom.download.mockResolvedValue({ data: mockBlob, error: null });

      const result = await adapter.download('small-file.mp4');
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(1024);
    });
  });

  describe('getSignedUrl', () => {
    it('returns signed URL on success', async () => {
      mockStorageFrom.createSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://signed.example.com/file' },
        error: null,
      });

      const url = await adapter.getSignedUrl('file.mp4');
      expect(url).toBe('https://signed.example.com/file');
    });

    it('throws on error', async () => {
      mockStorageFrom.createSignedUrl.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(adapter.getSignedUrl('missing.mp4')).rejects.toThrow('Signed URL failed');
    });
  });

  describe('delete', () => {
    it('throws on delete failure', async () => {
      mockStorageFrom.remove.mockResolvedValue({ error: { message: 'Permission denied' } });

      await expect(adapter.delete('protected.mp4')).rejects.toThrow('Delete failed');
    });
  });
});
