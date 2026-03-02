import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, cleanupTenant } from './helpers/test-app';

describe('Clients (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let tenantId: string;

  beforeAll(async () => {
    const setup = await createTestApp('clients-e2e');
    app = setup.app;
    prisma = setup.prisma;
    accessToken = setup.accessToken;
    tenantId = setup.testTenant.id;
  });

  afterAll(async () => {
    await cleanupTenant(prisma, tenantId, app);
  });

  describe('POST /api/v1/clients', () => {
    it('creates a client and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Jane', lastName: 'Doe', phone: '+380991234567' })
        .expect(201);

      expect(res.body.data).toMatchObject({
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+380991234567',
      });
    });

    it('returns 400 when firstName is missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ lastName: 'Doe' })
        .expect(400);
    });

    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/clients')
        .send({ firstName: 'Ghost' })
        .expect(401);
    });
  });

  describe('GET /api/v1/clients', () => {
    it('returns 200 with paginated list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/clients/:id', () => {
    let clientId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Bob', lastName: 'Smith' })
        .expect(201);
      clientId = res.body.data.id;
    });

    it('returns 200 with the client', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({ id: clientId, firstName: 'Bob' });
    });

    it('returns 404 for non-existent id', () => {
      return request(app.getHttpServer())
        .get('/api/v1/clients/00000000-0000-4000-8000-000000000099')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/clients/:id', () => {
    let clientId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Alice' })
        .expect(201);
      clientId = res.body.data.id;
    });

    it('updates the client and returns 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'Alicia', phone: '+380500000001' })
        .expect(200);

      expect(res.body.data).toMatchObject({
        firstName: 'Alicia',
        phone: '+380500000001',
      });
    });
  });

  describe('DELETE /api/v1/clients/:id + PATCH restore', () => {
    let clientId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ firstName: 'ToDelete' })
        .expect(201);
      clientId = res.body.data.id;
    });

    it('soft-deletes the client and returns 200', () => {
      return request(app.getHttpServer())
        .delete(`/api/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('returns 404 for a soft-deleted client', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/clients/${clientId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('restores the client and returns 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/clients/${clientId}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({ id: clientId });
    });
  });
});
