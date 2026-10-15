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

const paddleCredentials = {
  PADDLE_API_KEY: 'synthetic-api-key',
  PADDLE_CLIENT_TOKEN: 'synthetic-client-token',
  PADDLE_WEBHOOK_SECRET: 'synthetic-webhook-secret',
};
const paddleFields = [
  'PADDLE_API_KEY',
  'PADDLE_CLIENT_TOKEN',
  'PADDLE_WEBHOOK_SECRET',
] as const;

const credentialCases = [
  {
    label: 'missing credentials',
    credentials: {},
    validWhenDisabled: true,
    validWhenEnabled: false,
  },
  {
    label: 'all credentials',
    credentials: paddleCredentials,
    validWhenDisabled: true,
    validWhenEnabled: true,
  },
  {
    label: 'all empty credentials',
    credentials: {
      PADDLE_API_KEY: '',
      PADDLE_CLIENT_TOKEN: '',
      PADDLE_WEBHOOK_SECRET: '',
    },
    validWhenDisabled: true,
    validWhenEnabled: false,
  },
  {
    label: 'all whitespace credentials',
    credentials: {
      PADDLE_API_KEY: '  ',
      PADDLE_CLIENT_TOKEN: '\t',
      PADDLE_WEBHOOK_SECRET: '\n',
    },
    validWhenDisabled: true,
    validWhenEnabled: false,
  },
  ...paddleFields.flatMap((field) => [
    {
      label: `only ${field} provided`,
      credentials: { [field]: paddleCredentials[field] },
      validWhenDisabled: false,
      validWhenEnabled: false,
    },
    ...[undefined, '', ' \t\n'].map((value) => ({
      label: `${field} ${value === undefined ? 'missing' : value === '' ? 'empty' : 'whitespace'}`,
      credentials: { ...paddleCredentials, [field]: value },
      validWhenDisabled: false,
      validWhenEnabled: false,
    })),
  ]),
];

describe('envSchema', () => {
  describe('payment enablement', () => {
    it('rejects enabled production payments without Paddle credentials', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        NODE_ENV: 'production',
        PAYMENTS_ENABLED: 'true',
      });

      expect(result.success).toBe(false);
    });

    it('rejects enabled payments with whitespace-only Paddle credentials', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        PAYMENTS_ENABLED: 'true',
        PADDLE_API_KEY: '  ',
        PADDLE_CLIENT_TOKEN: '\t',
        PADDLE_WEBHOOK_SECRET: '\n',
      });

      expect(result.success).toBe(false);
    });

    it('rejects partial credentials with a whitespace-only field when disabled', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        PAYMENTS_ENABLED: 'false',
        PADDLE_API_KEY: 'synthetic-api-key',
        PADDLE_CLIENT_TOKEN: 'synthetic-client-token',
        PADDLE_WEBHOOK_SECRET: '  ',
      });

      expect(result.success).toBe(false);
    });
  });

  describe.each(['development', 'production', 'test'])(
    '%s payments',
    (nodeEnv) => {
      describe.each([
        { label: 'default flag', flag: undefined, enabled: false },
        { label: 'disabled flag', flag: 'false', enabled: false },
        { label: 'enabled flag', flag: 'true', enabled: true },
      ])('$label', ({ flag, enabled }) => {
        it.each(credentialCases)(
          '$label',
          ({ credentials, validWhenDisabled, validWhenEnabled }) => {
            const result = envSchema.safeParse({
              ...validEnv,
              ...credentials,
              NODE_ENV: nodeEnv,
              PAYMENTS_ENABLED: flag,
            });

            expect(result.success).toBe(
              enabled ? validWhenEnabled : validWhenDisabled,
            );
            if (result.success) {
              expect(result.data.PAYMENTS_ENABLED).toBe(enabled);
            }
          },
        );
      });
    },
  );

  it.each(['', 'TRUE', 'FALSE', '1', '0', 'yes'])(
    'rejects invalid PAYMENTS_ENABLED value %j',
    (flag) => {
      expect(
        envSchema.safeParse({
          ...validEnv,
          ...paddleCredentials,
          PAYMENTS_ENABLED: flag,
        }).success,
      ).toBe(false);
    },
  );

  describe.each(['PADDLE_PRICE_IDS', 'PADDLE_ADDON_PRICE_IDS'] as const)(
    '%s validation',
    (field) => {
      it.each([undefined, ''])('defaults %j to an empty mapping', (value) => {
        expect(envSchema.parse({ ...validEnv, [field]: value })[field]).toEqual(
          {},
        );
      });

      it('accepts a JSON object with string values when payments are enabled', () => {
        const result = envSchema.parse({
          ...validEnv,
          ...paddleCredentials,
          PAYMENTS_ENABLED: 'true',
          [field]: '{"synthetic_plan":"pri_synthetic"}',
        });

        expect(result[field]).toEqual({ synthetic_plan: 'pri_synthetic' });
      });

      it.each(['invalid-json', '[]', 'null', '"price"', '{"plan":42}'])(
        'rejects invalid mapping %s even when payments are disabled',
        (value) => {
          expect(() =>
            envSchema.parse({
              ...validEnv,
              PAYMENTS_ENABLED: 'false',
              [field]: value,
            }),
          ).toThrow(field);
        },
      );
    },
  );

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
    it.each([
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
    ])('fails when %s is missing', (field) => {
      const env = { ...validEnv };
      delete (env as any)[field];

      const result = envSchema.safeParse(env);

      expect(result.success).toBe(false);
    });
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
    it.each(['development', 'production', 'test'])('accepts "%s"', (env) => {
      const result = envSchema.safeParse({ ...validEnv, NODE_ENV: env });

      expect(result.success).toBe(true);
    });

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
