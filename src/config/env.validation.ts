import { z } from 'zod/v4';

/** Reusable Zod transform: parses a JSON string into Record<string, string> */
function jsonRecordTransform(envVarName: string) {
  return (val: string | undefined): Record<string, string> => {
    if (!val) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(val);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${envVarName} must be valid JSON (parse error: ${detail})`,
      );
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error(`${envVarName} must be a JSON object`);
    }
    const entries = Object.entries(parsed as Record<string, unknown>);
    const nonString = entries.find(([, v]) => typeof v !== 'string');
    if (nonString) {
      throw new Error(
        `${envVarName} values must all be strings, got ${typeof nonString[1]} at key "${nonString[0]}"`,
      );
    }
    return Object.fromEntries(entries) as Record<string, string>;
  };
}

export const envSchema = z
  .object({
    DATABASE_URL: z.url(),

    REDIS_URL: z.url(),

    JWT_ACCESS_SECRET: z.string().min(32),

    JWT_REFRESH_SECRET: z.string().min(32),

    JWT_ACCESS_EXPIRATION: z.string().default('15m'),

    JWT_REFRESH_EXPIRATION: z.string().default('7d'),

    PORT: z.coerce.number().int().positive().default(3000),

    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),

    CORS_ORIGINS: z.string().default('*'),

    SENTRY_DSN: z.url().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),

    PADDLE_API_KEY: z.string().optional(),
    PADDLE_CLIENT_TOKEN: z.string().optional(),
    PADDLE_WEBHOOK_SECRET: z.string().optional(),
    PADDLE_SANDBOX: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    PADDLE_PRICE_IDS: z
      .string()
      .optional()
      .transform(jsonRecordTransform('PADDLE_PRICE_IDS')),
    PADDLE_ADDON_PRICE_IDS: z
      .string()
      .optional()
      .transform(jsonRecordTransform('PADDLE_ADDON_PRICE_IDS')),

    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),

    FRONTEND_URL: z.string().optional(),

    METRICS_TOKEN: z.string().optional(),

    GRAFANA_LOKI_HOST: z.url().optional(),
    GRAFANA_LOKI_USERNAME: z.string().optional(),
    GRAFANA_LOKI_PASSWORD: z.string().optional(),

    CLEANUP_RETENTION_DAYS: z.string().optional(),

    PAYMENTS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((data, ctx) => {
    const paddleFields = [
      data.PADDLE_API_KEY,
      data.PADDLE_CLIENT_TOKEN,
      data.PADDLE_WEBHOOK_SECRET,
    ];
    const someSet = paddleFields.some(Boolean);
    const allSet = paddleFields.every(Boolean);
    if (someSet && !allSet) {
      ctx.addIssue({
        code: 'custom',
        message:
          'PADDLE_API_KEY, PADDLE_CLIENT_TOKEN, and PADDLE_WEBHOOK_SECRET must all be set together or not at all',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
