import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionsService } from './permissions.service';

@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @Permissions('roles.read')
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get(':module')
  @Permissions('roles.read')
  findByModule(@Param('module') module: string) {
    return this.permissionsService.findByModule(module);
  }
}
