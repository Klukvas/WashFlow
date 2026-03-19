import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { MergeClientDto } from './dto/merge-client.dto';
import { ClientQueryDto } from './dto/client-query.dto';

@Controller('clients')
@UseGuards(PermissionsGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post('merge')
  @Permissions('clients.update')
  merge(
    @CurrentTenant() tenantId: string,
    @Body() dto: MergeClientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clientsService.merge(tenantId, dto, user.sub);
  }

  @Get()
  @Permissions('clients.read')
  findAll(@CurrentTenant() tenantId: string, @Query() query: ClientQueryDto) {
    return this.clientsService.findAll(tenantId, query);
  }

  @Get(':id')
  @Permissions('clients.read')
  findOne(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientsService.findById(tenantId, id);
  }

  @Post()
  @Permissions('clients.create')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateClientDto) {
    return this.clientsService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('clients.update')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Permissions('clients.delete')
  remove(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clientsService.softDelete(tenantId, id, user.sub);
  }

  @Patch(':id/restore')
  @Permissions('clients.update')
  restore(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientsService.restore(tenantId, id);
  }
}
