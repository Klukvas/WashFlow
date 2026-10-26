import { z } from 'zod';
import type { Branch } from '@/shared/types/models';

export type Fact =
  | { state: 'loading' }
  | { state: 'complete' }
  | { state: 'incomplete' }
  | { state: 'unavailable' }
  | { state: 'error'; retry: () => void };

export const uuid = z.uuid();
export const branchSchema = z.object({
  id: uuid,
  tenantId: uuid,
  name: z.string().min(1),
  timezone: z.string(),
  isActive: z.boolean(),
  deletedAt: z.string().nullable(),
});
export function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return !!value;
  } catch {
    return false;
  }
}
export function eligibleBranch(branch: Branch): boolean {
  return (
    branchSchema.safeParse(branch).success &&
    branch.isActive &&
    branch.deletedAt === null
  );
}
const flags = {
  isActive: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
};
const postSchema = z.object({
  id: uuid,
  tenantId: uuid,
  branchId: uuid,
  ...flags,
});
const price = z.union([
  z.number().finite(),
  z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .refine((v) => Number.isFinite(Number(v))),
]);
const serviceSchema = z.object({
  id: uuid,
  tenantId: uuid,
  durationMin: z.number().finite(),
  price,
  ...flags,
});
export function postFact(value: unknown, branch: Branch): Fact {
  const result = z.array(postSchema).safeParse(value);
  if (!result.success) return { state: 'error', retry: () => undefined };
  const posts = result.data;
  const scoped = posts.filter(
    (p) => p.branchId === branch.id && p.tenantId === branch.tenantId,
  );
  if (posts.length !== scoped.length) return { state: 'unavailable' };
  if (scoped.some((p) => p.isActive === true && p.deletedAt === null))
    return { state: 'complete' };
  if (
    posts.length !== scoped.length ||
    scoped.some((p) => p.isActive === undefined || p.deletedAt === undefined)
  )
    return { state: 'unavailable' };
  return { state: 'incomplete' };
}
export function serviceFact(value: unknown, branch: Branch): Fact {
  const result = z.array(serviceSchema).safeParse(value);
  if (!result.success) return { state: 'error', retry: () => undefined };
  const services = result.data;
  if (services.some((s) => s.tenantId !== branch.tenantId))
    return { state: 'unavailable' };
  if (
    services.some(
      (s) =>
        s.tenantId === branch.tenantId &&
        s.isActive === true &&
        s.deletedAt === null &&
        s.durationMin > 0 &&
        Number(s.price) >= 0,
    )
  )
    return { state: 'complete' };
  if (
    services.some(
      (s) =>
        s.tenantId !== branch.tenantId ||
        s.isActive === undefined ||
        s.deletedAt === undefined,
    )
  )
    return { state: 'unavailable' };
  return { state: 'incomplete' };
}
export const FIRST_ORDER_PERMISSIONS = [
  'branches.read',
  'services.read',
  'clients.read',
  'vehicles.read',
  'scheduling.read',
  'orders.create',
  'orders.read',
];

export function queryFact(
  query: {
    isFetching: boolean;
    isPending: boolean;
    isError: boolean;
    refetch: () => unknown;
  },
  fact: Fact,
): Fact {
  if (query.isFetching || query.isPending) return { state: 'loading' };
  if (query.isError)
    return {
      state: 'error',
      retry: () => {
        void query.refetch();
      },
    };
  return fact.state === 'error'
    ? {
        state: 'error',
        retry: () => {
          void query.refetch();
        },
      }
    : fact;
}
