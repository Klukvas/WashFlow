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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { WorkPostsService } from './work-posts.service';
import { CreateWorkPostDto } from './dto/create-work-post.dto';
import { UpdateWorkPostDto } from './dto/update-work-post.dto';

@Controller('work-posts')
@UseGuards(PermissionsGuard)
export class WorkPostsController {
  constructor(private readonly workPostsService: WorkPostsService) {}

  @Get()
  @Permissions('work-posts.read')
  findByBranch(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() userBranchId: string | null,
    @Query('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.workPostsService.findByBranch(tenantId, branchId, userBranchId);
  }

  @Get(':id')
  @Permissions('work-posts.read')
  findOne(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() userBranchId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workPostsService.findById(tenantId, id, userBranchId);
  }

  @Post()
  @Permissions('work-posts.create')
  create(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() userBranchId: string | null,
    @Body() dto: CreateWorkPostDto,
  ) {
    return this.workPostsService.create(tenantId, dto, userBranchId);
  }

  @Patch(':id')
  @Permissions('work-posts.update')
  update(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() userBranchId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkPostDto,
  ) {
    return this.workPostsService.update(tenantId, id, dto, userBranchId);
  }

  @Delete(':id')
  @Permissions('work-posts.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() userBranchId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workPostsService.softDelete(tenantId, id, userBranchId);
  }

  @Patch(':id/restore')
  @Permissions('work-posts.update')
  restore(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() userBranchId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.workPostsService.restore(tenantId, id, userBranchId);
  }
}
