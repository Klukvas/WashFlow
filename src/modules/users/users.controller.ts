import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PaginationDto } from '../../common/utils/pagination.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Users')
@Controller('users')
@UseGuards(PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('users.read')
  findAll(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Query() query: PaginationDto,
  ) {
    return this.usersService.findAll(tenantId, query, branchId);
  }

  @Get(':id')
  @Permissions('users.read')
  findOne(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.findById(tenantId, id, branchId);
  }

  @Post()
  @Permissions('users.create')
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateUserDto,
    @CurrentBranch() branchId: string | null = null,
  ) {
    return this.usersService.create(tenantId, dto, branchId);
  }

  @Patch(':id')
  @Permissions('users.update')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentBranch() branchId: string | null = null,
  ) {
    return this.usersService.update(tenantId, id, dto, branchId);
  }

  @Patch(':id/reset-password')
  @Permissions('users.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentBranch() branchId: string | null = null,
  ) {
    return this.usersService.resetPassword(tenantId, id, dto, branchId);
  }

  @Delete(':id')
  @Permissions('users.delete')
  remove(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @CurrentBranch() branchId: string | null = null,
  ) {
    return this.usersService.softDelete(tenantId, id, user.sub, branchId);
  }

  @Patch(':id/restore')
  @Permissions('users.update')
  restore(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentBranch() branchId: string | null = null,
  ) {
    return this.usersService.restore(tenantId, id, branchId);
  }
}
