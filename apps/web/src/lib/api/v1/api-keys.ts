import crypto from 'node:crypto';

const KEY_LENGTH = 32;

/**
 * Generate a new API key with prefix and hash.
 * Returns the plaintext key (show once) and the hash (store in DB).
 *
 * Security: SHA-256 hash stored in DB, plaintext never persisted.
 * Prefix stored for user identification (e.g. "rs_live_a1b2c3d4").
 */
export function generateApiKey(mode: 'live' | 'test' = 'live'): {
  plaintext: string;
  prefix: string;
  hash: string;
} {
  const randomBytes = crypto.randomBytes(KEY_LENGTH);
  const keyBody = randomBytes.toString('base64url');
  const prefix = `rs_${mode}_${keyBody.slice(0, 8)}`;
  const plaintext = `rs_${mode}_${keyBody}`;
  const hash = hashApiKey(plaintext);

  return { plaintext, prefix, hash };
}

/** SHA-256 hash of an API key */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

/**
 * Timing-safe comparison of API key hashes.
 * Prevents timing attacks (security checklist requirement).
 */
export function verifyApiKeyHash(candidateHash: string, storedHash: string): boolean {
  if (candidateHash.length !== storedHash.length) return false;
  const a = Buffer.from(candidateHash, 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  return crypto.timingSafeEqual(a, b);
}

/** Extract API key from request headers (Bearer token or X-API-Key) */
export function extractApiKey(headers: Headers): string | null {
  // Check Authorization: Bearer <key>
  const authHeader = headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith('rs_')) return token;
  }

  // Check X-API-Key header
  const xApiKey = headers.get('x-api-key');
  if (xApiKey?.startsWith('rs_')) return xApiKey;

  return null;
}
