-- Revert trust-circle:runtime_database_privileges from pg

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'trust_circle_migration_test'
     AND current_setting('trust_circle.allow_destructive_revert', true)
         IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'Persistent database revert blocked; set trust_circle.allow_destructive_revert=on after approval';
  END IF;
END
$guard$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM trust_circle_auth, trust_circle_messaging;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM trust_circle_auth, trust_circle_messaging;
REVOKE USAGE ON SCHEMA public
  FROM trust_circle_auth, trust_circle_messaging;

COMMIT;
