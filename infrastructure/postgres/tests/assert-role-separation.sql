\set ON_ERROR_STOP on

DO $assert$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'trust_circle_migrator',
    'trust_circle_auth',
    'trust_circle_messaging'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_roles
       WHERE rolname = role_name
         AND rolcanlogin
         AND NOT rolsuper
         AND NOT rolcreatedb
         AND NOT rolcreaterole
         AND NOT rolreplication
         AND NOT rolbypassrls
    ) THEN
      RAISE EXCEPTION 'role % is missing or over-privileged', role_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.oid = c.relowner
     WHERE n.nspname IN ('public', 'trust_circle_sqitch')
       AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
       AND r.rolname <> 'trust_circle_migrator'
  ) THEN
    RAISE EXCEPTION 'a Trust Circle relation is not owned by the migrator';
  END IF;
END
$assert$;
