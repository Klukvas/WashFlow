import { z } from 'zod/v4';

export const envSchema = z.object({
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
});

export type Env = z.infer<typeof envSchema>;
