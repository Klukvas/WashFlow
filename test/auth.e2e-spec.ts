import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testTenantId: string;
  const SLUG = 'auth-e2e';
  const EMAIL = `admin@${SLUG}.com`;
  const PASSWORD = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.create({
      data: { name: 'Auth E2E', slug: SLUG },
    });
    testTenantId = tenant.id;

    await prisma.bookingSettings.create({
      data: {
        tenantId: testTenantId,
        slotDurationMinutes: 30,
        bufferTimeMinutes: 10,
      },
    });

    const passwordHash = await argon2.hash(PASSWORD);
    await prisma.user.create({
      data: {
        tenantId: testTenantId,
        email: EMAIL,
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        isSuperAdmin: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.bookingSettings.deleteMany({
      where: { tenantId: testTenantId },
    });
    await prisma.auditLog.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.tenant.delete({ where: { id: testTenantId } });
    await app.close();
  });

  describe('POST /api/v1/auth/login', () => {
    it('returns 200 with tokens on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: testTenantId, email: EMAIL, password: PASSWORD })
        .expect(200);

      expect(res.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('returns 401 on wrong password', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: testTenantId, email: EMAIL, password: 'wrong-pass' })
        .expect(401);
    });

    it('returns 401 on unknown email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: testTenantId,
          email: 'nobody@example.com',
          password: PASSWORD,
        })
        .expect(401);
    });

    it('returns 400 on invalid UUID tenantId', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: 'not-a-uuid', email: EMAIL, password: PASSWORD })
        .expect(400);
    });

    it('returns 400 on invalid email format', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId: testTenantId,
          email: 'not-an-email',
          password: PASSWORD,
        })
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('returns 200 with a new access token on valid refresh token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: testTenantId, email: EMAIL, password: PASSWORD })
        .expect(200);

      const { refreshToken } = loginRes.body.data;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });

    it('returns 401 on invalid refresh token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid.token.here' })
        .expect(401);
    });
  });

  describe('JWT Auth Guard', () => {
    it('returns 401 on protected route without token', () => {
      return request(app.getHttpServer()).get('/api/v1/users').expect(401);
    });

    it('returns 200 on protected route with valid token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ tenantId: testTenantId, email: EMAIL, password: PASSWORD })
        .expect(200);

      const { accessToken } = loginRes.body.data;

      return request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });
});
