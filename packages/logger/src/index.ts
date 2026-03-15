import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

// pino-pretty uses worker threads which are incompatible with Next.js/Turbopack bundling.
// Use JSON output everywhere; pipe through `bunx pino-pretty` in dev if needed.
const baseLogger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
});

/**
 * Create a child logger with a fixed component name.
 * Usage: const log = createLogger('worker'); log.info({ jobId }, 'Job started');
 */
export function createLogger(component: string) {
  return baseLogger.child({ component });
}

/**
 * Create a request-scoped logger with requestId.
 * Usage in middleware: const log = createRequestLogger('api', requestId);
 */
export function createRequestLogger(component: string, requestId: string) {
  return baseLogger.child({ component, requestId });
}

export { baseLogger as logger };
export type { Logger } from 'pino';
