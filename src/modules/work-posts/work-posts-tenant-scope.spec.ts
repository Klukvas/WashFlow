import { Prisma } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { SubscriptionLimitsService } from '../subscriptions/subscription-limits.service';
import { WorkPostsRepository } from './work-posts.repository';
import { WorkPostsService } from './work-posts.service';

type Row = Record<string, unknown>;
type QueryArgs = { where?: Row; data?: Row };
type QueryHandler = (params: {
  model: string;
  args: QueryArgs;
  query: (args: QueryArgs) => Promise<unknown>;
}) => Promise<unknown>;
type Extension = {
  query: { $allModels: { findFirst: QueryHandler; create: QueryHandler } };
};

const branch = {
  id: 'branch-1',
  tenantId: 'tenant-1',
  isActive: true,
  deletedAt: null,
};
const dto = { name: 'Post A', branchId: branch.id };

describe('WorkPostsService create branch tenancy', () => {
  let service: WorkPostsService;
  let branches: Row[];
  const checkLimit = jest.fn().mockResolvedValue(undefined);
  const create = jest.fn(({ data }: QueryArgs) =>
    Promise.resolve({
      ...data,
      id: 'post-1',
      branch: branches.find((row) => row.id === data?.branchId),
    }),
  );

  beforeEach(async () => {
    jest.clearAllMocks();
    branches = [branch];
    const module = await Test.createTestingModule({
      providers: [
        WorkPostsService,
        WorkPostsRepository,
        TenantPrismaService,
        {
          provide: SubscriptionLimitsService,
          useValue: {
            withResourceLimit: async (
              tenantId: string,
              resource: string,
              operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
            ) => {
              await checkLimit(tenantId, resource);
              return operation({
                workPost: { create },
              } as unknown as Prisma.TransactionClient);
            },
          },
        },
        {
          provide: PrismaService,
          useValue: {
            $extends: (extension: Extension) => ({
              branch: {
                findFirst: (args: QueryArgs) =>
                  extension.query.$allModels.findFirst({
                    model: 'Branch',
                    args,
                    query: ({ where }) =>
                      Promise.resolve(
                        branches.find((row) =>
                          Object.entries(where ?? {}).every(
                            ([key, value]) => row[key] === value,
                          ),
                        ) ?? null,
                      ),
                  }),
              },
              workPost: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: (args: QueryArgs) =>
                  extension.query.$allModels.create({
                    model: 'WorkPost',
                    args,
                    query: create,
                  }),
              },
            }),
          },
        },
      ],
    }).compile();
    service = module.get(WorkPostsService);
  });

  it.each([
    ['foreign tenant', { tenantId: 'tenant-2' }],
    ['soft-deleted', { deletedAt: new Date('2026-10-14') }],
    ['inactive', { isActive: false }],
    ['missing', { id: 'different-branch' }],
  ])('rejects a %s branch for a tenant-wide user', async (_, overrides) => {
    branches = [{ ...branch, ...overrides }];

    await expect(service.create(branch.tenantId, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(create).not.toHaveBeenCalled();
    expect(checkLimit).not.toHaveBeenCalled();
  });

  it.each([null, branch.id])(
    'creates a post in the active tenant branch for scope %s',
    async (userBranchId) => {
      await expect(
        service.create(branch.tenantId, dto, userBranchId),
      ).resolves.toEqual({
        ...dto,
        tenantId: branch.tenantId,
        id: 'post-1',
        branch,
      });
      expect(checkLimit).toHaveBeenCalledWith(branch.tenantId, 'workPosts');
      expect(create).toHaveBeenCalledTimes(1);
    },
  );
});
