import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VehiclesRepository } from './vehicles.repository';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleQueryDto } from './dto/vehicle-query.dto';
import { paginatedResponse } from '../../common/utils/pagination.util';

@Injectable()
export class VehiclesService {
  constructor(private readonly vehiclesRepo: VehiclesRepository) {}

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
    return this.vehiclesRepo.create(tenantId, { ...dto });
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
}
