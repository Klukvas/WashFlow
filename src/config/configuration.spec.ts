import configuration from './configuration';

describe('configuration factory', () => {
  const VALID_ENV = {
    DATABASE_URL: 'https://localhost:5432/washflow',
    REDIS_URL: 'https://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    JWT_ACCESS_EXPIRATION: '15m',
    JWT_REFRESH_EXPIRATION: '7d',
    PORT: '3000',
    NODE_ENV: 'development',
    CORS_ORIGINS: '*',
  };

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Set all valid env vars
    Object.assign(process.env, VALID_ENV);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('success path', () => {
    it('returns a config object with port', () => {
      const config = configuration();
      expect(config.port).toBe(3000);
    });

    it('returns a config object with nodeEnv', () => {
      const config = configuration();
      expect(config.nodeEnv).toBe('development');
    });

    it('returns a config object with corsOrigins', () => {
      const config = configuration();
      expect(config.corsOrigins).toBe('*');
    });

    it('returns database.url from DATABASE_URL', () => {
      const config = configuration();
      expect(config.database.url).toBe(VALID_ENV.DATABASE_URL);
    });

    it('returns redis.url from REDIS_URL', () => {
      const config = configuration();
      expect(config.redis.url).toBe(VALID_ENV.REDIS_URL);
    });

    it('returns jwt.accessSecret from JWT_ACCESS_SECRET', () => {
      const config = configuration();
      expect(config.jwt.accessSecret).toBe(VALID_ENV.JWT_ACCESS_SECRET);
    });

    it('returns jwt.refreshSecret from JWT_REFRESH_SECRET', () => {
      const config = configuration();
      expect(config.jwt.refreshSecret).toBe(VALID_ENV.JWT_REFRESH_SECRET);
    });

    it('returns jwt.accessExpiration from JWT_ACCESS_EXPIRATION', () => {
      const config = configuration();
      expect(config.jwt.accessExpiration).toBe('15m');
    });

    it('returns jwt.refreshExpiration from JWT_REFRESH_EXPIRATION', () => {
      const config = configuration();
      expect(config.jwt.refreshExpiration).toBe('7d');
    });

    it('coerces PORT string to number', () => {
      process.env.PORT = '4000';
      const config = configuration();
      expect(config.port).toBe(4000);
    });

    it('applies default PORT when not set', () => {
      delete process.env.PORT;
      const config = configuration();
      expect(config.port).toBe(3000);
    });

    it('applies default NODE_ENV when not set', () => {
      delete process.env.NODE_ENV;
      const config = configuration();
      expect(config.nodeEnv).toBe('development');
    });
  });

  describe('error path', () => {
    it('throws when DATABASE_URL is missing', () => {
      delete process.env.DATABASE_URL;
      expect(() => configuration()).toThrow('Environment validation failed');
    });

    it('throws when REDIS_URL is missing', () => {
      delete process.env.REDIS_URL;
      expect(() => configuration()).toThrow('Environment validation failed');
    });

    it('throws when JWT_ACCESS_SECRET is too short', () => {
      process.env.JWT_ACCESS_SECRET = 'short';
      expect(() => configuration()).toThrow('Environment validation failed');
    });

    it('throws when JWT_REFRESH_SECRET is too short', () => {
      process.env.JWT_REFRESH_SECRET = 'short';
      expect(() => configuration()).toThrow('Environment validation failed');
    });

    it('includes .env file hint in error message', () => {
      delete process.env.DATABASE_URL;
      expect(() => configuration()).toThrow('Please check your .env file');
    });

    it('includes formatted issue path in error message', () => {
      delete process.env.DATABASE_URL;
      try {
        configuration();
        fail('Expected to throw');
      } catch (err: any) {
        expect(err.message).toContain('DATABASE_URL');
      }
    });
  });
});
