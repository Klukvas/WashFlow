import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IdempotencyRepository } from './idempotency.repository';

export interface IdempotencyCheckResult {
  hit: boolean;
  cachedResponse?: { statusCode: number; body: unknown };
}

@Injectable()
export class IdempotencyService {
  private static readonly DEFAULT_TTL_HOURS = 24;

  constructor(private readonly repo: IdempotencyRepository) {}

  async check(tenantId: string, key: string): Promise<IdempotencyCheckResult> {
    const existing = await this.repo.findByKey(tenantId, key);
    if (
      existing &&
      existing.expiresAt > new Date() &&
      existing.statusCode > 0
    ) {
      return {
        hit: true,
        cachedResponse: {
          statusCode: existing.statusCode,
          body: existing.responseBody,
        },
      };
    }
    return { hit: false };
  }

  async checkTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    key: string,
  ): Promise<IdempotencyCheckResult> {
    const existing = await this.repo.findByKeyTx(tx, tenantId, key);
    if (
      existing &&
      existing.expiresAt > new Date() &&
      existing.statusCode > 0
    ) {
      return {
        hit: true,
        cachedResponse: {
          statusCode: existing.statusCode,
          body: existing.responseBody,
        },
      };
    }
    return { hit: false };
  }

  async acquireLockTx(
    tx: Prisma.TransactionClient,
    params: { tenantId: string; key: string; method: string; path: string },
  ): Promise<boolean> {
    const expiresAt = new Date(
      Date.now() + IdempotencyService.DEFAULT_TTL_HOURS * 3600000,
    );
    return this.repo.acquireLock(tx, { ...params, expiresAt });
  }

  async saveResultTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    key: string,
    statusCode: number,
    body: unknown,
  ) {
    return this.repo.saveResult(tx, tenantId, key, statusCode, body);
  }

  async save(
    tenantId: string,
    key: string,
    params: {
      method: string;
      path: string;
      statusCode: number;
      body: unknown;
    },
  ) {
    const expiresAt = new Date(
      Date.now() + IdempotencyService.DEFAULT_TTL_HOURS * 3600000,
    );
    return this.repo.upsertResult(tenantId, key, {
      method: params.method,
      path: params.path,
      statusCode: params.statusCode,
      responseBody: params.body,
      expiresAt,
    });
  }

  async cleanExpired() {
    return this.repo.deleteExpired();
  }
}
