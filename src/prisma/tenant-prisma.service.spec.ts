import { Test, TestingModule } from '@nestjs/testing';
import { TenantPrismaService } from './tenant-prisma.service';
import { PrismaService } from './prisma.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-001';
const OTHER_TENANT = 'tenant-uuid-999';

/**
 * Creates a mock PrismaService that captures the $extends call
 * and lets us invoke individual model operations against the extension logic.
 */
function buildPrismaMock() {
  let extensionConfig: any;

  const prisma = {
    $extends: jest.fn((config: any) => {
      extensionConfig = config;
      return prisma; // chain
    }),
  };

  /**
   * Invoke a specific operation on the extended client.
   * E.g. invoke('findMany', 'User', { where: {} })
   */
  async function invoke(
    operation: string,
    model: string,
    args: any = {},
    queryResult: any = null,
  ) {
    // Build the extended client so extensionConfig is captured
    const query = jest.fn().mockResolvedValue(queryResult);

    const handler =
      extensionConfig?.query?.[camelCase(model)]?.['$allOperations'] ??
      extensionConfig?.query?.['$allModels']?.[operation];

    if (!handler) {
      throw new Error(`No handler for ${model}.${operation}`);
    }

    return handler({ model, args: { ...args }, query });
  }

  return { prisma, invoke };
}

/** PascalCase to camelCase (Permission → permission) */
function camelCase(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('TenantPrismaService', () => {
  let service: TenantPrismaService;
  let invoke: ReturnType<typeof buildPrismaMock>['invoke'];

  beforeEach(async () => {
    const { prisma, invoke: inv } = buildPrismaMock();
    invoke = inv;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantPrismaService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TenantPrismaService>(TenantPrismaService);

    // Trigger $extends
    service.forTenant(TENANT_ID);
  });

  // =========================================================================
  // Tenant injection — findMany
  // =========================================================================

  describe('findMany', () => {
    it('injects tenantId into where clause', async () => {
      const query = jest.fn().mockResolvedValue([]);
      // Manually call the handler
      const args = { where: { isActive: true } };

      await invoke('findMany', 'User', args, []);

      // The query was called — check args mutation
    });

    it('injects tenantId for regular models', async () => {
      const query = jest.fn().mockResolvedValue([]);
      const handler = getHandler('findMany');

      const args = { where: { isActive: true } };
      await handler({ model: 'Branch', args, query });

      expect(args.where).toEqual(
        expect.objectContaining({ tenantId: TENANT_ID }),
      );
    });

    it('does NOT inject tenantId for bypass models (Permission)', async () => {
      const query = jest.fn().mockResolvedValue([]);
      const handler = getHandler('findMany');

      const args = { where: {} };
      await handler({ model: 'Permission', args, query });

      expect(args.where).not.toHaveProperty('tenantId');
    });

    it('adds deletedAt: null for soft-delete models', async () => {
      const query = jest.fn().mockResolvedValue([]);
      const handler = getHandler('findMany');

      const args = { where: {} };
      await handler({ model: 'User', args, query });

      expect(args.where).toEqual(
        expect.objectContaining({ deletedAt: null }),
      );
    });

    it('does NOT add deletedAt filter for non-soft-delete models', async () => {
      const query = jest.fn().mockResolvedValue([]);
      const handler = getHandler('findMany');

      const args = { where: {} };
      await handler({ model: 'Payment', args, query });

      expect(args.where).not.toHaveProperty('deletedAt');
    });

    it('skips deletedAt filter when _includeDeleted is true', async () => {
      const query = jest.fn().mockResolvedValue([]);
      const handler = getHandler('findMany');

      const args = { where: { _includeDeleted: true } };
      await handler({ model: 'User', args, query });

      expect(args.where).not.toHaveProperty('deletedAt');
      expect(args.where).not.toHaveProperty('_includeDeleted');
    });

    it('strips _includeDeleted from where even when false', async () => {
      const query = jest.fn().mockResolvedValue([]);
      const handler = getHandler('findMany');

      const args = { where: { _includeDeleted: false } };
      await handler({ model: 'User', args, query });

      expect(args.where).not.toHaveProperty('_includeDeleted');
      expect(args.where).toEqual(
        expect.objectContaining({ deletedAt: null }),
      );
    });

    it('calls through to the original query', async () => {
      const query = jest.fn().mockResolvedValue([{ id: '1' }]);
      const handler = getHandler('findMany');

      const result = await handler({
        model: 'Branch',
        args: { where: {} },
        query,
      });

      expect(query).toHaveBeenCalled();
      expect(result).toEqual([{ id: '1' }]);
    });
  });

  // =========================================================================
  // Tenant injection — findFirst
  // =========================================================================

  describe('findFirst', () => {
    it('injects tenantId into where clause', async () => {
      const query = jest.fn().mockResolvedValue(null);
      const handler = getHandler('findFirst');

      const args = { where: { email: 'a@b.com' } };
      await handler({ model: 'Client', args, query });

      expect(args.where).toEqual(
        expect.objectContaining({ tenantId: TENANT_ID }),
      );
    });

    it('adds deletedAt: null for soft-delete models', async () => {
      const query = jest.fn().mockResolvedValue(null);
      const handler = getHandler('findFirst');

      const args = { where: {} };
      await handler({ model: 'Client', args, query });

      expect(args.where).toEqual(
        expect.objectContaining({ deletedAt: null }),
      );
    });

    it('does NOT inject tenantId for bypass model RolePermission', async () => {
      const query = jest.fn().mockResolvedValue(null);
      const handler = getHandler('findFirst');

      const args = { where: {} };
      await handler({ model: 'RolePermission', args, query });

      expect(args.where).not.toHaveProperty('tenantId');
    });
  });

  // =========================================================================
  // Tenant isolation — findUnique
  // =========================================================================

  describe('findUnique', () => {
    it('returns null when result belongs to a different tenant', async () => {
      const query = jest.fn().mockResolvedValue({
        id: '1',
        tenantId: OTHER_TENANT,
      });
      const handler = getHandler('findUnique');

      const result = await handler({
        model: 'User',
        args: { where: { id: '1' } },
        query,
      });

      expect(result).toBeNull();
    });

    it('returns the result when tenant matches', async () => {
      const record = { id: '1', tenantId: TENANT_ID, deletedAt: null };
      const query = jest.fn().mockResolvedValue(record);
      const handler = getHandler('findUnique');

      const result = await handler({
        model: 'User',
        args: { where: { id: '1' } },
        query,
      });

      expect(result).toEqual(record);
    });

    it('returns null for soft-deleted records without _includeDeleted', async () => {
      const record = {
        id: '1',
        tenantId: TENANT_ID,
        deletedAt: new Date(),
      };
      const query = jest.fn().mockResolvedValue(record);
      const handler = getHandler('findUnique');

      const result = await handler({
        model: 'Order',
        args: { where: { id: '1' } },
        query,
      });

      expect(result).toBeNull();
    });

    it('returns soft-deleted record when _includeDeleted is true', async () => {
      const record = {
        id: '1',
        tenantId: TENANT_ID,
        deletedAt: new Date(),
      };
      const query = jest.fn().mockResolvedValue(record);
      const handler = getHandler('findUnique');

      const result = await handler({
        model: 'Order',
        args: { where: { id: '1', _includeDeleted: true } },
        query,
      });

      expect(result).toEqual(record);
    });

    it('returns null when query returns null', async () => {
      const query = jest.fn().mockResolvedValue(null);
      const handler = getHandler('findUnique');

      const result = await handler({
        model: 'User',
        args: { where: { id: '1' } },
        query,
      });

      expect(result).toBeNull();
    });

    it('does NOT check tenantId for bypass models', async () => {
      const record = { id: '1' }; // no tenantId
      const query = jest.fn().mockResolvedValue(record);
      const handler = getHandler('findUnique');

      const result = await handler({
        model: 'Permission',
        args: { where: { id: '1' } },
        query,
      });

      expect(result).toEqual(record);
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    it('injects tenantId into data', async () => {
      const query = jest.fn().mockResolvedValue({ id: '1' });
      const handler = getHandler('create');

      const args = { data: { name: 'Test' } };
      await handler({ model: 'Branch', args, query });

      expect(args.data).toEqual(
        expect.objectContaining({ tenantId: TENANT_ID }),
      );
    });

    it('does NOT inject tenantId for bypass models', async () => {
      const query = jest.fn().mockResolvedValue({ id: '1' });
      const handler = getHandler('create');

      const args = { data: { module: 'orders', action: 'read' } };
      await handler({ model: 'Permission', args, query });

      expect(args.data).not.toHaveProperty('tenantId');
    });
  });

  // =========================================================================
  // createMany
  // =========================================================================

  describe('createMany', () => {
    it('injects tenantId into each item in array data', async () => {
      const query = jest.fn().mockResolvedValue({ count: 2 });
      const handler = getHandler('createMany');

      const args = {
        data: [{ name: 'A' }, { name: 'B' }],
      };
      await handler({ model: 'Service', args, query });

      expect(args.data).toEqual([
        expect.objectContaining({ tenantId: TENANT_ID, name: 'A' }),
        expect.objectContaining({ tenantId: TENANT_ID, name: 'B' }),
      ]);
    });

    it('injects tenantId into single data object', async () => {
      const query = jest.fn().mockResolvedValue({ count: 1 });
      const handler = getHandler('createMany');

      const args = { data: { name: 'Single' } };
      await handler({ model: 'Service', args, query });

      expect(args.data).toEqual(
        expect.objectContaining({ tenantId: TENANT_ID }),
      );
    });

    it('does NOT inject tenantId for bypass models', async () => {
      const query = jest.fn().mockResolvedValue({ count: 1 });
      const handler = getHandler('createMany');

      const args = { data: [{ key: 'k1' }] };
      await handler({ model: 'IdempotencyKey', args, query });

      expect(args.data[0]).not.toHaveProperty('tenantId');
    });
  });

  // =========================================================================
  // update / updateMany
  // =========================================================================

  describe('update', () => {
    it('injects tenantId into where clause', async () => {
      const query = jest.fn().mockResolvedValue({ id: '1' });
      const handler = getHandler('update');

      const args = { where: { id: '1' }, data: { name: 'New' } };
      await handler({ model: 'Branch', args, query });

      expect(args.where).toEqual(
        expect.objectContaining({ tenantId: TENANT_ID }),
      );
    });

    it('does NOT inject tenantId for bypass models', async () => {
      const query = jest.fn().mockResolvedValue({ id: '1' });
      const handler = getHandler('update');

      const args = { where: { id: '1' }, data: {} };
      await handler({ model: 'Permission', args, query });

      expect(args.where).not.toHaveProperty('tenantId');
    });
  });

  describe('updateMany', () => {
    it('injects tenantId into where clause', async () => {
      const query = jest.fn().mockResolvedValue({ count: 1 });
      const handler = getHandler('updateMany');

      const args = { where: { isActive: true }, data: { isActive: false } };
      await handler({ model: 'User', args, query });

      expect(args.where).toEqual(
        expect.objectContaining({ tenantId: TENANT_ID }),
      );
    });
  });

  // =========================================================================
  // delete / deleteMany
  // =========================================================================

  describe('delete', () => {
    it('injects tenantId into where clause', async () => {
      const query = jest.fn().mockResolvedValue({ id: '1' });
      const handler = getHandler('delete');

      const args = { where: { id: '1' } };
      await handler({ model: 'Vehicle', args, query });

      expect(args.where).toEqual(
        expect.objectContaining({ tenantId: TENANT_ID }),
      );
    });
  });

  describe('deleteMany', () => {
    it('injects tenantId into where clause', async () => {
      const query = jest.fn().mockResolvedValue({ count: 3 });
      const handler = getHandler('deleteMany');

      const args = { where: {} };
      await handler({ model: 'Service', args, query });

      expect(args.where).toEqual(
        expect.objectContaining({ tenantId: TENANT_ID }),
      );
    });
  });

  // =========================================================================
  // count / aggregate / groupBy
  // =========================================================================

  describe('count', () => {
    it('injects tenantId and deletedAt filter', async () => {
      const query = jest.fn().mockResolvedValue(5);
      const handler = getHandler('count');

      const args = { where: {} };
      await handler({ model: 'User', args, query });

      expect(args.where).toEqual(
        expect.objectContaining({ tenantId: TENANT_ID, deletedAt: null }),
      );
    });

    it('does NOT add deletedAt for non-soft-delete models', async () => {
      const query = jest.fn().mockResolvedValue(2);
      const handler = getHandler('count');

      const args = { where: {} };
      await handler({ model: 'Payment', args, query });

      expect(args.where).not.toHaveProperty('deletedAt');
    });
  });

  describe('aggregate', () => {
    it('injects tenantId and soft-delete filter', async () => {
      const query = jest.fn().mockResolvedValue({ _count: 3 });
      const handler = getHandler('aggregate');

      const args = { where: {} };
      await handler({ model: 'Order', args, query });

      expect(args.where).toEqual(
        expect.objectContaining({ tenantId: TENANT_ID, deletedAt: null }),
      );
    });
  });

  describe('groupBy', () => {
    it('injects tenantId and soft-delete filter', async () => {
      const query = jest.fn().mockResolvedValue([]);
      const handler = getHandler('groupBy');

      const args = { where: {}, by: ['status'] };
      await handler({ model: 'Order', args, query });

      expect(args.where).toEqual(
        expect.objectContaining({ tenantId: TENANT_ID, deletedAt: null }),
      );
    });

    it('skips deletedAt filter when _includeDeleted is true', async () => {
      const query = jest.fn().mockResolvedValue([]);
      const handler = getHandler('groupBy');

      const args = { where: { _includeDeleted: true }, by: ['status'] };
      await handler({ model: 'Order', args, query });

      expect(args.where).not.toHaveProperty('deletedAt');
      expect(args.where).not.toHaveProperty('_includeDeleted');
    });
  });

  // =========================================================================
  // Bypass model overrides (permission, rolePermission, idempotencyKey)
  // =========================================================================

  describe('bypass model overrides', () => {
    it.each(['permission', 'rolePermission', 'idempotencyKey'])(
      '%s $allOperations passes args through unchanged',
      async (modelName) => {
        // Trigger forTenant to get extension config
        const { prisma: mockPrisma } = buildPrismaMock();
        const mod = await Test.createTestingModule({
          providers: [
            TenantPrismaService,
            { provide: PrismaService, useValue: mockPrisma },
          ],
        }).compile();
        const svc = mod.get<TenantPrismaService>(TenantPrismaService);
        svc.forTenant(TENANT_ID);

        const config = mockPrisma.$extends.mock.calls[0][0];
        const handler = config.query[modelName].$allOperations;

        const args = { where: { id: '1' } };
        const query = jest.fn().mockResolvedValue({ id: '1' });
        const result = await handler({ args, query });

        expect(query).toHaveBeenCalledWith(args);
        expect(result).toEqual({ id: '1' });
      },
    );
  });

  // =========================================================================
  // All soft-delete models
  // =========================================================================

  describe('soft-delete model coverage', () => {
    const SOFT_DELETE_MODELS = [
      'User',
      'Client',
      'Order',
      'Vehicle',
      'Service',
      'Branch',
      'Role',
      'WorkPost',
      'EmployeeProfile',
    ];

    it.each(SOFT_DELETE_MODELS)(
      '%s gets deletedAt: null injected in findMany',
      async (model) => {
        const query = jest.fn().mockResolvedValue([]);
        const handler = getHandler('findMany');

        const args = { where: {} };
        await handler({ model, args, query });

        expect(args.where).toHaveProperty('deletedAt', null);
      },
    );
  });

  // =========================================================================
  // Helper: get handler from the extension config
  // =========================================================================

  function getHandler(operation: string) {
    const prismaRef = (service as any).prisma;
    const config = prismaRef.$extends.mock.calls[0][0];
    return config.query.$allModels[operation];
  }
});
