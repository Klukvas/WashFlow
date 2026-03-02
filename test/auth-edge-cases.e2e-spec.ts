import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  deleteTenantData,
  loginAs,
  TestSetup,
} from './helpers/test-app';

describe('Auth Edge Cases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;

  let inactiveUserId: string;
  let deletedUserId: string;
  let deactivatableUserId: string;

  beforeAll(async () => {
    const setup: TestSetup = await createTestApp('e2e-auth-edge');
    app = setup.app;
    prisma = setup.prisma;
    tenantId = setup.testTenant.id;

    const hash = await argon2.hash('password123');

    // User with isActive = false
    const inactiveUser = await prisma.user.create({
      data: {
        tenantId,
        email: 'inactive@e2e-auth-edge.com',
        passwordHash: hash,
        firstName: 'Inactive',
        lastName: 'User',
        isSuperAdmin: false,
        isActive: false,
      },
    });
    inactiveUserId = inactiveUser.id;

    // User with deletedAt set (soft-deleted)
    const deletedUser = await prisma.user.create({
      data: {
        tenantId,
        email: 'deleted@e2e-auth-edge.com',
        passwordHash: hash,
        firstName: 'Deleted',
        lastName: 'User',
        isSuperAdmin: false,
        isActive: true,
        deletedAt: new Date(),
      },
    });
    deletedUserId = deletedUser.id;

    // User that will be deactivated mid-session
    const deactivatableUser = await prisma.user.create({
      data: {
        tenantId,
        email: 'deactivate-me@e2e-auth-edge.com',
        passwordHash: hash,
        firstName: 'Deactivatable',
        lastName: 'User',
        isSuperAdmin: false,
        isActive: true,
      },
    });
    deactivatableUserId = deactivatableUser.id;
  }, 60_000);

  afterAll(async () => {
    await deleteTenantData(prisma, tenantId);
    await app.close();
  }, 15_000);

  // ---------------------------------------------------------------------------
  // Inactive User Login
  // ---------------------------------------------------------------------------
  describe('Inactive User Login', () => {
    it('returns 401 when inactive user attempts login', async () => {
      await request(app.getHttpServer() as App)
        .post('/api/v1/auth/login')
        .send({
          tenantId,
          email: 'inactive@e2e-auth-edge.com',
          password: 'password123',
        })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Soft-Deleted User Login
  // ---------------------------------------------------------------------------
  describe('Soft-Deleted User Login', () => {
    it('returns 401 when soft-deleted user attempts login', async () => {
      await request(app.getHttpServer() as App)
        .post('/api/v1/auth/login')
        .send({
          tenantId,
          email: 'deleted@e2e-auth-edge.com',
          password: 'password123',
        })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Refresh After Deactivation
  // ---------------------------------------------------------------------------
  describe('Refresh After Deactivation', () => {
    it('returns 401 when deactivated user attempts token refresh', async () => {
      // Step 1: Login while user is still active
      const { refreshToken } = await loginAs(
        app,
        tenantId,
        'deactivate-me@e2e-auth-edge.com',
      );

      // Step 2: Deactivate the user via Prisma
      await prisma.user.update({
        where: { id: deactivatableUserId },
        data: { isActive: false },
      });

      // Step 3: Attempt refresh — should fail
      await request(app.getHttpServer() as App)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  // ---------------------------------------------------------------------------
  // NOTE: TenantGuard with x-tenant-id header override
  // ---------------------------------------------------------------------------
  // TenantGuard exists at src/common/guards/tenant.guard.ts but is NOT
  // registered as a global guard or used in any controller @UseGuards().
  // Therefore the super admin x-tenant-id header override does not work
  // end-to-end. Skipping those tests until the guard is wired up.
});
