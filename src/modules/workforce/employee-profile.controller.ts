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
import { EmployeeProfileService } from './employee-profile.service';
import { CreateEmployeeProfileDto } from './dto/create-employee-profile.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { EmployeeProfileQueryDto } from './dto/employee-profile-query.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Workforce')
@Controller('workforce/profiles')
@UseGuards(PermissionsGuard)
export class EmployeeProfileController {
  constructor(private readonly profileService: EmployeeProfileService) {}

  @Get()
  @Permissions('workforce.read')
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: EmployeeProfileQueryDto,
  ) {
    return this.profileService.findAll(tenantId, query);
  }

  @Get(':id')
  @Permissions('workforce.read')
  findOne(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.profileService.findById(tenantId, id);
  }

  @Post()
  @Permissions('workforce.create')
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateEmployeeProfileDto,
  ) {
    return this.profileService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('workforce.update')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeProfileDto,
  ) {
    return this.profileService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Permissions('workforce.delete')
  deactivate(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.profileService.delete(tenantId, id);
  }
}
