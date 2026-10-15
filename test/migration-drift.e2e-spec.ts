import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Never load .env, reuse DATABASE_URL, or accept application databases.
const databaseUrl = process.env.WASHFLOW_MIGRATION_TEST_DATABASE_URL;
const integration = databaseUrl === undefined ? describe.skip : describe;
const migrationRoot = resolve(__dirname, '../prisma/migrations');
const correction = '20261015000000_reconcile_schema_drift';
const migrations = readdirSync(migrationRoot)
  .filter((name) => /^\d{14}_/.test(name))
  .sort();
const sql = (name: string) =>
  readFileSync(resolve(migrationRoot, name, 'migration.sql'), 'utf8');
type Driver = Awaited<ReturnType<PrismaPg['connect']>>;
// Resolve pg's promise overload at the call site; ReturnType on connect alone
// selects its final callback overload (void).
const acquireConnection = async (driver: Driver) =>
  driver.underlyingDriver().connect();
type Connection = Awaited<ReturnType<typeof acquireConnection>>;

integration('forward migration — isolated PostgreSQL', () => {
  jest.setTimeout(30000);
  let driver: Driver;
  let connection: Connection;
  let schema: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const url = new URL(databaseUrl ?? '');
    if (
      url.protocol !== 'postgresql:' ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '15433' ||
      !/^\/washflow_repair_migration_[a-z0-9_]+$/.test(url.pathname) ||
      url.search !== '' ||
      url.hash !== ''
    )
      throw new Error(
        'Migration tests require an isolated washflow_repair_migration_* DB on 127.0.0.1:15433',
      );
    driver = await new PrismaPg({ connectionString: databaseUrl }).connect();
    connection = await acquireConnection(driver);
  });
  beforeEach(async () => {
    schema = `migration_${randomUUID().replaceAll('-', '')}`;
    await connection.query(`CREATE SCHEMA "${schema}"`);
    await connection.query(`SET search_path TO "${schema}"`);
    for (const name of migrations.filter((name) => name < correction)) {
      await connection.query(sql(name));
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }),
    });
  });
  afterEach(async () => {
    if (!connection || !schema) return;
    await connection.query('ROLLBACK');
    await prisma.$disconnect();
    await connection.query(`DROP SCHEMA "${schema}" CASCADE`);
  });
  afterAll(async () => {
    connection?.release();
    await driver?.dispose();
  });

  async function applyCorrection() {
    for (const name of migrations.filter((name) => name >= correction)) {
      await connection.query(sql(name));
    }
  }

  it('makes ordinary Prisma reads and creates work after the complete migration chain', async () => {
    await expect(prisma.branch.findMany()).rejects.toMatchObject({
      code: 'P2022',
    });
    await expect(prisma.vehicle.findMany()).rejects.toMatchObject({
      code: 'P2022',
    });
    await applyCorrection();
    await expect(prisma.branch.findMany()).resolves.toEqual([]);
    await expect(prisma.vehicle.findMany()).resolves.toEqual([]);
    const tenant = await prisma.tenant.create({
      data: { name: 'Migration', slug: schema },
    });
    const branch = await prisma.branch.create({
      data: { tenantId: tenant.id, name: 'Default timezone' },
    });
    expect(branch.timezone).toBe('Europe/Kyiv');
    const subscription = await prisma.subscription.create({
      data: { tenantId: tenant.id },
    });
    expect([
      subscription.maxUsers,
      subscription.maxBranches,
      subscription.maxWorkPosts,
      subscription.maxServices,
    ]).toEqual([null, null, null, null]);
  });
  // All twenty tables participate: FK relationships, tenant IDs, decimals, enums,
  // nullable values and already-TIMESTAMPTZ fields must survive unchanged.
  async function fixture() {
    await connection.query(`
      INSERT INTO tenants (id, name, slug, "updatedAt") VALUES ('tenant', 'Upgrade', 'upgrade', now());
      INSERT INTO branches (id, "tenantId", name, "updatedAt") VALUES ('branch', 'tenant', 'Branch', now());
      INSERT INTO roles (id, "tenantId", name, "updatedAt") VALUES ('role', 'tenant', 'Operator', now());
      INSERT INTO users (id, "tenantId", "branchId", "roleId", email, "passwordHash", "firstName", "lastName", "updatedAt")
        VALUES ('user', 'tenant', 'branch', 'role', 'upgrade@example.invalid', 'synthetic-not-a-hash', 'First', 'Last', now());
      INSERT INTO clients (id, "tenantId", "firstName", "updatedAt") VALUES ('client', 'tenant', 'Client', now());
      INSERT INTO vehicles (id, "tenantId", "clientId", make, photo_url, "updatedAt")
        VALUES ('vehicle', 'tenant', 'client', 'Fixture', '/uploads/vehicles/preserve-photo.webp', now());
      INSERT INTO services (id, "tenantId", name, "durationMin", price, "updatedAt")
        VALUES ('service', 'tenant', 'Wash', 30, 123.45, now());
      INSERT INTO work_posts (id, "tenantId", "branchId", name, "updatedAt") VALUES ('post', 'tenant', 'branch', 'Post', now());
      INSERT INTO employee_profiles (id, "tenantId", "userId", "branchId", "updatedAt") VALUES ('employee', 'tenant', 'user', 'branch', now());
      INSERT INTO orders (id, "tenantId", "branchId", "clientId", "vehicleId", "workPostId", "assignedEmployeeId", "createdById", "scheduledStart", "scheduledEnd", "totalPrice", status, source, "updatedAt")
        VALUES ('order', 'tenant', 'branch', 'client', 'vehicle', 'post', 'employee', 'user', now(), now(), 123.45, 'COMPLETED', 'WEB', now());
      INSERT INTO order_services (id, "tenantId", "orderId", "serviceId", price) VALUES ('line', 'tenant', 'order', 'service', 123.45);
      INSERT INTO payments (id, "tenantId", "orderId", amount, method, status, "updatedAt") VALUES ('payment', 'tenant', 'order', 12.34, 'CASH', 'PAID', now());
      INSERT INTO audit_logs (id, "tenantId", "entityType", "entityId", action, "performedById", metadata)
        VALUES ('audit', 'tenant', 'Order', 'order', 'CREATE', 'user', '{"preserve":true}');
      INSERT INTO idempotency_keys (id, "tenantId", key, method, path, "expiresAt", "responseBody")
        VALUES ('idempotency', 'tenant', 'fixture-key', 'POST', '/synthetic', now(), '{"ok":true}');
      INSERT INTO booking_settings (id, "tenantId", "branchId") VALUES ('settings', 'tenant', 'branch');
      INSERT INTO role_permissions (id, "roleId", "permissionId") SELECT 'grant', 'role', id FROM permissions LIMIT 1;
      INSERT INTO subscriptions (id, "tenantId", "maxUsers", "maxBranches", "maxWorkPosts", "maxServices", "isTrial", "updatedAt")
        VALUES ('subscription', 'tenant', 17, 9, 23, NULL, true, now());
      INSERT INTO subscription_addons (id, "subscriptionId", resource, quantity, "updatedAt") VALUES ('addon', 'subscription', 'users', 2, now());
      INSERT INTO password_reset_tokens (id, "userId", token, "expiresAt") VALUES ('reset', 'user', 'synthetic-reset-token', now());
    `);
    const columns = await timestampColumns();
    expect(
      columns.filter(
        (column) => column.data_type === 'timestamp without time zone',
      ),
    ).toHaveLength(35);
    for (const column of columns) {
      const date =
        column.data_type === 'timestamp without time zone'
          ? column.ordinal_position % 2 === 0
            ? "TIMESTAMP '2026-03-29 00:59:59.123'"
            : "TIMESTAMP '2026-10-25 01:30:00.987'"
          : "TIMESTAMPTZ '2026-10-25 03:30:00.123456+02'";
      await connection.query(
        `UPDATE "${column.table_name}" SET "${column.column_name}" = ${date}`,
      );
    }
    // An installation may already have corrected one legacy column independently.
    await connection.query(
      `ALTER TABLE tenants ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE 'UTC'`,
    );
  }

  function timestampColumns() {
    return connection
      .query<{
        table_name: string;
        column_name: string;
        data_type: string;
        ordinal_position: number;
      }>(
        `SELECT table_name, column_name, data_type, ordinal_position FROM information_schema.columns
      WHERE table_schema = current_schema() AND data_type LIKE 'timestamp%' ORDER BY table_name, ordinal_position`,
      )
      .then((result) => result.rows);
  }

  async function normalizedRows() {
    const { rows: tables } = await connection.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name`,
    );
    return Promise.all(
      tables.map(async ({ table_name: table }) => {
        const { rows: columns } = await connection.query<{
          column_name: string;
          data_type: string;
        }>(
          `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
          [table],
        );
        const expressions = columns
          .filter((column) => column.column_name !== 'timezone')
          .map((column) => {
            const name = column.column_name;
            const value =
              column.data_type === 'timestamp without time zone'
                ? `extract(epoch FROM "${name}" AT TIME ZONE 'UTC')`
                : column.data_type === 'timestamp with time zone'
                  ? `extract(epoch FROM "${name}")`
                  : `"${name}"`;
            return `'${name === 'photo_url' ? 'photoUrl' : name}', ${value}`;
          });
        const { rows } = await connection.query<{ data: unknown }>(
          `SELECT jsonb_build_object(${expressions.join(', ')}) AS data FROM "${table}" ORDER BY id`,
        );
        return { table, rows };
      }),
    );
  }

  it.each(['America/Los_Angeles', 'Asia/Tokyo'])(
    'preserves the entire graph and UTC instants in a %s session',
    async (timezone) => {
      await fixture();
      if (timezone === 'Asia/Tokyo') {
        await connection.query(
          `UPDATE branches SET "deletedAt" = NULL; UPDATE users SET "deletedAt" = NULL; UPDATE employee_profiles SET "deletedAt" = NULL`,
        );
        await connection.query(
          `ALTER TABLE branches ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/Kyiv'; UPDATE branches SET timezone = 'America/New_York'`,
        );
      }
      const before = await normalizedRows();
      await connection.query(`SELECT set_config('TimeZone', $1, false)`, [
        timezone,
      ]);
      await applyCorrection();
      expect(await normalizedRows()).toEqual(before);
      expect(await timestampColumns()).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ data_type: 'timestamp without time zone' }),
        ]),
      );
      const vehicle = await prisma.vehicle.findUniqueOrThrow({
        where: { id: 'vehicle' },
      });
      expect(vehicle.photoUrl).toBe('/uploads/vehicles/preserve-photo.webp');
      const branch = await prisma.branch.findUniqueOrThrow({
        where: { id: 'branch' },
      });
      expect(branch.timezone).toBe(
        timezone === 'Asia/Tokyo' ? 'America/New_York' : 'Europe/Kyiv',
      );
      const indexes = await connection.query<{
        indexname: string;
        indexdef: string;
      }>(
        `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema()`,
      );
      expect(indexes.rows.map((index) => index.indexname)).toEqual(
        expect.arrayContaining([
          'order_services_tenantId_idx',
          'order_services_orderId_idx',
          'order_services_serviceId_idx',
          'orders_tenantId_clientId_idx',
          'orders_tenantId_vehicleId_idx',
          'orders_tenantId_assignedEmployeeId_idx',
          'role_permissions_permissionId_idx',
          'users_tenantId_roleId_idx',
          'subscriptions_trialEndsAt_idx',
        ]),
      );
      expect(
        indexes.rows.find(
          (index) => index.indexname === 'subscriptions_trialEndsAt_idx',
        )?.indexdef,
      ).toContain('WHERE (("isTrial" = true) AND ("trialEndsAt" IS NOT NULL))');
    },
  );

  it('accepts the existing photoUrl/timestamptz shape without changing instants', async () => {
    await fixture();
    await applyCorrection();
    const before = await normalizedRows();
    await connection.query(`SET TIME ZONE 'Pacific/Auckland'`);
    await applyCorrection();
    expect(await normalizedRows()).toEqual(before);
  });

  it('aborts atomically when both photo columns exist', async () => {
    await fixture();
    await connection.query(
      `ALTER TABLE vehicles ADD COLUMN "photoUrl" TEXT; UPDATE vehicles SET "photoUrl" = '/uploads/vehicles/other.webp'`,
    );
    const before = await normalizedRows();
    await expect(applyCorrection()).rejects.toThrow(
      'both photo_url and photoUrl',
    );
    await connection.query('ROLLBACK');
    expect(await normalizedRows()).toEqual(before);
    const timezone = await connection.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'branches' AND column_name = 'timezone'`,
    );
    expect(timezone.rows).toHaveLength(0);
    expect(
      (await timestampColumns()).filter(
        (column) => column.data_type === 'timestamp without time zone',
      ),
    ).toHaveLength(34);
  });
});
