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
  } as const;
};

export type AppConfig = ReturnType<typeof import('./configuration').default>;
