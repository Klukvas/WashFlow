import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsRepository } from './clients.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { EventType } from '../../common/events/event-types';
import { ClientQueryDto } from './dto/client-query.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { MergeClientDto } from './dto/merge-client.dto';

const TENANT_ID = 'tenant-abc';
const CLIENT_ID = 'client-123';
const PERFORMER_ID = 'user-456';

function buildClient(overrides: Record<string, unknown> = {}) {
  return {
    id: CLIENT_ID,
    tenantId: TENANT_ID,
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    email: 'john@example.com',
    notes: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    vehicles: [],
    orders: [],
    ...overrides,
  };
}

function buildQuery(overrides: Partial<ClientQueryDto> = {}): ClientQueryDto {
  return Object.assign(new ClientQueryDto(), {
    page: 1,
    limit: 20,
    sortOrder: 'asc' as const,
    ...overrides,
  });
}

describe('ClientsService', () => {
  let service: ClientsService;
  let clientsRepo: jest.Mocked<ClientsRepository>;
  let eventDispatcher: jest.Mocked<EventDispatcherService>;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const repoMock: jest.Mocked<ClientsRepository> = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      findByIdIncludeDeleted: jest.fn(),
      restore: jest.fn(),
      merge: jest.fn(),
    } as unknown as jest.Mocked<ClientsRepository>;

    const dispatcherMock: jest.Mocked<EventDispatcherService> = {
      dispatch: jest.fn(),
    } as unknown as jest.Mocked<EventDispatcherService>;

    const tenantPrismaMock = {
      forTenant: jest.fn().mockReturnValue({
        $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
          fn({}),
        ),
      }),
    } as unknown as jest.Mocked<TenantPrismaService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: ClientsRepository, useValue: repoMock },
        { provide: TenantPrismaService, useValue: tenantPrismaMock },
        { provide: EventDispatcherService, useValue: dispatcherMock },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
    clientsRepo = module.get(ClientsRepository);
    tenantPrisma = module.get(TenantPrismaService);
    eventDispatcher = module.get(EventDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------

  describe('findAll', () => {
    it('returns a paginated response with items, total, page, limit, and totalPages', async () => {
      const clients = [
        buildClient(),
        buildClient({ id: 'client-999', firstName: 'Jane' }),
      ];
      clientsRepo.findAll.mockResolvedValue({ items: clients, total: 2 });

      const query = buildQuery({ page: 1, limit: 20 });
      const result = await service.findAll(TENANT_ID, query);

      expect(clientsRepo.findAll).toHaveBeenCalledTimes(1);
      expect(clientsRepo.findAll).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toEqual({
        items: clients,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('returns empty items array and zero total when no clients exist', async () => {
      clientsRepo.findAll.mockResolvedValue({ items: [], total: 0 });

      const query = buildQuery();
      const result = await service.findAll(TENANT_ID, query);

      expect(result).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
    });

    it('calculates totalPages correctly across multiple pages', async () => {
      const clients = Array.from({ length: 5 }, (_, i) =>
        buildClient({ id: `client-${i}` }),
      );
      clientsRepo.findAll.mockResolvedValue({ items: clients, total: 47 });

      const query = buildQuery({ page: 3, limit: 5 });
      const result = await service.findAll(TENANT_ID, query);

      expect(result.totalPages).toBe(10);
      expect(result.page).toBe(3);
      expect(result.limit).toBe(5);
    });

    it('passes the search parameter through to the repository', async () => {
      clientsRepo.findAll.mockResolvedValue({ items: [], total: 0 });

      const query = buildQuery({ search: 'John' });
      await service.findAll(TENANT_ID, query);

      expect(clientsRepo.findAll).toHaveBeenCalledWith(TENANT_ID, query);
    });
  });

  // ---------------------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------------------

  describe('findById', () => {
    it('returns the client when the repository finds a match', async () => {
      const client = buildClient();
      clientsRepo.findById.mockResolvedValue(client as any);

      const result = await service.findById(TENANT_ID, CLIENT_ID);

      expect(clientsRepo.findById).toHaveBeenCalledWith(TENANT_ID, CLIENT_ID);
      expect(result).toEqual(client);
    });

    it('throws NotFoundException when the repository returns null', async () => {
      clientsRepo.findById.mockResolvedValue(null);

      await expect(
        service.findById(TENANT_ID, 'nonexistent-id'),
      ).rejects.toThrow(new NotFoundException('Client not found'));
    });

    it('throws NotFoundException when the repository returns undefined', async () => {
      clientsRepo.findById.mockResolvedValue(undefined as any);

      await expect(service.findById(TENANT_ID, CLIENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  describe('create', () => {
    it('delegates to the repository and returns the created client', async () => {
      const dto: CreateClientDto = {
        firstName: 'Alice',
        lastName: 'Smith',
        phone: '+9998887766',
      };
      const created = buildClient({ firstName: 'Alice', lastName: 'Smith' });
      clientsRepo.create.mockResolvedValue(created as any);

      const result = await service.create(TENANT_ID, dto);

      expect(clientsRepo.create).toHaveBeenCalledTimes(1);
      expect(clientsRepo.create).toHaveBeenCalledWith(TENANT_ID, { ...dto });
      expect(result).toEqual(created);
    });

    it('passes a shallow copy of the DTO so the original is not mutated', async () => {
      const dto: CreateClientDto = { firstName: 'Bob' };
      clientsRepo.create.mockResolvedValue(
        buildClient({ firstName: 'Bob' }) as any,
      );

      await service.create(TENANT_ID, dto);

      const callArg = clientsRepo.create.mock.calls[0][1];
      expect(callArg).not.toBe(dto);
      expect(callArg).toEqual(dto);
    });

    it('handles a DTO with only the required firstName field', async () => {
      const dto: CreateClientDto = { firstName: 'OnlyFirst' };
      clientsRepo.create.mockResolvedValue(
        buildClient({ firstName: 'OnlyFirst' }) as any,
      );

      await service.create(TENANT_ID, dto);

      expect(clientsRepo.create).toHaveBeenCalledWith(TENANT_ID, {
        firstName: 'OnlyFirst',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  describe('update', () => {
    it('finds the client then delegates update to the repository', async () => {
      const existing = buildClient();
      clientsRepo.findById.mockResolvedValue(existing as any);
      const updated = buildClient({ lastName: 'Updated' });
      clientsRepo.update.mockResolvedValue(updated as any);

      const dto: UpdateClientDto = { lastName: 'Updated' };
      const result = await service.update(TENANT_ID, CLIENT_ID, dto);

      expect(clientsRepo.findById).toHaveBeenCalledWith(TENANT_ID, CLIENT_ID);
      expect(clientsRepo.update).toHaveBeenCalledWith(TENANT_ID, CLIENT_ID, {
        ...dto,
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the client does not exist', async () => {
      clientsRepo.findById.mockResolvedValue(null);

      const dto: UpdateClientDto = { lastName: 'X' };
      await expect(
        service.update(TENANT_ID, 'missing-id', dto),
      ).rejects.toThrow(new NotFoundException('Client not found'));

      expect(clientsRepo.update).not.toHaveBeenCalled();
    });

    it('passes a shallow copy of the DTO to the repository', async () => {
      clientsRepo.findById.mockResolvedValue(buildClient() as any);
      clientsRepo.update.mockResolvedValue(buildClient() as any);

      const dto: UpdateClientDto = { email: 'new@example.com' };
      await service.update(TENANT_ID, CLIENT_ID, dto);

      const callArg = clientsRepo.update.mock.calls[0][2];
      expect(callArg).not.toBe(dto);
      expect(callArg).toEqual(dto);
    });
  });

  // ---------------------------------------------------------------------------
  // softDelete
  // ---------------------------------------------------------------------------

  describe('softDelete', () => {
    it('deletes the client and dispatches a CLIENT_DELETED event', async () => {
      const client = buildClient();
      clientsRepo.findById.mockResolvedValue(client as any);
      const deleteResult = buildClient({ deletedAt: new Date() });
      clientsRepo.softDelete.mockResolvedValue(deleteResult as any);

      const result = await service.softDelete(
        TENANT_ID,
        CLIENT_ID,
        PERFORMER_ID,
      );

      expect(clientsRepo.findById).toHaveBeenCalledWith(TENANT_ID, CLIENT_ID);
      expect(clientsRepo.softDelete).toHaveBeenCalledWith(TENANT_ID, CLIENT_ID);
      expect(result).toEqual(deleteResult);
    });

    it('dispatches exactly one event with the correct eventType', async () => {
      clientsRepo.findById.mockResolvedValue(buildClient() as any);
      clientsRepo.softDelete.mockResolvedValue(
        buildClient({ deletedAt: new Date() }) as any,
      );

      await service.softDelete(TENANT_ID, CLIENT_ID, PERFORMER_ID);

      expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
      const dispatchedEvent = eventDispatcher.dispatch.mock.calls[0][0];
      expect(dispatchedEvent.eventType).toBe(EventType.CLIENT_DELETED);
    });

    it('includes clientId, clientName, and performedById in the event payload', async () => {
      clientsRepo.findById.mockResolvedValue(buildClient() as any);
      clientsRepo.softDelete.mockResolvedValue(
        buildClient({ deletedAt: new Date() }) as any,
      );

      await service.softDelete(TENANT_ID, CLIENT_ID, PERFORMER_ID);

      const event = eventDispatcher.dispatch.mock.calls[0][0];
      expect(event.tenantId).toBe(TENANT_ID);
      expect(event.payload).toEqual({
        clientId: CLIENT_ID,
        clientName: 'John Doe',
        performedById: PERFORMER_ID,
      });
    });

    it('dispatches event with performedById as undefined when omitted', async () => {
      clientsRepo.findById.mockResolvedValue(buildClient() as any);
      clientsRepo.softDelete.mockResolvedValue(
        buildClient({ deletedAt: new Date() }) as any,
      );

      await service.softDelete(TENANT_ID, CLIENT_ID);

      const event = eventDispatcher.dispatch.mock.calls[0][0];
      expect(event.payload).toMatchObject({ performedById: undefined });
    });

    it('throws NotFoundException and does not delete or dispatch when client is not found', async () => {
      clientsRepo.findById.mockResolvedValue(null);

      await expect(service.softDelete(TENANT_ID, 'ghost-id')).rejects.toThrow(
        new NotFoundException('Client not found'),
      );

      expect(clientsRepo.softDelete).not.toHaveBeenCalled();
      expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('constructs clientName from firstName and lastName separated by a space', async () => {
      clientsRepo.findById.mockResolvedValue(
        buildClient({ firstName: 'María', lastName: 'García-López' }) as any,
      );
      clientsRepo.softDelete.mockResolvedValue(
        buildClient({ deletedAt: new Date() }) as any,
      );

      await service.softDelete(TENANT_ID, CLIENT_ID, PERFORMER_ID);

      const event = eventDispatcher.dispatch.mock.calls[0][0];
      expect(event.payload.clientName).toBe('María García-López');
    });
  });

  // ---------------------------------------------------------------------------
  // restore
  // ---------------------------------------------------------------------------

  describe('restore', () => {
    it('restores a soft-deleted client and returns the restored record', async () => {
      const deletedClient = buildClient({ deletedAt: new Date('2024-06-01') });
      clientsRepo.findByIdIncludeDeleted.mockResolvedValue(
        deletedClient as any,
      );
      const restoredClient = buildClient({ deletedAt: null });
      clientsRepo.restore.mockResolvedValue(restoredClient as any);

      const result = await service.restore(TENANT_ID, CLIENT_ID);

      expect(clientsRepo.findByIdIncludeDeleted).toHaveBeenCalledWith(
        TENANT_ID,
        CLIENT_ID,
      );
      expect(clientsRepo.restore).toHaveBeenCalledWith(TENANT_ID, CLIENT_ID);
      expect(result).toEqual(restoredClient);
    });

    it('throws NotFoundException when the repository returns null', async () => {
      clientsRepo.findByIdIncludeDeleted.mockResolvedValue(null);

      await expect(service.restore(TENANT_ID, 'missing-id')).rejects.toThrow(
        new NotFoundException('Client not found'),
      );

      expect(clientsRepo.restore).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the repository returns undefined', async () => {
      clientsRepo.findByIdIncludeDeleted.mockResolvedValue(undefined as any);

      await expect(service.restore(TENANT_ID, CLIENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when client exists but deletedAt is null', async () => {
      const activeClient = buildClient({ deletedAt: null });
      clientsRepo.findByIdIncludeDeleted.mockResolvedValue(activeClient as any);

      await expect(service.restore(TENANT_ID, CLIENT_ID)).rejects.toThrow(
        new BadRequestException('Client is not deleted'),
      );

      expect(clientsRepo.restore).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when client exists but deletedAt is undefined', async () => {
      const activeClient = buildClient({ deletedAt: undefined });
      clientsRepo.findByIdIncludeDeleted.mockResolvedValue(activeClient as any);

      await expect(service.restore(TENANT_ID, CLIENT_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // merge
  // ---------------------------------------------------------------------------

  describe('merge', () => {
    const SOURCE_ID = 'source-client-111';
    const TARGET_ID = 'target-client-222';

    const mergeDto: MergeClientDto = {
      sourceClientId: SOURCE_ID,
      targetClientId: TARGET_ID,
      fieldOverrides: { firstName: 'John', lastName: 'Doe', phone: '+111' },
    };

    it('merges two clients and returns the merged target client', async () => {
      const source = buildClient({ id: SOURCE_ID, firstName: 'Jane' });
      const target = buildClient({ id: TARGET_ID, firstName: 'John' });
      const merged = buildClient({
        id: TARGET_ID,
        firstName: 'John',
        phone: '+111',
      });

      clientsRepo.findById
        .mockResolvedValueOnce(source as any)
        .mockResolvedValueOnce(target as any);
      clientsRepo.merge.mockResolvedValue(merged as any);

      const result = await service.merge(TENANT_ID, mergeDto, PERFORMER_ID);

      expect(clientsRepo.findById).toHaveBeenCalledWith(TENANT_ID, SOURCE_ID);
      expect(clientsRepo.findById).toHaveBeenCalledWith(TENANT_ID, TARGET_ID);
      expect(clientsRepo.merge).toHaveBeenCalledTimes(1);
      expect(result).toEqual(merged);
    });

    it('calls merge inside a transaction via tenantPrisma.forTenant', async () => {
      const source = buildClient({ id: SOURCE_ID });
      const target = buildClient({ id: TARGET_ID });
      clientsRepo.findById
        .mockResolvedValueOnce(source as any)
        .mockResolvedValueOnce(target as any);
      clientsRepo.merge.mockResolvedValue(target as any);

      await service.merge(TENANT_ID, mergeDto);

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(TENANT_ID);
    });

    it('dispatches a CLIENT_MERGED event with correct payload', async () => {
      const source = buildClient({ id: SOURCE_ID });
      const target = buildClient({ id: TARGET_ID });
      clientsRepo.findById
        .mockResolvedValueOnce(source as any)
        .mockResolvedValueOnce(target as any);
      clientsRepo.merge.mockResolvedValue(target as any);

      await service.merge(TENANT_ID, mergeDto, PERFORMER_ID);

      expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
      const event = eventDispatcher.dispatch.mock.calls[0][0];
      expect(event.eventType).toBe(EventType.CLIENT_MERGED);
      expect(event.tenantId).toBe(TENANT_ID);
      expect(event.payload).toEqual({
        sourceClientId: SOURCE_ID,
        targetClientId: TARGET_ID,
        performedById: PERFORMER_ID,
        fieldOverrides: mergeDto.fieldOverrides,
      });
    });

    it('throws NotFoundException when source client does not exist', async () => {
      clientsRepo.findById
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildClient({ id: TARGET_ID }) as any);

      await expect(
        service.merge(TENANT_ID, mergeDto, PERFORMER_ID),
      ).rejects.toThrow(new NotFoundException('Source client not found'));

      expect(clientsRepo.merge).not.toHaveBeenCalled();
      expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when target client does not exist', async () => {
      clientsRepo.findById
        .mockResolvedValueOnce(buildClient({ id: SOURCE_ID }) as any)
        .mockResolvedValueOnce(null);

      await expect(
        service.merge(TENANT_ID, mergeDto, PERFORMER_ID),
      ).rejects.toThrow(new NotFoundException('Target client not found'));

      expect(clientsRepo.merge).not.toHaveBeenCalled();
      expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('passes a shallow copy of fieldOverrides to repo and event', async () => {
      const source = buildClient({ id: SOURCE_ID });
      const target = buildClient({ id: TARGET_ID });
      clientsRepo.findById
        .mockResolvedValueOnce(source as any)
        .mockResolvedValueOnce(target as any);
      clientsRepo.merge.mockResolvedValue(target as any);

      await service.merge(TENANT_ID, mergeDto, PERFORMER_ID);

      const repoCallOverrides = clientsRepo.merge.mock.calls[0][3];
      expect(repoCallOverrides).toEqual(mergeDto.fieldOverrides);
      expect(repoCallOverrides).not.toBe(mergeDto.fieldOverrides);
    });

    it('dispatches event with performedById as undefined when omitted', async () => {
      const source = buildClient({ id: SOURCE_ID });
      const target = buildClient({ id: TARGET_ID });
      clientsRepo.findById
        .mockResolvedValueOnce(source as any)
        .mockResolvedValueOnce(target as any);
      clientsRepo.merge.mockResolvedValue(target as any);

      await service.merge(TENANT_ID, mergeDto);

      const event = eventDispatcher.dispatch.mock.calls[0][0];
      expect(event.payload.performedById).toBeUndefined();
    });
  });
});
