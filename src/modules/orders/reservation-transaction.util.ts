import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_RESERVATION_ATTEMPTS = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isReservationConflict(error: unknown): boolean {
  // COMMIT errors escape Prisma's query wrappers as the installed pg adapter's
  // DriverAdapterError. Recognize only its exact observed serialization/deadlock
  // cause shapes; other adapter failures must keep their original error.
  if (
    isRecord(error) &&
    error.name === 'DriverAdapterError' &&
    isRecord(error.cause)
  ) {
    const cause = error.cause;
    return (
      (cause.kind === 'TransactionWriteConflict' &&
        cause.originalCode === '40001') ||
      (cause.kind === 'postgres' &&
        cause.code === '40P01' &&
        cause.originalCode === '40P01')
    );
  }
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010') return false;

  // Prisma's pg adapter wraps raw-query failures as P2010, including SQLSTATE
  // 40001/40P01. Other P2010 failures (SQL, permissions, constraints) must escape.
  const adapterError = error.meta?.driverAdapterError;
  const cause = isRecord(adapterError) ? adapterError.cause : undefined;
  if (!isRecord(cause)) return false;
  return (
    cause.kind === 'TransactionWriteConflict' ||
    cause.originalCode === '40001' ||
    cause.originalCode === '40P01'
  );
}

/** Retry the entire resource reservation; emit side effects only after this returns. */
export async function runReservationTransaction<T>(
  prisma: PrismaService,
  reserve: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(reserve, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      });
    } catch (error) {
      if (!isReservationConflict(error)) {
        throw error;
      }
      if (attempt >= MAX_RESERVATION_ATTEMPTS) {
        throw new ConflictException(
          'The requested resources are being reserved. Please try again.',
        );
      }
    }
  }
}
