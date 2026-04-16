/**
 * @reelstack/database — thin public surface.
 *
 * Every helper is implemented in a domain file (users.ts, credits.ts, ...).
 * This file is just the barrel that re-exports them so consumers can keep
 * using `import { getUserByEmail } from '@reelstack/database'` unchanged.
 */
export * from './client';
export * from './users';
export * from './usage';
export * from './templates';
export * from './api-keys';
export * from './credits';
export * from './reel-jobs';
export * from './tier-config';
export * from './audit';
export * from './modules';

export type * from '@prisma/client';
