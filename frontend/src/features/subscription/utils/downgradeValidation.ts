import { ROUTES } from '@/shared/constants/routes';

export type ResourceKey = 'branches' | 'workPosts' | 'users' | 'services';

export interface Violation {
  resource: ResourceKey;
  current: number;
  limit: number;
  managePath: string;
}

export interface LostAddon {
  resource: string;
  name: string;
  quantity: number;
}

const RESOURCE_ROUTE: Record<ResourceKey, string> = {
  users: ROUTES.USERS,
  branches: ROUTES.BRANCHES,
  workPosts: ROUTES.WORK_POSTS,
  services: ROUTES.SERVICES,
};

export function buildViolations(
  usage: Record<ResourceKey, { current: number; max: number | null }>,
  targetLimits: Record<ResourceKey, number | null>,
): Violation[] {
  const resources: ResourceKey[] = [
    'branches',
    'workPosts',
    'users',
    'services',
  ];

  return resources.reduce<Violation[]>((acc, resource) => {
    const limit = targetLimits[resource];
    const current = usage[resource].current;

    if (limit !== null && current > limit) {
      return [
        ...acc,
        { resource, current, limit, managePath: RESOURCE_ROUTE[resource] },
      ];
    }
    return acc;
  }, []);
}
