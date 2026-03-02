import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleQueryDto } from './dto/vehicle-query.dto';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  @Permissions('vehicles.read')
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: VehicleQueryDto,
  ) {
    return this.vehiclesService.findAll(tenantId, query);
  }

  @Get(':id')
  @Permissions('vehicles.read')
  findOne(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.findById(tenantId, id);
  }

  @Post()
  @Permissions('vehicles.create')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('vehicles.update')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Permissions('vehicles.delete')
  remove(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.softDelete(tenantId, id);
  }

  @Patch(':id/restore')
  @Permissions('vehicles.update')
  restore(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.restore(tenantId, id);
  }
}
