import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import {
  getUserByEmail,
  getUserById,
  addTokens,
  updateUserTier,
  linkSellfCustomer,
  getUserBySellfCustomerId,
  prisma,
  createAuditLog,
} from '@reelstack/database';
import { createLogger } from '@reelstack/logger';
import { rateLimit } from '@/lib/api/rate-limit';

const log = createLogger('webhook-sellf');

/**
 * POST /api/webhooks/sellf
 *
 * Universal webhook for purchases. Accepts any of these formats:
 *
 * Direct:  {"email": "x@y.com", "product": "prod_pro", "reference": "order_123"}
 * Sellf:   {"event": "purchase.completed", "data": {"customer": {"email": "..."}, "product": {"slug": "..."}, "order": {"sessionId": "..."}}}
 *
 * Auth: HMAC signature (SELLF_WEBHOOK_SECRET) via X-Sellf-Signature or X-Webhook-Signature header.
 * Product-to-action mapping configured via SELLF_PRODUCT_* env vars.
 */

// ── Auth ──────────────────────────────────────────────────

function verifyWebhook(body: string, request: NextRequest): boolean {
  const secret = process.env.SELLF_WEBHOOK_SECRET;
  if (!secret) return false;

  const signature =
    request.headers.get('x-sellf-signature') ?? request.headers.get('x-webhook-signature') ?? '';

  if (!signature) return false;

  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  // Constant-time comparison (safe even if lengths differ)
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

// ── Normalize ─────────────────────────────────────────────

interface NormalizedData {
  email: string;
  product: string;
  reference: string;
  userId?: string;
}

/** Sellf webhook format: nested event + data */
const sellfPayloadSchema = z.object({
  event: z.string(),
  data: z
    .object({
      customer: z
        .object({
          email: z.string().email(),
          userId: z.string().optional(),
        })
        .passthrough(),
      product: z
        .object({
          slug: z.string().optional(),
          id: z.string().optional(),
        })
        .passthrough(),
      order: z
        .object({
          sessionId: z.string().optional(),
        })
        .passthrough()
        .optional(),
      reference: z.string().optional(),
      userId: z.string().optional(),
    })
    .passthrough(),
});

/** Direct webhook format: flat object */
const directPayloadSchema = z.object({
  email: z.string().email(),
  product: z.string().min(1),
  reference: z.string().optional(),
  userId: z.string().optional(),
});

/**
 * Normalize incoming payload to flat format.
 * Sellf sends: { event, data: { customer: { email }, product: { slug, id }, order: { sessionId } } }
 * Direct sends: { email, product, reference }
 *
 * Returns null if payload doesn't match either format.
 */
function normalizePayload(raw: Record<string, unknown>): NormalizedData | null {
  // Sellf format: nested event + data
  if ('event' in raw && 'data' in raw) {
    const parsed = sellfPayloadSchema.safeParse(raw);
    if (!parsed.success) return null;

    const { data } = parsed.data;
    return {
      email: data.customer.email,
      product: data.product.slug ?? data.product.id ?? '',
      reference: data.reference ?? `${parsed.data.event}:${data.order?.sessionId ?? ''}`,
      userId: data.userId ?? data.customer.userId,
    };
  }

  // Direct format: flat object
  const parsed = directPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;

  return {
    email: parsed.data.email,
    product: parsed.data.product,
    reference: parsed.data.reference ?? '',
    userId: parsed.data.userId,
  };
}

// ── Product action mapping ────────────────────────────────

type ProductAction =
  | { type: 'tier'; tier: 'SOLO' | 'PRO' | 'AGENCY' }
  | { type: 'tokens'; amount: number };

function getProductAction(productId: string): ProductAction | null {
  const mapping: Record<string, ProductAction> = {};

  // Subscription tiers - only map products that have env vars set
  if (process.env.SELLF_PRODUCT_SOLO)
    mapping[process.env.SELLF_PRODUCT_SOLO] = { type: 'tier', tier: 'SOLO' };
  if (process.env.SELLF_PRODUCT_PRO)
    mapping[process.env.SELLF_PRODUCT_PRO] = { type: 'tier', tier: 'PRO' };
  if (process.env.SELLF_PRODUCT_AGENCY)
    mapping[process.env.SELLF_PRODUCT_AGENCY] = { type: 'tier', tier: 'AGENCY' };

  // Token packs - only map products that have env vars set
  if (process.env.SELLF_PRODUCT_10_TOKENS)
    mapping[process.env.SELLF_PRODUCT_10_TOKENS] = { type: 'tokens', amount: 10 };
  if (process.env.SELLF_PRODUCT_50_TOKENS)
    mapping[process.env.SELLF_PRODUCT_50_TOKENS] = { type: 'tokens', amount: 50 };
  if (process.env.SELLF_PRODUCT_150_TOKENS)
    mapping[process.env.SELLF_PRODUCT_150_TOKENS] = { type: 'tokens', amount: 150 };
  if (process.env.SELLF_PRODUCT_500_TOKENS)
    mapping[process.env.SELLF_PRODUCT_500_TOKENS] = { type: 'tokens', amount: 500 };

  return mapping[productId] ?? null;
}

// ── Resolve user ──────────────────────────────────────────

async function resolveUser(data: NormalizedData) {
  // By userId hint
  if (data.userId) {
    const user = await getUserById(data.userId).catch(() => null);
    if (user) return user;
  }

  // By sellfCustomerId (email used as customer ID)
  const byCustomerId = await getUserBySellfCustomerId(data.email).catch(() => null);
  if (byCustomerId) return byCustomerId;

  // By email
  const byEmail = await getUserByEmail(data.email).catch(() => null);
  return byEmail;
}

// ── Handler ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Rate limit by IP — 30 per minute (legitimate providers retry slowly)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = await rateLimit(`webhook:${ip}`, { maxRequests: 30, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429 }
    );
  }

  const rawBody = await request.text();

  // Verify HMAC signature
  if (!verifyWebhook(rawBody, request)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } },
      { status: 401 }
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } },
      { status: 400 }
    );
  }

  // Sellf sends events - only process purchase.completed
  if ('event' in raw && raw.event !== 'purchase.completed') {
    return NextResponse.json({ received: true });
  }

  // Normalize payload (Sellf nested → flat)
  const data = normalizePayload(raw);
  if (!data) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid webhook payload structure' } },
      { status: 400 }
    );
  }

  // Resolve product action
  const action = getProductAction(data.product);
  if (!action) {
    log.warn({ product: data.product }, 'Unknown product');
    return NextResponse.json({ received: true, warning: 'Unknown product' });
  }

  // Find user
  const user = await resolveUser(data);
  if (!user) {
    log.error({ email: data.email }, 'User not found for provided email');
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'User not found' } },
      { status: 404 }
    );
  }

  // Link Sellf customer on first purchase
  if (data.email) {
    await linkSellfCustomer(user.id, data.email).catch((err) =>
      log.warn({ userId: user.id, err }, 'Failed to link Sellf customer')
    );
  }

  // Idempotency — reject duplicate events
  const reference = data.reference || `${data.product}:${data.email}`;
  try {
    await prisma.webhookEvent.create({ data: { eventId: reference } });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      // Already processed — return 200 so the provider stops retrying
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw e;
  }

  if (action.type === 'tier') {
    const previousTier = user.tier;
    await updateUserTier(user.id, action.tier);
    log.info({ userId: user.id, tier: action.tier }, 'Upgraded user tier');

    createAuditLog({
      userId: user.id,
      action: 'tier.upgrade',
      target: action.tier,
      metadata: { previousTier, product: data.product },
    }).catch((err) => log.warn({ err, userId: user.id }, 'Audit log failed'));
  } else {
    await addTokens(user.id, action.amount, 'purchase', reference);
    log.info({ userId: user.id, tokens: action.amount }, 'Added tokens to user');

    createAuditLog({
      userId: user.id,
      action: 'tokens.add',
      metadata: { amount: action.amount, product: data.product },
    }).catch((err) => log.warn({ err, userId: user.id }, 'Audit log failed'));
  }

  return NextResponse.json({
    received: true,
    action: action.type,
    userId: user.id,
  });
}
