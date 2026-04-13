// Magic bytes signatures for video formats
const SIGNATURES: Record<string, { offset: number; bytes: number[] }[]> = {
  'video/mp4': [
    { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp
  ],
  'video/webm': [
    { offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML
  ],
  'video/quicktime': [
    { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp (same as mp4)
    { offset: 4, bytes: [0x6d, 0x6f, 0x6f, 0x76] }, // moov
  ],
  'video/x-matroska': [
    { offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML (same as webm)
  ],
};

export function validateMagicBytes(buffer: ArrayBuffer, mimeType: string): boolean {
  const view = new Uint8Array(buffer);
  const sigs = SIGNATURES[mimeType];
  if (!sigs) return false;

  return sigs.some((sig) => sig.bytes.every((byte, i) => view[sig.offset + i] === byte));
}

export function sanitizeSubtitleText(text: string): string {
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .slice(0, 500);
}

import { prisma } from '@reelstack/database';

export type TierName = 'FREE' | 'SOLO' | 'PRO' | 'AGENCY';

export interface TierLimits {
  maxFileSize: number;
  maxDuration: number;
  creditsPerMonth: number;
}

/** Hardcoded fallback — used when DB is unavailable or TierConfig row is missing. */
const TIER_DEFAULTS: Record<TierName, TierLimits> = {
  FREE: { maxFileSize: 100 * 1024 * 1024, maxDuration: 120, creditsPerMonth: 30 },
  SOLO: { maxFileSize: 500 * 1024 * 1024, maxDuration: 300, creditsPerMonth: 300 },
  PRO: { maxFileSize: 2 * 1024 * 1024 * 1024, maxDuration: 1800, creditsPerMonth: 1000 },
  AGENCY: { maxFileSize: 10 * 1024 * 1024 * 1024, maxDuration: Infinity, creditsPerMonth: 5000 },
};

// ── In-memory cache (60s TTL per tier+product key) ──────────
// Cache is bounded: one entry per (tier, productSlug) pair. With 4 tiers × ~2 products = max ~8 entries.
const CACHE_TTL_MS = 60_000;
const _cache = new Map<string, { limits: TierLimits; expiresAt: number }>();

/**
 * Returns tier limits for a given tier and product.
 * Reads from DB with 60s in-memory cache. Falls back to hardcoded defaults
 * if the DB is unavailable or no TierConfig row exists.
 */
export async function getTierLimits(
  tier: TierName,
  productSlug = 'reelstack'
): Promise<TierLimits> {
  const cacheKey = `${productSlug}:${tier}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.limits;

  try {
    const config = await prisma.tierConfig.findUnique({
      where: { tier_productSlug: { tier, productSlug } },
    });
    if (config && config.active) {
      const limits: TierLimits = {
        maxFileSize: config.maxFileSizeMb * 1024 * 1024,
        maxDuration: config.maxDurationSec === -1 ? Infinity : config.maxDurationSec,
        creditsPerMonth: config.creditsPerMonth,
      };
      _cache.set(cacheKey, { limits, expiresAt: Date.now() + CACHE_TTL_MS });
      return limits;
    }
  } catch {
    // DB unavailable — fall through to defaults
  }

  return TIER_DEFAULTS[tier];
}

/** Exported for tests — clears all cached entries so the next call hits the DB mock. */
export function _clearTierCache() {
  _cache.clear();
}

export function validateFileSize(size: number, maxFileSize: number): boolean {
  return size <= maxFileSize;
}
