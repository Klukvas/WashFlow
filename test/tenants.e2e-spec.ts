import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  deleteTenantData,
  TestSetup,
} from './helpers/test-app';

describe('Tenants (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let tenantId: string;
  const createdTenantIds: string[] = [];

  const api = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    (request(app.getHttpServer() as App) as any)[method](`/api/v1${path}`).set(
      'Authorization',
      `Bearer ${accessToken}`,
    );

  beforeAll(async () => {
    const setup: TestSetup = await createTestApp('e2e-tenants');
    app = setup.app;
    prisma = setup.prisma;
    accessToken = setup.accessToken;
    tenantId = setup.testTenant.id;
  }, 30_000);

  afterAll(async () => {
    for (const id of createdTenantIds) {
      try {
        await deleteTenantData(prisma, id);
      } catch {
        // tenant may have no data or already cleaned
      }
    }
    await deleteTenantData(prisma, tenantId);
    await app.close();
  }, 30_000);

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------
  describe('Tenants CRUD', () => {
    let createdTenantId: string;

    it('POST /tenants creates a tenant and returns 201', async () => {
      const res = await api('post', '/tenants')
        .send({ name: 'CRUD Tenant', slug: 'crud-tenant-e2e' })
        .expect(201);

      expect(res.body.data).toMatchObject({
        name: 'CRUD Tenant',
        slug: 'crud-tenant-e2e',
        isActive: true,
      });
      createdTenantId = res.body.data.id;
      createdTenantIds.push(createdTenantId);
    });

    it('GET /tenants returns list including the new tenant', async () => {
      const res = await api('get', '/tenants').expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      const slugs = res.body.data.map((t: any) => t.slug);
      expect(slugs).toContain('crud-tenant-e2e');
    });

    it('GET /tenants/:id returns the tenant by ID', async () => {
      const res = await api('get', `/tenants/${createdTenantId}`).expect(200);

      expect(res.body.data.id).toBe(createdTenantId);
      expect(res.body.data.name).toBe('CRUD Tenant');
    });

    it('PATCH /tenants/:id updates the tenant', async () => {
      const res = await api('patch', `/tenants/${createdTenantId}`)
        .send({ name: 'Updated CRUD Tenant' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated CRUD Tenant');
    });
  });

  // ---------------------------------------------------------------------------
  // Slug Uniqueness
  // ---------------------------------------------------------------------------
  describe('Slug Uniqueness', () => {
    it('POST /tenants with duplicate slug returns 409', async () => {
      const slug = 'unique-slug-e2e';

      const first = await api('post', '/tenants')
        .send({ name: 'First', slug })
        .expect(201);
      createdTenantIds.push(first.body.data.id);

      await api('post', '/tenants')
        .send({ name: 'Second', slug })
        .expect(409);
    });
  });

  // ---------------------------------------------------------------------------
  // Slug Format Validation
  // ---------------------------------------------------------------------------
  describe('Slug Format Validation', () => {
    it('rejects uppercase slug with 400', async () => {
      await api('post', '/tenants')
        .send({ name: 'Bad', slug: 'UpperCase' })
        .expect(400);
    });

    it('rejects slug with spaces with 400', async () => {
      await api('post', '/tenants')
        .send({ name: 'Bad', slug: 'has spaces' })
        .expect(400);
    });

    it('rejects slug with special chars with 400', async () => {
      await api('post', '/tenants')
        .send({ name: 'Bad', slug: 'special@chars!' })
        .expect(400);
    });

    it('accepts valid hyphenated lowercase slug', async () => {
      const res = await api('post', '/tenants')
        .send({ name: 'Good', slug: 'valid-slug-123' })
        .expect(201);

      createdTenantIds.push(res.body.data.id);
      expect(res.body.data.slug).toBe('valid-slug-123');
    });
  });

  // ---------------------------------------------------------------------------
  // Inactive Tenant Blocks Public Booking
  // ---------------------------------------------------------------------------
  describe('Inactive Tenant Blocks Public Booking', () => {
    const inactiveSlug = 'inactive-e2e-tenant';

    beforeAll(async () => {
      const existing = await prisma.tenant.findUnique({
        where: { slug: inactiveSlug },
      });
      if (existing) {
        try {
          await deleteTenantData(prisma, existing.id);
        } catch {
          // ignore
        }
      }

      const tenant = await prisma.tenant.create({
        data: { name: 'Inactive Tenant', slug: inactiveSlug, isActive: false },
      });
      createdTenantIds.push(tenant.id);
    });

    it('public services endpoint returns 404 for inactive tenant', async () => {
      await request(app.getHttpServer() as App)
        .get(`/api/v1/public/booking/${inactiveSlug}/services`)
        .expect(404);
    });

    it('public booking creation returns 404 for inactive tenant', async () => {
      await request(app.getHttpServer() as App)
        .post(`/api/v1/public/booking/${inactiveSlug}/book`)
        .send({
          branchId: '00000000-0000-4000-8000-000000000099',
          scheduledStart: new Date().toISOString(),
          serviceIds: ['00000000-0000-4000-8000-000000000099'],
          firstName: 'Test',
          lastName: 'User',
          phone: '+380990001111',
          licensePlate: 'XX0000XX',
        })
        .expect(404);
    });
  });
});
