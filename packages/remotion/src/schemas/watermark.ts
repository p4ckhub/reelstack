import { z } from 'zod';

/**
 * Shared watermark schema — single source of truth.
 *
 * Every composition that wants to support the FREE-tier "reelstack.dev"
 * badge includes this field in its props schema. Server-authoritative:
 * clients can send it, but the API endpoint overrides it before the job
 * is enqueued (see shouldShowWatermarkForRender() in @reelstack/database).
 *
 * Currently the flag is disabled at the API level. Infrastructure stays
 * so flipping it back on is a one-line change. See vault decyzje.md
 * (2026-04-18) for the rationale.
 */
export const watermarkSchema = z.object({
  /** Render the overlay when true. API sets this based on user + credit source. */
  enabled: z.boolean(),
  /** Stable seed for position rotation. API sets a UUID per job. */
  seed: z.string().optional(),
});

export type Watermark = z.infer<typeof watermarkSchema>;
