import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditRepository } from './audit.repository';
import { AuditSubscriber } from './audit.subscriber';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditRepository, AuditSubscriber],
  exports: [AuditService, AuditRepository],
})
export class AuditModule {}
