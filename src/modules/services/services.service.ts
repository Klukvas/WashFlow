import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ServicesRepository } from './services.repository';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly servicesRepo: ServicesRepository) {}

  async findAll(tenantId: string) {
    return this.servicesRepo.findAll(tenantId);
  }

  async findActive(tenantId: string) {
    return this.servicesRepo.findActive(tenantId);
  }

  async findById(tenantId: string, id: string) {
    const service = await this.servicesRepo.findById(tenantId, id);
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async create(tenantId: string, dto: CreateServiceDto) {
    return this.servicesRepo.create(tenantId, { ...dto });
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto) {
    await this.findById(tenantId, id);
    return this.servicesRepo.update(tenantId, id, { ...dto });
  }

  async softDelete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.servicesRepo.softDelete(tenantId, id);
  }

  async restore(tenantId: string, id: string) {
    const service = await this.servicesRepo.findByIdIncludeDeleted(
      tenantId,
      id,
    );
    if (!service) throw new NotFoundException('Service not found');
    if (!service.deletedAt)
      throw new BadRequestException('Service is not deleted');
    return this.servicesRepo.restore(tenantId, id);
  }
}
