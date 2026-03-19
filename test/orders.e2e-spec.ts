import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import * as argon2 from 'argon2';

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let testTenant: { id: string };
  let testBranch: { id: string };
  let testClient: { id: string };
  let testVehicle: { id: string };
  let testWorkPost: { id: string };
  let testService: { id: string; price: number };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
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

    prisma = app.get(PrismaService);

    // Seed test data
    testTenant = await prisma.tenant.create({
      data: { name: 'Test Wash', slug: 'test-wash-e2e' },
    });

    await prisma.bookingSettings.create({
      data: {
        tenantId: testTenant.id,
        slotDurationMinutes: 30,
        bufferTimeMinutes: 10,
      },
    });

    testBranch = await prisma.branch.create({
      data: { tenantId: testTenant.id, name: 'Main Branch' },
    });

    testWorkPost = await prisma.workPost.create({
      data: {
        tenantId: testTenant.id,
        branchId: testBranch.id,
        name: 'Bay 1',
      },
    });

    testClient = await prisma.client.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
      },
    });

    testVehicle = await prisma.vehicle.create({
      data: {
        tenantId: testTenant.id,
        clientId: testClient.id,
        make: 'Toyota',
        licensePlate: 'TEST-001',
      },
    });

    const svc = await prisma.service.create({
      data: {
        tenantId: testTenant.id,
        name: 'Basic Wash',
        durationMin: 30,
        price: 25.0,
      },
    });
    testService = { id: svc.id, price: 25.0 };

    // Create admin user and login
    const passwordHash = await argon2.hash('password123');
    const user = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        email: 'admin@test-wash.com',
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        isSuperAdmin: true,
      },
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@test-wash.com',
        password: 'password123',
      })
      .expect(200);

    accessToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.orderService.deleteMany({});
    await prisma.order.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.vehicle.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.client.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.service.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.workPost.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.branch.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.bookingSettings.deleteMany({
      where: { tenantId: testTenant.id },
    });
    await prisma.auditLog.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.tenant.delete({ where: { id: testTenant.id } });
    await app.close();
  });

  describe('POST /api/v1/orders', () => {
    it('should create an order successfully', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId: testBranch.id,
          clientId: testClient.id,
          vehicleId: testVehicle.id,
          workPostId: testWorkPost.id,
          scheduledStart: tomorrow.toISOString(),
          serviceIds: [testService.id],
        })
        .expect(201);

      expect(response.body.data).toMatchObject({
        status: 'BOOKED',
        source: 'INTERNAL',
      });
      expect(response.body.data.services).toHaveLength(1);
    });

    it('should prevent double-booking the same slot', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);
      tomorrow.setHours(14, 0, 0, 0);

      // First booking succeeds
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId: testBranch.id,
          clientId: testClient.id,
          vehicleId: testVehicle.id,
          workPostId: testWorkPost.id,
          scheduledStart: tomorrow.toISOString(),
          serviceIds: [testService.id],
        })
        .expect(201);

      // Second booking for same slot should fail
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          branchId: testBranch.id,
          clientId: testClient.id,
          vehicleId: testVehicle.id,
          workPostId: testWorkPost.id,
          scheduledStart: tomorrow.toISOString(),
          serviceIds: [testService.id],
        })
        .expect(409);
    });
  });
});
