import { Test, TestingModule } from '@nestjs/testing';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { OrdersRepository } from './orders.repository';

describe('OrdersRepository', () => {
  let repo: OrdersRepository;
  let tenantClient: Record<string, any>;

  beforeEach(async () => {
    tenantClient = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'order-1' }),
        update: jest.fn().mockResolvedValue({ id: 'order-1' }),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersRepository,
        {
          provide: TenantPrismaService,
          useValue: {
            forTenant: jest.fn().mockReturnValue(tenantClient),
          },
        },
      ],
    }).compile();

    repo = module.get<OrdersRepository>(OrdersRepository);
  });

  it('should be defined', () => {
    expect(repo).toBeDefined();
  });

  describe('defaultInclude — order response shape', () => {
    it('should include services with nested service relation (provides durationMin, name)', async () => {
      await repo.findAll('tenant-1', {} as any);

      const call = tenantClient.order.findMany.mock.calls[0][0];
      const include = call.include;

      // services: { include: { service: true } } ensures each OrderService
      // has a nested service object with name, durationMin, price
      expect(include.services).toEqual({ include: { service: true } });
    });

    it('should include client relation for customer info', async () => {
      await repo.findAll('tenant-1', {} as any);

      const call = tenantClient.order.findMany.mock.calls[0][0];
      expect(call.include.client).toBe(true);
    });

    it('should include vehicle relation for vehicle info', async () => {
      await repo.findAll('tenant-1', {} as any);

      const call = tenantClient.order.findMany.mock.calls[0][0];
      expect(call.include.vehicle).toBe(true);
    });

    it('should include branch relation for location info', async () => {
      await repo.findAll('tenant-1', {} as any);

      const call = tenantClient.order.findMany.mock.calls[0][0];
      expect(call.include.branch).toBe(true);
    });

    it('findById should use same includes as findAll', async () => {
      await repo.findAll('tenant-1', {} as any);
      const findAllInclude =
        tenantClient.order.findMany.mock.calls[0][0].include;

      await repo.findById('tenant-1', 'order-1');
      const findByIdInclude =
        tenantClient.order.findFirst.mock.calls[0][0].include;

      expect(findByIdInclude).toEqual(findAllInclude);
    });
  });
});
