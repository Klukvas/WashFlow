import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsRepository } from './permissions.repository';
import { PrismaService } from '../../prisma/prisma.service';

describe('PermissionsRepository', () => {
  let repo: PermissionsRepository;
  let prisma: any;

  const mockPermission = { id: 'perm-1', module: 'orders', action: 'read' };

  beforeEach(async () => {
    prisma = {
      permission: {
        findMany: jest.fn().mockResolvedValue([mockPermission]),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<PermissionsRepository>(PermissionsRepository);
  });

  describe('findAll', () => {
    it('returns all permissions ordered by module then action', async () => {
      const result = await repo.findAll();
      expect(prisma.permission.findMany).toHaveBeenCalledWith({
        orderBy: [{ module: 'asc' }, { action: 'asc' }],
      });
      expect(result).toEqual([mockPermission]);
    });
  });

  describe('findByModule', () => {
    it('returns permissions for the specified module ordered by action', async () => {
      const result = await repo.findByModule('orders');
      expect(prisma.permission.findMany).toHaveBeenCalledWith({
        where: { module: 'orders' },
        orderBy: { action: 'asc' },
      });
      expect(result).toEqual([mockPermission]);
    });
  });

  describe('findByIds', () => {
    it('returns permissions matching the given ids', async () => {
      const ids = ['perm-1', 'perm-2'];
      const result = await repo.findByIds(ids);
      expect(prisma.permission.findMany).toHaveBeenCalledWith({
        where: { id: { in: ids } },
      });
      expect(result).toEqual([mockPermission]);
    });
  });
});
