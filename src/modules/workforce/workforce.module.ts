import { Module } from '@nestjs/common';
import { EmployeeProfileController } from './employee-profile.controller';
import { EmployeeProfileService } from './employee-profile.service';
import { WorkforceRepository } from './workforce.repository';

@Module({
  controllers: [EmployeeProfileController],
  providers: [EmployeeProfileService, WorkforceRepository],
  exports: [WorkforceRepository],
})
export class WorkforceModule {}
