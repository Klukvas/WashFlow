import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';

export interface TestSetup {
  app: INestApplication;
  prisma: PrismaService;
  accessToken: string;
  refreshToken: string;
  testTenant: { id: string };
  testBranch: { id: string };
}

/**
 * Deletes all tenant-scoped data in FK-safe order.
 * OrderService cascades from Order (onDelete: Cascade).
 * RolePermission cascades from Role (onDelete: Cascade).
 */
export async function deleteTenantData(
  prisma: PrismaService,
  tenantId: string,
): Promise<void> {
  // 1. Join tables / leaves first
  const orderIds = await prisma.order.findMany({
    where: { tenantId },
    select: { id: true },
  });
  if (orderIds.length > 0) {
    await prisma.orderService.deleteMany({
      where: { orderId: { in: orderIds.map((o) => o.id) } },
    });
  }
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.order.deleteMany({ where: { tenantId } });

  // 2. Entities referencing client
  await prisma.vehicle.deleteMany({ where: { tenantId } });
  await prisma.client.deleteMany({ where: { tenantId } });

  // 3. Supporting entities
  await prisma.service.deleteMany({ where: { tenantId } });
  await prisma.workPost.deleteMany({ where: { tenantId } });
  await prisma.employeeProfile.deleteMany({ where: { tenantId } });

  // 4. Roles (RolePermission cascades via onDelete)
  const roleIds = await prisma.role.findMany({
    where: { tenantId },
    select: { id: true },
  });
  if (roleIds.length > 0) {
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: roleIds.map((r) => r.id) } },
    });
  }
  await prisma.role.deleteMany({ where: { tenantId } });

  // 5. Remaining tenant-scoped
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.bookingSettings.deleteMany({ where: { tenantId } });
  await prisma.idempotencyKey.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });

  // 6. Tenant itself
  await prisma.tenant.delete({ where: { id: tenantId } });
}

/**
 * Creates a non-superAdmin user with a role that has only the specified permissions.
 * Permission slugs use the format "module.action" (e.g. "orders.read").
 */
export async function createLimitedUser(
  prisma: PrismaService,
  opts: {
    tenantId: string;
    email: string;
    branchId?: string;
    permissionSlugs: string[];
    roleName?: string;
  },
): Promise<{ userId: string; roleId: string }> {
  const role = await prisma.role.create({
    data: {
      tenantId: opts.tenantId,
      name: opts.roleName ?? `role-${opts.email}`,
    },
  });

  if (opts.permissionSlugs.length > 0) {
    const conditions = opts.permissionSlugs.map((slug) => {
      const [module, action] = slug.split('.');
      return { module, action };
    });

    const permissions = await prisma.permission.findMany({
      where: { OR: conditions },
    });

    if (permissions.length !== opts.permissionSlugs.length) {
      const found = permissions.map((p) => `${p.module}.${p.action}`);
      const missing = opts.permissionSlugs.filter((s) => !found.includes(s));
      throw new Error(`Permissions not found: ${missing.join(', ')}`);
    }

    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }

  const passwordHash = await argon2.hash('password123');
  const user = await prisma.user.create({
    data: {
      tenantId: opts.tenantId,
      email: opts.email,
      passwordHash,
      firstName: 'Test',
      lastName: 'User',
      isSuperAdmin: false,
      roleId: role.id,
      branchId: opts.branchId ?? null,
    },
  });

  return { userId: user.id, roleId: role.id };
}

/**
 * Extracts the refresh_token value from Set-Cookie headers.
 */
export function extractRefreshCookie(res: {
  headers: Record<string, string | string[]>;
}): string {
  const cookies = res.headers['set-cookie'];
  const cookieArr = Array.isArray(cookies) ? cookies : [cookies];
  const match = cookieArr
    .find((c) => c?.startsWith('refresh_token='))
    ?.match(/^refresh_token=([^;]+)/);
  return match?.[1] ?? '';
}

/**
 * Logs in a user and returns the tokens.
 */
export async function loginAs(
  app: INestApplication,
  tenantId: string,
  email: string,
  password = 'password123',
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app.getHttpServer() as App)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);

  return {
    accessToken: res.body.data.accessToken,
    refreshToken: extractRefreshCookie(res),
  };
}

/**
 * Returns a future UTC date that skips Sundays (day 0).
 */
export function nextWorkday(hour = 10, daysAhead = 1): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hour, 0, 0, 0);
  // Skip Sunday
  if (d.getUTCDay() === 0) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

export async function createTestApp(slug: string): Promise<TestSetup> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
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

  const prisma = app.get(PrismaService);

  // Clean up any leftover tenant from a previous failed run
  const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
  if (existingTenant) {
    await deleteTenantData(prisma, existingTenant.id);
  }

  const testTenant = await prisma.tenant.create({
    data: { name: `Test ${slug}`, slug },
  });

  await prisma.bookingSettings.create({
    data: {
      tenantId: testTenant.id,
      slotDurationMinutes: 30,
      bufferTimeMinutes: 10,
    },
  });

  const testBranch = await prisma.branch.create({
    data: { tenantId: testTenant.id, timezone: 'UTC', name: 'Main Branch' },
  });

  const passwordHash = await argon2.hash('password123');
  await prisma.user.create({
    data: {
      tenantId: testTenant.id,
      email: `admin@${slug}.com`,
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      isSuperAdmin: true,
    },
  });

  const loginResponse = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({
      email: `admin@${slug}.com`,
      password: 'password123',
    })
    .expect(200);

  const accessToken: string = loginResponse.body.data.accessToken;
  const refreshToken = extractRefreshCookie(loginResponse);

  return { app, prisma, accessToken, refreshToken, testTenant, testBranch };
}

export async function cleanupTenant(
  prisma: PrismaService,
  tenantId: string,
  app: INestApplication,
): Promise<void> {
  await deleteTenantData(prisma, tenantId);
  await app.close();
}
