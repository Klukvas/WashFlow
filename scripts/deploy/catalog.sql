SET search_path = public, pg_catalog;
BEGIN READ ONLY;
SELECT json_build_object(
  'tables', (SELECT coalesce(json_agg(x ORDER BY x.name), '[]') FROM (
    SELECT c.relname AS name, c.relkind AS kind, c.relpersistence AS persistence,
      c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
      c.reloptions AS options
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
      AND c.relname <> '_prisma_migrations'
  ) x),
  'columns', (SELECT coalesce(json_agg(x ORDER BY x.table_name,x.name), '[]') FROM (
    SELECT c.relname AS table_name, a.attname AS name,
      format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS required,
      pg_get_expr(d.adbin,d.adrelid) AS default_value,
      a.attidentity AS identity, a.attgenerated AS generated
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relname <> '_prisma_migrations'
      AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
  ) x),
  'constraints', (SELECT coalesce(json_agg(x ORDER BY x.table_name,x.name), '[]') FROM (
    SELECT c.relname AS table_name, k.conname AS name,
      pg_get_constraintdef(k.oid) AS definition, k.convalidated AS validated
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname <> '_prisma_migrations'
  ) x),
  'indexes', (SELECT coalesce(json_agg(x ORDER BY x.name), '[]') FROM (
    SELECT c.relname AS name, pg_get_indexdef(c.oid) AS definition,
      i.indisvalid AS valid, i.indisready AS ready
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname <> '_prisma_migrations'
  ) x),
  'enums', (SELECT coalesce(json_agg(x ORDER BY x.name,x.position), '[]') FROM (
    SELECT t.typname AS name,e.enumsortorder AS position,e.enumlabel AS value
    FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
  ) x),
  'triggers', (SELECT coalesce(json_agg(x ORDER BY x.table_name,x.name), '[]') FROM (
    SELECT c.relname AS table_name,t.tgname AS name,pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal
  ) x),
  'routines', (SELECT coalesce(json_agg(x ORDER BY x.name,x.arguments), '[]') FROM (
    SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,
      p.prokind AS kind, p.prosrc AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  ) x)
);
COMMIT;
