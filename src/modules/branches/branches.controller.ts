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
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateBookingSettingsDto } from './dto/booking-settings.dto';
import { PaginationDto } from '../../common/utils/pagination.dto';

@Controller('branches')
@UseGuards(PermissionsGuard)
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  @Permissions('branches.read')
  findAll(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Query() query: PaginationDto,
  ) {
    return this.branchesService.findAll(tenantId, query, branchId);
  }

  @Get(':id')
  @Permissions('branches.read')
  findOne(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.branchesService.findById(tenantId, id, branchId);
  }

  @Post()
  @Permissions('branches.create')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateBranchDto) {
    return this.branchesService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('branches.update')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Permissions('branches.delete')
  remove(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.branchesService.softDelete(tenantId, id);
  }

  @Patch(':id/restore')
  @Permissions('branches.update')
  restore(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.branchesService.restore(tenantId, id);
  }

  @Get(':id/booking-settings')
  @Permissions('branches.read')
  getBookingSettings(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.branchesService.getBookingSettings(tenantId, id);
  }

  @Patch(':id/booking-settings')
  @Permissions('branches.update')
  updateBookingSettings(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingSettingsDto,
  ) {
    return this.branchesService.updateBookingSettings(tenantId, id, dto);
  }
}
