import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IdempotencyRepository } from './idempotency.repository';

export interface IdempotencyCheckResult {
  hit: boolean;
  cachedResponse?: { statusCode: number; body: unknown };
}

export type RequestIdentity = {
  tenantId: string;
  key: string;
  method: string;
  path: string;
  kind: 'payment-v1' | 'order-v1';
  actorId: string | null;
  fingerprint: string;
};

type RequestClaim = { replay: false } | { replay: true; resourceId: string };

@Injectable()
export class IdempotencyService {
  private static readonly DEFAULT_TTL_HOURS = 24;

  constructor(private readonly repo: IdempotencyRepository) {}

  requestIdentity(
    params: Omit<RequestIdentity, 'fingerprint' | 'key'> & { key?: string },
    payload: Record<string, unknown>,
  ): RequestIdentity | undefined {
    if (params.key === undefined) return undefined;
    if (
      typeof params.key !== 'string' ||
      !params.key ||
      params.key.length > 128 ||
      !/^[\w\-:.]+$/.test(params.key)
    ) {
      throw new BadRequestException('Invalid idempotency-key header');
    }
    return {
      ...params,
      key: params.key,
      fingerprint: createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex'),
    };
  }

  async readRequestTx(
    tx: Prisma.TransactionClient,
    identity: RequestIdentity,
  ): Promise<RequestClaim | null> {
    const existing = await this.repo.findByKeyTx(
      tx,
      identity.tenantId,
      identity.key,
    );
    return existing && existing.expiresAt > new Date()
      ? this.replayRequest(existing, identity)
      : null;
  }

  async claimRequestTx(
    tx: Prisma.TransactionClient,
    identity: RequestIdentity,
  ): Promise<RequestClaim> {
    const now = new Date();
    const existing = await this.repo.findByKeyTx(
      tx,
      identity.tenantId,
      identity.key,
    );
    if (existing && existing.expiresAt > now) {
      return this.replayRequest(existing, identity);
    }
    const acquired = await this.repo.acquireRequestLock(tx, {
      ...identity,
      claimedAt: now,
      expiresAt: new Date(
        now.getTime() + IdempotencyService.DEFAULT_TTL_HOURS * 3600000,
      ),
      responseBody: this.requestEnvelope(identity),
    });
    if (acquired) return { replay: false };
    // ReadCommitted waiters see the winner after INSERT ON CONFLICT waited for
    // its commit. Serializable callers retry their whole reservation on conflict.
    const winner = await this.repo.findByKeyTx(
      tx,
      identity.tenantId,
      identity.key,
    );
    if (winner) return this.replayRequest(winner, identity);
    throw new ConflictException('Request is being processed');
  }

  async saveRequestTx(
    tx: Prisma.TransactionClient,
    identity: RequestIdentity,
    resourceId: string,
  ) {
    return this.repo.saveResult(tx, identity.tenantId, identity.key, 201, {
      ...this.requestEnvelope(identity),
      resourceId,
    });
  }

  private requestEnvelope(identity: RequestIdentity) {
    return {
      kind: identity.kind,
      actorId: identity.actorId,
      fingerprint: identity.fingerprint,
    };
  }

  private replayRequest(
    existing: {
      method: string;
      path: string;
      statusCode: number;
      responseBody: Prisma.JsonValue;
    },
    identity: RequestIdentity,
  ): RequestClaim {
    const body = existing.responseBody;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      existing.method !== identity.method ||
      existing.path !== identity.path ||
      body.kind !== identity.kind ||
      body.actorId !== identity.actorId ||
      body.fingerprint !== identity.fingerprint
    ) {
      throw new ConflictException(
        'Idempotency key belongs to a different request',
      );
    }
    if (existing.statusCode <= 0 || typeof body.resourceId !== 'string') {
      throw new ConflictException('Request is being processed');
    }
    return { replay: true, resourceId: body.resourceId };
  }

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
