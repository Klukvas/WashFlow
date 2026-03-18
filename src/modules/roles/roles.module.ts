import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { RolesRepository } from './roles.repository';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PermissionsModule],
  controllers: [RolesController],
  providers: [RolesService, RolesRepository],
  exports: [RolesService],
})
export class RolesModule {}
