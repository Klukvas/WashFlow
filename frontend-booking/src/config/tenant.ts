const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tenantId = import.meta.env.VITE_TENANT_ID as string | undefined;

if (!tenantId || !UUID_REGEX.test(tenantId)) {
  throw new Error(
    'VITE_TENANT_ID is missing or not a valid UUID. Set it in your .env file.',
  );
}

export const TENANT_ID: string = tenantId;
