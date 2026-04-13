import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import {
  databaseMockFactory,
  mockGetUserByEmail,
  mockAddTokens,
  mockUpdateUserTier,
  mockLinkSellfCustomer,
  mockGetUserBySellfCustomerId,
  mockPrisma,
} from '@/__test-utils__/database-mock';

vi.mock('@reelstack/database', databaseMockFactory);

const WEBHOOK_SECRET = 'test-webhook-secret';

const originalEnv = { ...process.env };
process.env.SELLF_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.SELLF_PRODUCT_PRO = 'prod_pro';
process.env.SELLF_PRODUCT_10_TOKENS = 'prod_10t';
process.env.SELLF_PRODUCT_50_TOKENS = 'prod_50t';

const { POST } = await import('../../webhooks/sellf/route');

function sign(body: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

function makeRequest(body: object, signature?: string): NextRequest {
  const rawBody = JSON.stringify(body);
  return new Request('http://localhost/api/webhooks/sellf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signature !== undefined
        ? { 'x-sellf-signature': signature }
        : { 'x-sellf-signature': sign(rawBody) }),
    },
    body: rawBody,
  }) as unknown as NextRequest;
}

const mockUser = { id: 'user-1', email: 'test@test.com', tier: 'FREE' };

afterAll(() => {
  process.env = originalEnv;
});

describe('POST /api/webhooks/sellf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLinkSellfCustomer.mockResolvedValue({});
    mockPrisma.webhookEvent.create.mockResolvedValue({});
  });

  // ── Auth ──────────────────────────────────────

  it('returns 401 for invalid signature', async () => {
    const response = await POST(
      makeRequest({ email: 'a@b.com', product: 'prod_pro' }, 'invalid-signature')
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when no signature header', async () => {
    const req = new Request('http://localhost/api/webhooks/sellf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', product: 'prod_pro' }),
    }) as unknown as NextRequest;
    const response = await POST(req);
    expect(response.status).toBe(401);
  });

  // ── Direct format ─────────────────────────────

  it('upgrades tier via direct format', async () => {
    mockGetUserBySellfCustomerId.mockResolvedValue(null);
    mockGetUserByEmail.mockResolvedValue(mockUser);
    mockUpdateUserTier.mockResolvedValue({});

    const payload = { email: 'test@test.com', product: 'prod_pro', reference: 'order-1' };
    const response = await POST(makeRequest(payload));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.action).toBe('tier');
    expect(mockUpdateUserTier).toHaveBeenCalledWith('user-1', 'PRO');
  });

  it('adds tokens via direct format', async () => {
    mockGetUserBySellfCustomerId.mockResolvedValue(null);
    mockGetUserByEmail.mockResolvedValue(mockUser);
    mockAddTokens.mockResolvedValue({});

    const payload = { email: 'test@test.com', product: 'prod_50t', reference: 'order-50' };
    const response = await POST(makeRequest(payload));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.action).toBe('tokens');
    expect(mockAddTokens).toHaveBeenCalledWith('user-1', 50, 'purchase', 'order-50');
  });

  // ── Sellf format ──────────────────────────────

  it('upgrades tier via Sellf format', async () => {
    mockGetUserBySellfCustomerId.mockResolvedValue(null);
    mockGetUserByEmail.mockResolvedValue(mockUser);
    mockUpdateUserTier.mockResolvedValue({});

    const payload = {
      event: 'purchase.completed',
      data: {
        customer: { email: 'test@test.com' },
        product: { slug: 'prod_pro', id: 'p1' },
        order: { amount: 2900, sessionId: 'cs_abc' },
      },
    };
    const response = await POST(makeRequest(payload));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.action).toBe('tier');
    expect(mockUpdateUserTier).toHaveBeenCalledWith('user-1', 'PRO');
  });

  it('adds tokens via Sellf format', async () => {
    mockGetUserBySellfCustomerId.mockResolvedValue(null);
    mockGetUserByEmail.mockResolvedValue(mockUser);
    mockAddTokens.mockResolvedValue({});

    const payload = {
      event: 'purchase.completed',
      data: {
        customer: { email: 'test@test.com' },
        product: { slug: 'prod_10t' },
        order: { sessionId: 'cs_xyz' },
      },
    };
    const response = await POST(makeRequest(payload));
    expect(response.status).toBe(200);
    expect(mockAddTokens).toHaveBeenCalledWith(
      'user-1',
      10,
      'purchase',
      'purchase.completed:cs_xyz'
    );
  });

  it('ignores non-completed Sellf events', async () => {
    const payload = {
      event: 'lead.captured',
      data: { customer: { email: 'a@b.com' } },
    };
    const response = await POST(makeRequest(payload));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);
    expect(mockUpdateUserTier).not.toHaveBeenCalled();
    expect(mockAddTokens).not.toHaveBeenCalled();
  });

  it('uses product.id when slug is missing (Sellf format)', async () => {
    mockGetUserBySellfCustomerId.mockResolvedValue(null);
    mockGetUserByEmail.mockResolvedValue(mockUser);
    mockAddTokens.mockResolvedValue({});

    const payload = {
      event: 'purchase.completed',
      data: {
        customer: { email: 'test@test.com' },
        product: { id: 'prod_50t' },
        order: { sessionId: 'cs_123' },
      },
    };
    const response = await POST(makeRequest(payload));
    expect(response.status).toBe(200);
    expect(mockAddTokens).toHaveBeenCalledWith('user-1', 50, 'purchase', expect.any(String));
  });

  // ── Common behavior ───────────────────────────

  it('handles unknown product gracefully', async () => {
    const payload = { email: 'a@b.com', product: 'unknown_product' };
    const response = await POST(makeRequest(payload));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.warning).toBe('Unknown product');
  });

  it('returns 404 when user not found', async () => {
    mockGetUserBySellfCustomerId.mockResolvedValue(null);
    mockGetUserByEmail.mockResolvedValue(null);
    const payload = { email: 'nobody@test.com', product: 'prod_pro' };
    const response = await POST(makeRequest(payload));
    expect(response.status).toBe(404);
  });

  it('links sellf customer on first purchase', async () => {
    mockGetUserBySellfCustomerId.mockResolvedValue(null);
    mockGetUserByEmail.mockResolvedValue(mockUser);
    mockUpdateUserTier.mockResolvedValue({});

    const payload = { email: 'test@test.com', product: 'prod_pro', reference: 'o1' };
    await POST(makeRequest(payload));
    expect(mockLinkSellfCustomer).toHaveBeenCalledWith('user-1', 'test@test.com');
  });

  it('finds user by sellfCustomerId', async () => {
    mockGetUserBySellfCustomerId.mockResolvedValue(mockUser);
    mockUpdateUserTier.mockResolvedValue({});

    const payload = { email: 'test@test.com', product: 'prod_pro', reference: 'o1' };
    await POST(makeRequest(payload));
    expect(mockUpdateUserTier).toHaveBeenCalledWith('user-1', 'PRO');
  });

  // ── Idempotency ───────────────────────────────

  it('returns 200 with duplicate:true for already-processed event', async () => {
    const error = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    mockPrisma.webhookEvent.create.mockRejectedValue(error);

    const payload = { email: 'test@test.com', product: 'prod_pro', reference: 'dup-ref' };
    const response = await POST(makeRequest(payload));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.duplicate).toBe(true);
    expect(mockUpdateUserTier).not.toHaveBeenCalled();
    expect(mockAddTokens).not.toHaveBeenCalled();
  });
});
