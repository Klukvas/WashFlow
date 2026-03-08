import { envSchema } from './env.validation';

// ---------------------------------------------------------------------------
// Valid base config
// ---------------------------------------------------------------------------

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('envSchema', () => {
  // =========================================================================
  // Defaults
  // =========================================================================

  describe('defaults', () => {
    it('applies all default values when optional fields are omitted', () => {
      const result = envSchema.parse(validEnv);

      expect(result.JWT_ACCESS_EXPIRATION).toBe('15m');
      expect(result.JWT_REFRESH_EXPIRATION).toBe('7d');
      expect(result.PORT).toBe(3000);
      expect(result.NODE_ENV).toBe('development');
      expect(result.CORS_ORIGINS).toBe('*');
    });

    it('uses provided values over defaults', () => {
      const result = envSchema.parse({
        ...validEnv,
        PORT: '8080',
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.example.com',
        JWT_ACCESS_EXPIRATION: '30m',
        JWT_REFRESH_EXPIRATION: '14d',
      });

      expect(result.PORT).toBe(8080);
      expect(result.NODE_ENV).toBe('production');
      expect(result.CORS_ORIGINS).toBe('https://app.example.com');
      expect(result.JWT_ACCESS_EXPIRATION).toBe('30m');
      expect(result.JWT_REFRESH_EXPIRATION).toBe('14d');
    });
  });

  // =========================================================================
  // Required fields
  // =========================================================================

  describe('required fields', () => {
    it.each(['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])(
      'fails when %s is missing',
      (field) => {
        const env = { ...validEnv };
        delete (env as any)[field];

        const result = envSchema.safeParse(env);

        expect(result.success).toBe(false);
      },
    );
  });

  // =========================================================================
  // DATABASE_URL validation
  // =========================================================================

  describe('DATABASE_URL', () => {
    it('accepts valid PostgreSQL URL', () => {
      const result = envSchema.safeParse(validEnv);

      expect(result.success).toBe(true);
    });

    it('rejects invalid URL format', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        DATABASE_URL: 'not-a-url',
      });

      expect(result.success).toBe(false);
    });

    it('rejects empty string', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        DATABASE_URL: '',
      });

      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // REDIS_URL validation
  // =========================================================================

  describe('REDIS_URL', () => {
    it('accepts valid Redis URL', () => {
      const result = envSchema.parse({
        ...validEnv,
        REDIS_URL: 'redis://localhost:6379',
      });

      expect(result.REDIS_URL).toBe('redis://localhost:6379');
    });

    it('rejects invalid URL', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        REDIS_URL: 'not-valid',
      });

      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // JWT secrets — min length 32
  // =========================================================================

  describe('JWT secrets', () => {
    it('rejects JWT_ACCESS_SECRET shorter than 32 chars', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        JWT_ACCESS_SECRET: 'short',
      });

      expect(result.success).toBe(false);
    });

    it('rejects JWT_REFRESH_SECRET shorter than 32 chars', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        JWT_REFRESH_SECRET: 'short',
      });

      expect(result.success).toBe(false);
    });

    it('accepts exactly 32-char secrets', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        JWT_ACCESS_SECRET: 'x'.repeat(32),
        JWT_REFRESH_SECRET: 'y'.repeat(32),
      });

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // PORT coercion
  // =========================================================================

  describe('PORT', () => {
    it('coerces string to number', () => {
      const result = envSchema.parse({ ...validEnv, PORT: '4000' });

      expect(result.PORT).toBe(4000);
    });

    it('rejects non-positive port', () => {
      const result = envSchema.safeParse({ ...validEnv, PORT: '0' });

      expect(result.success).toBe(false);
    });

    it('rejects negative port', () => {
      const result = envSchema.safeParse({ ...validEnv, PORT: '-1' });

      expect(result.success).toBe(false);
    });

    it('rejects non-integer port', () => {
      const result = envSchema.safeParse({ ...validEnv, PORT: '3.5' });

      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // NODE_ENV enum
  // =========================================================================

  describe('NODE_ENV', () => {
    it.each(['development', 'production', 'test'])(
      'accepts "%s"',
      (env) => {
        const result = envSchema.safeParse({ ...validEnv, NODE_ENV: env });

        expect(result.success).toBe(true);
      },
    );

    it('rejects invalid NODE_ENV', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        NODE_ENV: 'staging',
      });

      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // Full valid config
  // =========================================================================

  describe('full valid config', () => {
    it('parses complete valid config without errors', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        PORT: '3000',
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.com,https://admin.com',
        JWT_ACCESS_EXPIRATION: '15m',
        JWT_REFRESH_EXPIRATION: '7d',
      });

      expect(result.success).toBe(true);
    });
  });
});
