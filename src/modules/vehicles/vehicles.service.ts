import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { VehiclesRepository } from './vehicles.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleQueryDto } from './dto/vehicle-query.dto';
import { paginatedResponse } from '../../common/utils/pagination.util';

const ALLOWED_PHOTO_PREFIX = '/uploads/vehicles/';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly vehiclesRepo: VehiclesRepository,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async findAll(tenantId: string, query: VehicleQueryDto) {
    const { items, total } = await this.vehiclesRepo.findAll(tenantId, query);
    return paginatedResponse(items, total, query);
  }

  async findByClientId(tenantId: string, clientId: string) {
    return this.vehiclesRepo.findByClientId(tenantId, clientId);
  }

  async findById(tenantId: string, id: string) {
    const vehicle = await this.vehiclesRepo.findById(tenantId, id);
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  async create(tenantId: string, dto: CreateVehicleDto) {
    await this.validateClientBelongsToTenant(tenantId, dto.clientId);
    return this.vehiclesRepo.create(tenantId, { ...dto });
  }

  private async validateClientBelongsToTenant(
    tenantId: string,
    clientId: string,
  ) {
    const client = await this.tenantPrisma
      .forTenant(tenantId)
      .client.findFirst({ where: { id: clientId } });
    if (!client) {
      throw new BadRequestException('Client not found in this tenant');
    }
  }

  async update(tenantId: string, id: string, dto: UpdateVehicleDto) {
    await this.findById(tenantId, id);
    return this.vehiclesRepo.update(tenantId, id, { ...dto });
  }

  async softDelete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.vehiclesRepo.softDelete(tenantId, id);
  }

  async restore(tenantId: string, id: string) {
    const vehicle = await this.vehiclesRepo.findByIdIncludeDeleted(
      tenantId,
      id,
    );
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (!vehicle.deletedAt)
      throw new BadRequestException('Vehicle is not deleted');
    return this.vehiclesRepo.restore(tenantId, id);
  }

  async updatePhoto(tenantId: string, id: string, photoUrl: string) {
    const vehicle = await this.findById(tenantId, id);
    if (vehicle.photoUrl) {
      this.deletePhotoFile(vehicle.photoUrl);
    }
    return this.vehiclesRepo.update(tenantId, id, { photoUrl });
  }

  private deletePhotoFile(photoUrl: string): void {
    if (!photoUrl.startsWith(ALLOWED_PHOTO_PREFIX) || photoUrl.includes('..')) {
      this.logger.warn(
        `Refused to delete file with suspicious path: ${photoUrl}`,
      );
      return;
    }

    const oldFilePath = path.join(process.cwd(), photoUrl);
    void fs.promises.unlink(oldFilePath).catch((err: unknown) => {
      this.logger.warn(
        `Failed to delete old vehicle photo ${photoUrl}: ${String(err)}`,
      );
    });
  }
}
