import { Injectable } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditQueryDto } from './dto/audit-query.dto';
import { paginatedResponse } from '../../common/utils/pagination.util';

@Injectable()
export class AuditService {
  constructor(private readonly auditRepo: AuditRepository) {}

  async findAll(
    tenantId: string,
    query: AuditQueryDto,
    branchId: string | null = null,
  ) {
    const { items, total } = await this.auditRepo.findAll(
      tenantId,
      query,
      branchId,
    );
    return paginatedResponse(items, total, query);
  }
}
