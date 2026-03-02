import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, cleanupTenant } from './helpers/test-app';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let tenantId: string;

  beforeAll(async () => {
    const setup = await createTestApp('users-e2e');
    app = setup.app;
    prisma = setup.prisma;
    accessToken = setup.accessToken;
    tenantId = setup.testTenant.id;
  });

  afterAll(async () => {
    await cleanupTenant(prisma, tenantId, app);
  });

  describe('GET /api/v1/users', () => {
    it('returns 200 with a list of users', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // The seeded admin user should be in the list
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('returns 401 without token', () => {
      return request(app.getHttpServer()).get('/api/v1/users').expect(401);
    });
  });

  describe('POST /api/v1/users', () => {
    it('creates a user and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'newuser@users-e2e.com',
          password: 'securepass1',
          firstName: 'New',
          lastName: 'User',
        })
        .expect(201);

      expect(res.body.data).toMatchObject({
        email: 'newuser@users-e2e.com',
        firstName: 'New',
        lastName: 'User',
      });
    });

    it('returns 400 when required fields are missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: 'bad@test.com' })
        .expect(400);
    });

    it('returns 400 when password is too short', () => {
      return request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'short@test.com',
          password: 'short',
          firstName: 'Foo',
          lastName: 'Bar',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    let userId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'getme@users-e2e.com',
          password: 'securepass1',
          firstName: 'Fetch',
          lastName: 'Me',
        })
        .expect(201);
      userId = res.body.data.id;
    });

    it('returns 200 with user data', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({ id: userId, firstName: 'Fetch' });
    });

    it('returns 404 for non-existent id', () => {
      return request(app.getHttpServer())
        .get('/api/v1/users/00000000-0000-4000-8000-000000000099')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/users/:id', () => {
    let userId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'patchme@users-e2e.com',
          password: 'securepass1',
          firstName: 'Patch',
          lastName: 'Me',
        })
        .expect(201);
      userId = res.body.data.id;
    });

    it('updates user fields and returns 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Updated', phone: '+380671234567' })
        .expect(200);

      expect(res.body.data).toMatchObject({
        firstName: 'Updated',
        phone: '+380671234567',
      });
    });
  });

  describe('DELETE /api/v1/users/:id + PATCH restore', () => {
    let userId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'deleteme@users-e2e.com',
          password: 'securepass1',
          firstName: 'Delete',
          lastName: 'Me',
        })
        .expect(201);
      userId = res.body.data.id;
    });

    it('soft-deletes the user and returns 200', () => {
      return request(app.getHttpServer())
        .delete(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('returns 404 for soft-deleted user', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/users/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('restores the user and returns 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${userId}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({ id: userId });
    });
  });
});
