import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, cleanupTenant } from './helpers/test-app';

describe('Vehicles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let tenantId: string;
  let testClientId: string;

  beforeAll(async () => {
    const setup = await createTestApp('vehicles-e2e');
    app = setup.app;
    prisma = setup.prisma;
    accessToken = setup.accessToken;
    tenantId = setup.testTenant.id;

    // Create a client to attach vehicles to
    const res = await request(app.getHttpServer())
      .post('/api/v1/clients')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Car', lastName: 'Owner', phone: '+380991111111' })
      .expect(201);
    testClientId = res.body.data.id;
  });

  afterAll(async () => {
    await cleanupTenant(prisma, tenantId, app);
  });

  describe('POST /api/v1/vehicles', () => {
    it('creates a vehicle and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          clientId: testClientId,
          make: 'Toyota',
          model: 'Camry',
          licensePlate: 'AA1234BB',
        })
        .expect(201);

      expect(res.body.data).toMatchObject({
        make: 'Toyota',
        model: 'Camry',
        licensePlate: 'AA1234BB',
      });
    });

    it('returns 400 when make is missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ clientId: testClientId, model: 'Camry' })
        .expect(400);
    });

    it('returns 400 when clientId is missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ make: 'Honda' })
        .expect(400);
    });

    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .send({ clientId: testClientId, make: 'Ghost' })
        .expect(401);
    });
  });

  describe('GET /api/v1/vehicles', () => {
    it('returns 200 with paginated list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/vehicles/:id', () => {
    let vehicleId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          clientId: testClientId,
          make: 'Ford',
          model: 'Focus',
          year: 2020,
        })
        .expect(201);
      vehicleId = res.body.data.id;
    });

    it('returns 200 with vehicle data', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        id: vehicleId,
        make: 'Ford',
        year: 2020,
      });
    });

    it('returns 404 for non-existent id', () => {
      return request(app.getHttpServer())
        .get('/api/v1/vehicles/00000000-0000-4000-8000-000000000099')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/vehicles/:id', () => {
    let vehicleId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ clientId: testClientId, make: 'BMW', color: 'Black' })
        .expect(201);
      vehicleId = res.body.data.id;
    });

    it('updates the vehicle and returns 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ color: 'White', model: 'X5' })
        .expect(200);

      expect(res.body.data).toMatchObject({ color: 'White', model: 'X5' });
    });
  });

  describe('DELETE /api/v1/vehicles/:id + PATCH restore', () => {
    let vehicleId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          clientId: testClientId,
          make: 'Audi',
          licensePlate: 'DELETE001',
        })
        .expect(201);
      vehicleId = res.body.data.id;
    });

    it('soft-deletes the vehicle and returns 200', () => {
      return request(app.getHttpServer())
        .delete(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('returns 404 for soft-deleted vehicle', () => {
      return request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('restores the vehicle and returns 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleId}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({ id: vehicleId });
    });
  });
});
