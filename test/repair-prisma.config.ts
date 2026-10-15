import { defineConfig, env } from 'prisma/config';

// Deliberately never load .env or fall back to the application's DATABASE_URL.
const databaseUrl = env('WASHFLOW_REPAIR_TEST_DATABASE_URL');
const url = new URL(databaseUrl);
if (
  url.protocol !== 'postgresql:' ||
  url.hostname !== '127.0.0.1' ||
  url.port !== '15433' ||
  !/^\/washflow_repair_[a-z0-9_]+$/.test(url.pathname) ||
  url.search !== '' ||
  url.hash !== ''
) {
  throw new Error(
    'Repair migrations require an isolated washflow_repair_* DB on 127.0.0.1:15433',
  );
}

export default defineConfig({
  schema: '../prisma/schema.prisma',
  migrations: { path: '../prisma/migrations' },
  datasource: { url: databaseUrl },
});
