import { describe, it, expect } from 'vitest';
import { isPublicUrl, isPrivateHost } from '../url-validation';

describe('isPublicUrl', () => {
  it('accepts valid HTTPS URLs', () => {
    expect(isPublicUrl('https://example.com/video.mp4')).toBe(true);
    expect(isPublicUrl('https://cdn.cloudflare.com/path')).toBe(true);
  });

  it('accepts valid HTTP URLs', () => {
    expect(isPublicUrl('http://example.com/video.mp4')).toBe(true);
  });

  it('rejects localhost', () => {
    expect(isPublicUrl('http://localhost:3000/video')).toBe(false);
    expect(isPublicUrl('https://localhost/video')).toBe(false);
  });

  it('rejects private IPv4 ranges', () => {
    expect(isPublicUrl('http://10.0.0.1/video')).toBe(false);
    expect(isPublicUrl('http://192.168.1.1/video')).toBe(false);
    expect(isPublicUrl('http://172.16.0.1/video')).toBe(false);
    expect(isPublicUrl('http://127.0.0.1/video')).toBe(false);
  });

  it('rejects special protocols', () => {
    expect(isPublicUrl('javascript:alert(1)')).toBe(false);
    expect(isPublicUrl('data:text/html,<h1>hi</h1>')).toBe(false);
    expect(isPublicUrl('file:///etc/passwd')).toBe(false);
    expect(isPublicUrl('ftp://files.example.com')).toBe(false);
  });

  it('rejects URLs with credentials', () => {
    expect(isPublicUrl('https://user:pass@example.com/video')).toBe(false); // trufflehog:ignore
  });

  it('rejects cloud metadata endpoints', () => {
    expect(isPublicUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isPublicUrl('http://metadata.google.internal/computeMetadata')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(isPublicUrl('not-a-url')).toBe(false);
    expect(isPublicUrl('')).toBe(false);
  });
});

describe('isPrivateHost', () => {
  it('blocks IPv6 loopback', () => {
    expect(isPrivateHost('::1')).toBe(true);
    expect(isPrivateHost('::')).toBe(true);
  });

  it('blocks IPv6 link-local', () => {
    expect(isPrivateHost('fe80::1')).toBe(true);
  });

  it('blocks IPv6 unique local', () => {
    expect(isPrivateHost('fc00::1')).toBe(true);
    expect(isPrivateHost('fd00::1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 (dotted)', () => {
    expect(isPrivateHost('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateHost('::ffff:10.0.0.1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 (hex form)', () => {
    // ::ffff:7f00:1 = 127.0.0.1
    expect(isPrivateHost('::ffff:7f00:1')).toBe(true);
    // ::ffff:a00:1 = 10.0.0.1
    expect(isPrivateHost('::ffff:a00:1')).toBe(true);
  });

  it('blocks kubernetes.default', () => {
    expect(isPrivateHost('kubernetes.default')).toBe(true);
  });

  it('allows public hostnames', () => {
    expect(isPrivateHost('example.com')).toBe(false);
    expect(isPrivateHost('8.8.8.8')).toBe(false);
  });

  it('blocks 0.0.0.0/8 range', () => {
    expect(isPrivateHost('0.0.0.0')).toBe(true);
    expect(isPrivateHost('0.1.2.3')).toBe(true);
  });
});
