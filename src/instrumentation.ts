export async function register() {
  // Sentry server/edge instrumentation — no-op unless SENTRY_DSN is configured.
  if (process.env.SENTRY_DSN) {
    try {
      const Sentry = await import('@sentry/nextjs')
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0.1,
      })
    } catch {
      // never block the server on monitoring failures
    }
  }
}
