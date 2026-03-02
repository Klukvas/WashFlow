import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emitToTenant(tenantId: string, event: string, data: unknown) {
    this.gateway.emitToTenant(tenantId, event, data);
  }

  emitToBranch(branchId: string, event: string, data: unknown) {
    this.gateway.emitToBranch(branchId, event, data);
  }
}
