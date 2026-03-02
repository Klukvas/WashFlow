import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByKey(tenantId: string, key: string) {
    return this.prisma.idempotencyKey.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
  }

  async findByKeyTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    key: string,
  ) {
    return tx.idempotencyKey.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
  }

  /**
   * Attempt to acquire a lock on an idempotency key using INSERT ... ON CONFLICT DO NOTHING.
   * Returns true if the lock was acquired (row inserted), false if the key already exists.
   */
  async acquireLock(
    tx: Prisma.TransactionClient,
    data: {
      key: string;
      tenantId: string;
      method: string;
      path: string;
      expiresAt: Date;
    },
  ): Promise<boolean> {
    const result = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO idempotency_keys (id, key, "tenantId", method, path, "statusCode", "responseBody", "createdAt", "expiresAt")
      VALUES (gen_random_uuid(), ${data.key}, ${data.tenantId}, ${data.method}, ${data.path}, 0, '{}', NOW(), ${data.expiresAt})
      ON CONFLICT ("tenantId", key) DO NOTHING
      RETURNING id
    `;
    return result.length > 0;
  }

  async saveResult(
    tx: Prisma.TransactionClient,
    tenantId: string,
    key: string,
    statusCode: number,
    responseBody: unknown,
  ) {
    return tx.idempotencyKey.update({
      where: { tenantId_key: { tenantId, key } },
      data: { statusCode, responseBody: responseBody as any },
    });
  }

  async upsertResult(
    tenantId: string,
    key: string,
    data: {
      method: string;
      path: string;
      statusCode: number;
      responseBody: unknown;
      expiresAt: Date;
    },
  ) {
    return this.prisma.idempotencyKey.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: {
        key,
        tenantId,
        method: data.method,
        path: data.path,
        statusCode: data.statusCode,
        responseBody: data.responseBody as any,
        expiresAt: data.expiresAt,
      },
      update: {},
    });
  }

  async deleteExpired() {
    return this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}
