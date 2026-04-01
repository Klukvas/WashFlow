-- Seed permissions (required for the app to work — admin roles reference these)
INSERT INTO permissions (id, module, action, description)
VALUES
  (gen_random_uuid(), 'tenants',    'create', 'Create tenants'),
  (gen_random_uuid(), 'tenants',    'read',   'View tenants'),
  (gen_random_uuid(), 'tenants',    'update', 'Update tenants'),
  (gen_random_uuid(), 'tenants',    'delete', 'Delete tenants'),
  (gen_random_uuid(), 'branches',   'create', 'Create branches'),
  (gen_random_uuid(), 'branches',   'read',   'View branches'),
  (gen_random_uuid(), 'branches',   'update', 'Update branches'),
  (gen_random_uuid(), 'branches',   'delete', 'Delete branches'),
  (gen_random_uuid(), 'users',      'create', 'Create users'),
  (gen_random_uuid(), 'users',      'read',   'View users'),
  (gen_random_uuid(), 'users',      'update', 'Update users'),
  (gen_random_uuid(), 'users',      'delete', 'Delete users'),
  (gen_random_uuid(), 'roles',      'create', 'Create roles'),
  (gen_random_uuid(), 'roles',      'read',   'View roles'),
  (gen_random_uuid(), 'roles',      'update', 'Update roles'),
  (gen_random_uuid(), 'roles',      'delete', 'Delete roles'),
  (gen_random_uuid(), 'clients',    'create', 'Create clients'),
  (gen_random_uuid(), 'clients',    'read',   'View clients'),
  (gen_random_uuid(), 'clients',    'update', 'Update clients'),
  (gen_random_uuid(), 'clients',    'delete', 'Delete clients'),
  (gen_random_uuid(), 'vehicles',   'create', 'Create vehicles'),
  (gen_random_uuid(), 'vehicles',   'read',   'View vehicles'),
  (gen_random_uuid(), 'vehicles',   'update', 'Update vehicles'),
  (gen_random_uuid(), 'vehicles',   'delete', 'Delete vehicles'),
  (gen_random_uuid(), 'services',   'create', 'Create services'),
  (gen_random_uuid(), 'services',   'read',   'View services'),
  (gen_random_uuid(), 'services',   'update', 'Update services'),
  (gen_random_uuid(), 'services',   'delete', 'Delete services'),
  (gen_random_uuid(), 'work-posts', 'create', 'Create work posts'),
  (gen_random_uuid(), 'work-posts', 'read',   'View work posts'),
  (gen_random_uuid(), 'work-posts', 'update', 'Update work posts'),
  (gen_random_uuid(), 'work-posts', 'delete', 'Delete work posts'),
  (gen_random_uuid(), 'orders',     'create', 'Create orders'),
  (gen_random_uuid(), 'orders',     'read',   'View orders'),
  (gen_random_uuid(), 'orders',     'update', 'Update orders'),
  (gen_random_uuid(), 'orders',     'delete', 'Delete orders'),
  (gen_random_uuid(), 'scheduling', 'read',   'View scheduling and availability'),
  (gen_random_uuid(), 'payments',   'create', 'Create payments'),
  (gen_random_uuid(), 'payments',   'read',   'View payments'),
  (gen_random_uuid(), 'payments',   'update', 'Update payments'),
  (gen_random_uuid(), 'payments',   'delete', 'Delete payments'),
  (gen_random_uuid(), 'analytics',  'view',   'View analytics'),
  (gen_random_uuid(), 'audit',      'read',   'View audit logs'),
  (gen_random_uuid(), 'workforce',  'create', 'Create employee profiles and shifts'),
  (gen_random_uuid(), 'workforce',  'read',   'View employee profiles and shifts'),
  (gen_random_uuid(), 'workforce',  'update', 'Update employee profiles and shifts'),
  (gen_random_uuid(), 'workforce',  'delete', 'Delete employee profiles and shifts')
ON CONFLICT (module, action) DO NOTHING;

-- Fix existing admin roles that have no permissions
-- (created when permissions table was empty)
INSERT INTO role_permissions (id, "roleId", "permissionId")
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Admin'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp."roleId" = r.id AND rp."permissionId" = p.id
  );
