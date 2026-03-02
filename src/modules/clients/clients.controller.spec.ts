import { Test, TestingModule } from '@nestjs/testing';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import type { CreateClientDto } from './dto/create-client.dto';
import type { UpdateClientDto } from './dto/update-client.dto';
import type { MergeClientDto } from './dto/merge-client.dto';
import type { ClientQueryDto } from './dto/client-query.dto';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

const TENANT_ID = 'tenant-uuid-1111';
const CLIENT_ID = 'client-uuid-2222';
const USER_ID = 'user-uuid-3333';

const mockUser: JwtPayload = { sub: USER_ID } as JwtPayload;

const mockClientsService = {
  merge: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
};

describe('ClientsController', () => {
  let controller: ClientsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [{ provide: ClientsService, useValue: mockClientsService }],
    })
      .overrideGuard(require('../../common/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(
        require('../../common/guards/permissions.guard').PermissionsGuard,
      )
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ClientsController>(ClientsController);
  });

  describe('merge', () => {
    it('delegates to clientsService.merge with tenantId, dto and user sub', async () => {
      const dto: MergeClientDto = {
        survivorId: CLIENT_ID,
        duplicateIds: ['dup-uuid-1'],
      } as MergeClientDto;
      const expected = { id: CLIENT_ID };
      mockClientsService.merge.mockResolvedValue(expected);

      const result = await controller.merge(TENANT_ID, dto, mockUser);

      expect(mockClientsService.merge).toHaveBeenCalledTimes(1);
      expect(mockClientsService.merge).toHaveBeenCalledWith(
        TENANT_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('findAll', () => {
    it('delegates to clientsService.findAll with tenantId and query', async () => {
      const query: ClientQueryDto = { page: 1, limit: 10 } as ClientQueryDto;
      const expected = { data: [], total: 0 };
      mockClientsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(TENANT_ID, query);

      expect(mockClientsService.findAll).toHaveBeenCalledTimes(1);
      expect(mockClientsService.findAll).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('findOne', () => {
    it('delegates to clientsService.findById with tenantId and id', async () => {
      const expected = { id: CLIENT_ID };
      mockClientsService.findById.mockResolvedValue(expected);

      const result = await controller.findOne(TENANT_ID, CLIENT_ID);

      expect(mockClientsService.findById).toHaveBeenCalledTimes(1);
      expect(mockClientsService.findById).toHaveBeenCalledWith(
        TENANT_ID,
        CLIENT_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('create', () => {
    it('delegates to clientsService.create with tenantId and dto', async () => {
      const dto: CreateClientDto = { name: 'Alice' } as CreateClientDto;
      const expected = { id: CLIENT_ID, name: 'Alice' };
      mockClientsService.create.mockResolvedValue(expected);

      const result = await controller.create(TENANT_ID, dto);

      expect(mockClientsService.create).toHaveBeenCalledTimes(1);
      expect(mockClientsService.create).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('update', () => {
    it('delegates to clientsService.update with tenantId, id and dto', async () => {
      const dto: UpdateClientDto = { name: 'Alice Updated' } as UpdateClientDto;
      const expected = { id: CLIENT_ID, name: 'Alice Updated' };
      mockClientsService.update.mockResolvedValue(expected);

      const result = await controller.update(TENANT_ID, CLIENT_ID, dto);

      expect(mockClientsService.update).toHaveBeenCalledTimes(1);
      expect(mockClientsService.update).toHaveBeenCalledWith(
        TENANT_ID,
        CLIENT_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('remove', () => {
    it('delegates to clientsService.softDelete with tenantId, id and user sub', async () => {
      const expected = { deleted: true };
      mockClientsService.softDelete.mockResolvedValue(expected);

      const result = await controller.remove(TENANT_ID, CLIENT_ID, mockUser);

      expect(mockClientsService.softDelete).toHaveBeenCalledTimes(1);
      expect(mockClientsService.softDelete).toHaveBeenCalledWith(
        TENANT_ID,
        CLIENT_ID,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('restore', () => {
    it('delegates to clientsService.restore with tenantId and id', async () => {
      const expected = { id: CLIENT_ID };
      mockClientsService.restore.mockResolvedValue(expected);

      const result = await controller.restore(TENANT_ID, CLIENT_ID);

      expect(mockClientsService.restore).toHaveBeenCalledTimes(1);
      expect(mockClientsService.restore).toHaveBeenCalledWith(
        TENANT_ID,
        CLIENT_ID,
      );
      expect(result).toBe(expected);
    });
  });
});
