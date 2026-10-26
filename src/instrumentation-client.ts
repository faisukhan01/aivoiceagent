// Sentry client instrumentation — no-op unless NEXT_PUBLIC_SENTRY_DSN is configured.
// (@sentry/nextjs v11 auto-instruments; only the guarded init is needed here.)
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
    })
  })
}
