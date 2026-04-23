import { vi } from 'vitest';

/**
 * Replaces `createLogger` / `createRequestLogger` with silent stubs while
 * keeping the real job-context + API-call audit surface (jobContext,
 * runWithJobContext, setApiCallLogger, logApiCall, installFetchHook, ...).
 *
 * Tests that exercise the pipeline rely on the real AsyncLocalStorage
 * plumbing — only the pino wrappers need to be muted.
 */
export async function loggerMockFactory() {
  const real = await vi.importActual<typeof import('@reelstack/logger')>('@reelstack/logger');
  const silent = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => silent,
  };
  return {
    ...real,
    createLogger: () => silent,
    createRequestLogger: () => silent,
  };
}
