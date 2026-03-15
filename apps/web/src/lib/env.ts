import { z } from 'zod';
import { createLogger } from '@reelstack/logger';

const log = createLogger('env');

const envSchema = z.object({
  // Auth (required)
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),

  // Database (required for server features)
  DATABASE_URL: z.string().url().optional(),

  // Email / Magic links (optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Supabase Storage (optional — cloud mode)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Redis (optional — VPS mode)
  REDIS_URL: z.string().url().optional(),

  // MinIO (optional — VPS mode)
  MINIO_ENDPOINT: z.string().optional(),
  MINIO_PORT: z.coerce.number().optional(),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_BUCKET: z.string().optional(),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    log.error({ fields: result.error.flatten().fieldErrors }, 'Invalid environment variables');
    throw new Error('Invalid environment variables');
  }
  return result.data;
}

export const env = validateEnv();
