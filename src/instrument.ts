import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN;
const isProd = process.env.NODE_ENV === 'production';
const sampleRate =
  Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || (isProd ? 0.05 : 1.0);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    sendDefaultPii: false,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: sampleRate,
    profileSessionSampleRate: sampleRate,
    profileLifecycle: 'trace',
  });
}
