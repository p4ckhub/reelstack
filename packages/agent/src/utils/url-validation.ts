/**
 * URL validation utilities — single source of truth for SSRF protection.
 *
 * Thorough implementation covering:
 * - IPv4 private ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, 0.x)
 * - IPv6 loopback, link-local, unique local, IPv4-mapped (dotted and hex forms)
 * - Single-decimal IP bypass (e.g. 2130706433 = 127.0.0.1)
 * - Known internal hostnames (localhost, metadata endpoints, kubernetes)
 * - Credentials in URL
 * - Non-HTTP(S) protocols
 *
 * Separated from reel-schemas.ts (DRY) so both web app and agent can import it.
 */

/**
 * Check if a hostname is a private/internal IP (IPv4 or IPv6).
 * Blocks: loopback, private ranges, link-local, IPv4-mapped IPv6.
 */
export function isPrivateHost(hostname: string): boolean {
  // Strip IPv6 brackets
  const host = hostname.replace(/^\[|\]$/g, '');

  // Block known internal hostnames
  const blocked = [
    'localhost',
    'metadata.google.internal',
    'metadata.google',
    'kubernetes.default',
  ];
  if (blocked.some((b) => host === b || host.endsWith(`.${b}`))) return true;

  // IPv6 checks (::1, fe80::, fc00::, fd00::, ::ffff:x.x.x.x mapped)
  if (host.includes(':')) {
    // Loopback
    if (host === '::1' || host === '::') return true;
    // Link-local (fe80::)
    if (host.toLowerCase().startsWith('fe80:')) return true;
    // Unique local (fc00::/7 = fc00:: and fd00::)
    if (/^f[cd]/i.test(host)) return true;
    // IPv4-mapped IPv6 (::ffff:x.x.x.x) - extract IPv4 and check
    const v4Match = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (v4Match) return isPrivateIPv4(v4Match[1]);
    // IPv4-mapped IPv6 in hex form (::ffff:7f00:1) - URL parser converts dotted to hex
    const v4HexMatch = host.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (v4HexMatch) {
      const hi = parseInt(v4HexMatch[1], 16);
      const lo = parseInt(v4HexMatch[2], 16);
      const ip = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isPrivateIPv4(ip);
    }
    // Any other IPv6 with embedded IPv4
    const embeddedV4 = host.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (embeddedV4) return isPrivateIPv4(embeddedV4[1]);
    return false;
  }

  // IPv4 checks
  return isPrivateIPv4(host);
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length === 1) {
    // Single decimal/hex number (e.g. 2130706433 = 127.0.0.1, 0x7f000001)
    const num = Number(ip);
    if (isNaN(num) || num < 0 || num > 0xffffffff) return false;
    const a = (num >>> 24) & 0xff;
    const b = (num >>> 16) & 0xff;
    return checkPrivateOctets(a, b);
  }
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  return checkPrivateOctets(parts[0], parts[1]);
}

function checkPrivateOctets(a: number, b: number): boolean {
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

/** Check if a URL is a valid public HTTP(S) URL (rejects localhost, private IPs, metadata endpoints). */
export function isPublicUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (parsed.username || parsed.password) return false;
    if (isPrivateHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
