import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
  ForbiddenException,
  HttpCode,
} from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SuperAdminGuard } from '../../common/guards/superadmin.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Tenants')
@Controller('tenants')
@UseGuards(PermissionsGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @UseGuards(SuperAdminGuard)
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  @Permissions('tenants.read')
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (!user.isSuperAdmin && user.tenantId !== id) {
      throw new ForbiddenException('Cannot access another tenant');
    }
    return this.tenantsService.findById(id);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(SuperAdminGuard)
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Patch(':id')
  @Permissions('tenants.update')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    if (!user.isSuperAdmin && user.tenantId !== id) {
      throw new ForbiddenException('Cannot modify another tenant');
    }
    return this.tenantsService.update(id, dto);
  }
}
