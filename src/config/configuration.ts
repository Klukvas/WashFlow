import { envSchema, type Env } from './env.validation';

export default () => {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Environment validation failed:\n${formatted}\n\nPlease check your .env file.`,
    );
  }

  const env: Env = parsed.data;

  return {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    corsOrigins: env.CORS_ORIGINS,

    database: {
      url: env.DATABASE_URL,
    },

    redis: {
      url: env.REDIS_URL,
    },

    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessExpiration: env.JWT_ACCESS_EXPIRATION,
      refreshExpiration: env.JWT_REFRESH_EXPIRATION,
    },

    paddle: {
      apiKey: env.PADDLE_API_KEY ?? '',
      clientToken: env.PADDLE_CLIENT_TOKEN ?? '',
      webhookSecret: env.PADDLE_WEBHOOK_SECRET ?? '',
      sandbox: env.PADDLE_SANDBOX ?? true,
      priceIds: env.PADDLE_PRICE_IDS ?? {},
      addonPriceIds: env.PADDLE_ADDON_PRICE_IDS ?? {},
    },

    resend: {
      apiKey: env.RESEND_API_KEY ?? '',
      from: env.EMAIL_FROM ?? 'WashFlow <noreply@washflow.app>',
    },

    frontendUrl: env.FRONTEND_URL ?? 'http://localhost:5173',

    metricsToken: env.METRICS_TOKEN ?? '',

    grafanaLoki: {
      host: env.GRAFANA_LOKI_HOST ?? '',
      username: env.GRAFANA_LOKI_USERNAME ?? '',
      password: env.GRAFANA_LOKI_PASSWORD ?? '',
    },

    cleanup: {
      retentionDays: parseInt(process.env.CLEANUP_RETENTION_DAYS ?? '30', 10),
    },
  } as const;
};

export type AppConfig = ReturnType<typeof import('./configuration').default>;
