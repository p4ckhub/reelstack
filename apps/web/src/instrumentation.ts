export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
    const { installFetchHook, addGlobalApiCallSink } = await import('@reelstack/logger');
    const { dbApiCallSink } = await import('@reelstack/database');
    installFetchHook();
    addGlobalApiCallSink(dbApiCallSink);
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}
