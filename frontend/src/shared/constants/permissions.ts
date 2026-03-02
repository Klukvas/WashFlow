export const PERMISSIONS = {
  TENANTS: {
    CREATE: 'tenants.create',
    READ: 'tenants.read',
    UPDATE: 'tenants.update',
    DELETE: 'tenants.delete',
  },
  BRANCHES: {
    CREATE: 'branches.create',
    READ: 'branches.read',
    UPDATE: 'branches.update',
    DELETE: 'branches.delete',
  },
  USERS: {
    CREATE: 'users.create',
    READ: 'users.read',
    UPDATE: 'users.update',
    DELETE: 'users.delete',
  },
  ROLES: {
    CREATE: 'roles.create',
    READ: 'roles.read',
    UPDATE: 'roles.update',
    DELETE: 'roles.delete',
  },
  CLIENTS: {
    CREATE: 'clients.create',
    READ: 'clients.read',
    UPDATE: 'clients.update',
    DELETE: 'clients.delete',
  },
  VEHICLES: {
    CREATE: 'vehicles.create',
    READ: 'vehicles.read',
    UPDATE: 'vehicles.update',
    DELETE: 'vehicles.delete',
  },
  SERVICES: {
    CREATE: 'services.create',
    READ: 'services.read',
    UPDATE: 'services.update',
    DELETE: 'services.delete',
  },
  WORK_POSTS: {
    CREATE: 'work-posts.create',
    READ: 'work-posts.read',
    UPDATE: 'work-posts.update',
    DELETE: 'work-posts.delete',
  },
  ORDERS: {
    CREATE: 'orders.create',
    READ: 'orders.read',
    UPDATE: 'orders.update',
    DELETE: 'orders.delete',
  },
  SCHEDULING: {
    READ: 'scheduling.read',
  },
  PAYMENTS: {
    CREATE: 'payments.create',
    READ: 'payments.read',
    UPDATE: 'payments.update',
    DELETE: 'payments.delete',
  },
  ANALYTICS: {
    VIEW: 'analytics.view',
  },
  AUDIT: {
    READ: 'audit.read',
  },
  WORKFORCE: {
    CREATE: 'workforce.create',
    READ: 'workforce.read',
    UPDATE: 'workforce.update',
    DELETE: 'workforce.delete',
  },
} as const;
