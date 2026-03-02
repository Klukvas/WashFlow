import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { TenantsRepository } from './tenants.repository';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly tenantsRepo: TenantsRepository) {}

  async findAll() {
    return this.tenantsRepo.findAll();
  }

  async findById(id: string) {
    const tenant = await this.tenantsRepo.findById(id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.tenantsRepo.findBySlug(slug);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async create(dto: CreateTenantDto) {
    const existing = await this.tenantsRepo.findBySlug(dto.slug);
    if (existing) throw new ConflictException('Slug already in use');

    return this.tenantsRepo.create({
      name: dto.name,
      slug: dto.slug,
    });
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findById(id);
    return this.tenantsRepo.update(id, dto);
  }

  async getBookingSettings(tenantId: string) {
    return this.tenantsRepo.getBookingSettings(tenantId);
  }
}
