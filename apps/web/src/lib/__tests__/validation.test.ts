import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateMagicBytes,
  sanitizeSubtitleText,
  getTierLimits,
  validateFileSize,
  _clearTierCache,
} from '../api/validation';

// Mock DB — getTierLimits falls back to TIER_DEFAULTS when findUnique returns null
vi.mock('@reelstack/database', () => ({
  prisma: {
    tierConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

describe('validateMagicBytes', () => {
  it('accepts valid MP4 (ftyp)', () => {
    const buf = new ArrayBuffer(16);
    const view = new Uint8Array(buf);
    view[4] = 0x66;
    view[5] = 0x74;
    view[6] = 0x79;
    view[7] = 0x70;
    expect(validateMagicBytes(buf, 'video/mp4')).toBe(true);
  });

  it('accepts valid WebM (EBML)', () => {
    const buf = new ArrayBuffer(16);
    const view = new Uint8Array(buf);
    view[0] = 0x1a;
    view[1] = 0x45;
    view[2] = 0xdf;
    view[3] = 0xa3;
    expect(validateMagicBytes(buf, 'video/webm')).toBe(true);
  });

  it('rejects invalid bytes', () => {
    const buf = new ArrayBuffer(16);
    expect(validateMagicBytes(buf, 'video/mp4')).toBe(false);
  });

  it('rejects unknown mime type', () => {
    const buf = new ArrayBuffer(16);
    expect(validateMagicBytes(buf, 'video/avi')).toBe(false);
  });
});

describe('sanitizeSubtitleText', () => {
  it('strips script tags', () => {
    expect(sanitizeSubtitleText('<script>alert(1)</script>Hello')).toBe('Hello');
  });

  it('strips HTML tags', () => {
    expect(sanitizeSubtitleText('<b>Bold</b> <i>Italic</i>')).toBe('Bold Italic');
  });

  it('truncates to 500 chars', () => {
    const long = 'a'.repeat(600);
    expect(sanitizeSubtitleText(long)).toHaveLength(500);
  });

  it('passes plain text through', () => {
    expect(sanitizeSubtitleText('Hello World')).toBe('Hello World');
  });
});

// getTierLimits: DB returns null → falls back to hardcoded TIER_DEFAULTS
describe('getTierLimits (DB fallback)', () => {
  beforeEach(() => {
    _clearTierCache();
  });

  it('falls back to FREE defaults when DB returns null', async () => {
    const { prisma } = await import('@reelstack/database');
    vi.mocked(prisma.tierConfig.findUnique).mockResolvedValueOnce(null);

    const limits = await getTierLimits('FREE');
    expect(limits.maxFileSize).toBe(100 * 1024 * 1024);
    expect(limits.creditsPerMonth).toBe(30);
  });

  it('uses DB value when TierConfig row exists', async () => {
    const { prisma } = await import('@reelstack/database');
    vi.mocked(prisma.tierConfig.findUnique).mockResolvedValueOnce({
      tier: 'FREE',
      productSlug: 'reelstack',
      creditsPerMonth: 10,
      maxFileSizeMb: 200,
      maxDurationSec: 300,
      active: true,
      updatedAt: new Date(),
    });

    const limits = await getTierLimits('FREE');
    expect(limits.creditsPerMonth).toBe(10);
    expect(limits.maxFileSize).toBe(200 * 1024 * 1024);
    expect(limits.maxDuration).toBe(300);
  });

  it('returns Infinity maxDuration when maxDurationSec is -1', async () => {
    const { prisma } = await import('@reelstack/database');
    vi.mocked(prisma.tierConfig.findUnique).mockResolvedValueOnce({
      tier: 'AGENCY',
      productSlug: 'reelstack',
      creditsPerMonth: 5000,
      maxFileSizeMb: 10240,
      maxDurationSec: -1,
      active: true,
      updatedAt: new Date(),
    });

    const limits = await getTierLimits('AGENCY');
    expect(limits.maxDuration).toBe(Infinity);
  });

  it('falls back to defaults when DB throws', async () => {
    const { prisma } = await import('@reelstack/database');
    vi.mocked(prisma.tierConfig.findUnique).mockRejectedValueOnce(new Error('DB down'));

    const limits = await getTierLimits('PRO');
    expect(limits.creditsPerMonth).toBe(1000);
  });
});

describe('validateFileSize', () => {
  it('accepts file within limit', () => {
    expect(validateFileSize(50 * 1024 * 1024, 100 * 1024 * 1024)).toBe(true);
  });

  it('rejects file over limit', () => {
    expect(validateFileSize(200 * 1024 * 1024, 100 * 1024 * 1024)).toBe(false);
  });

  it('accepts large file when limit is large', () => {
    expect(validateFileSize(1 * 1024 * 1024 * 1024, 2 * 1024 * 1024 * 1024)).toBe(true);
  });
});
