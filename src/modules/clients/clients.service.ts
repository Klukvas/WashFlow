import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ClientsRepository } from './clients.repository';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { MergeClientDto } from './dto/merge-client.dto';
import { ClientQueryDto } from './dto/client-query.dto';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { EventType } from '../../common/events/event-types';
import { DomainEvent } from '../../common/events/domain-event';
import { paginatedResponse } from '../../common/utils/pagination.util';

class ClientDeletedEvent extends DomainEvent {
  readonly eventType = EventType.CLIENT_DELETED;
  constructor(
    readonly tenantId: string,
    readonly payload: Record<string, unknown>,
  ) {
    super();
  }
}

class ClientMergedEvent extends DomainEvent {
  readonly eventType = EventType.CLIENT_MERGED;
  constructor(
    readonly tenantId: string,
    readonly payload: Record<string, unknown>,
  ) {
    super();
  }
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly clientsRepo: ClientsRepository,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  async findAll(tenantId: string, query: ClientQueryDto) {
    const { items, total } = await this.clientsRepo.findAll(tenantId, query);
    return paginatedResponse(items, total, query);
  }

  async findById(tenantId: string, id: string) {
    const client = await this.clientsRepo.findById(tenantId, id);
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async create(tenantId: string, dto: CreateClientDto) {
    return this.clientsRepo.create(tenantId, { ...dto });
  }

  async update(tenantId: string, id: string, dto: UpdateClientDto) {
    await this.findById(tenantId, id);
    return this.clientsRepo.update(tenantId, id, { ...dto });
  }

  async softDelete(tenantId: string, id: string, performedById?: string) {
    const client = await this.findById(tenantId, id);
    const result = await this.clientsRepo.softDelete(tenantId, id);

    this.eventDispatcher.dispatch(
      new ClientDeletedEvent(tenantId, {
        clientId: id,
        clientName: `${client.firstName} ${client.lastName}`,
        performedById,
      }),
    );

    return result;
  }

  async restore(tenantId: string, id: string) {
    const client = await this.clientsRepo.findByIdIncludeDeleted(tenantId, id);
    if (!client) throw new NotFoundException('Client not found');
    if (!client.deletedAt)
      throw new BadRequestException('Client is not deleted');
    return this.clientsRepo.restore(tenantId, id);
  }

  async merge(tenantId: string, dto: MergeClientDto, performedById?: string) {
    const { sourceClientId, targetClientId, fieldOverrides } = dto;

    // Validate both clients exist and are not deleted
    const [source, target] = await Promise.all([
      this.clientsRepo.findById(tenantId, sourceClientId),
      this.clientsRepo.findById(tenantId, targetClientId),
    ]);

    if (!source) throw new NotFoundException('Source client not found');
    if (!target) throw new NotFoundException('Target client not found');

    const tenantDb = this.tenantPrisma.forTenant(tenantId);
    const merged = await tenantDb.$transaction(async (tx) => {
      return this.clientsRepo.merge(tx as any, sourceClientId, targetClientId, {
        ...fieldOverrides,
      });
    });

    this.eventDispatcher.dispatch(
      new ClientMergedEvent(tenantId, {
        sourceClientId,
        targetClientId,
        performedById,
        fieldOverrides: { ...fieldOverrides },
      }),
    );

    return merged;
  }
}
