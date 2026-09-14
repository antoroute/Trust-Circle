-- Verify trust-circle:runtime_database_privileges on pg

BEGIN;

DO $verify$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['trust_circle_auth', 'trust_circle_messaging']
  LOOP
    IF NOT has_database_privilege(role_name, current_database(), 'CONNECT')
       OR has_database_privilege(role_name, current_database(), 'CREATE')
       OR has_database_privilege(role_name, current_database(), 'TEMP') THEN
      RAISE EXCEPTION 'invalid database privileges for %', role_name;
    END IF;
    IF NOT has_schema_privilege(role_name, 'public', 'USAGE')
       OR has_schema_privilege(role_name, 'public', 'CREATE')
       OR has_schema_privilege(role_name, 'trust_circle_sqitch', 'USAGE') THEN
      RAISE EXCEPTION 'invalid schema privileges for %', role_name;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('trust_circle_auth', 'users', 'SELECT')
     OR NOT has_table_privilege('trust_circle_auth', 'users', 'INSERT')
     OR NOT has_table_privilege('trust_circle_auth', 'refresh_tokens', 'SELECT')
     OR NOT has_table_privilege('trust_circle_auth', 'refresh_tokens', 'INSERT')
     OR NOT has_table_privilege('trust_circle_auth', 'refresh_tokens', 'DELETE')
     OR NOT has_table_privilege('trust_circle_auth', 'device_bootstrap_grants', 'SELECT')
     OR NOT has_table_privilege('trust_circle_auth', 'device_bootstrap_grants', 'INSERT')
     OR NOT has_table_privilege('trust_circle_auth', 'device_bootstrap_grants', 'DELETE')
     OR has_table_privilege('trust_circle_auth', 'users', 'UPDATE')
     OR has_table_privilege('trust_circle_auth', 'users', 'DELETE')
     OR has_table_privilege('trust_circle_auth', 'groups', 'SELECT')
     OR NOT has_sequence_privilege('trust_circle_auth', 'refresh_tokens_id_seq', 'USAGE')
     OR NOT has_sequence_privilege('trust_circle_auth', 'refresh_tokens_id_seq', 'SELECT') THEN
    RAISE EXCEPTION 'invalid Auth table or sequence privileges';
  END IF;

  IF NOT has_table_privilege('trust_circle_messaging', 'messages', 'SELECT')
     OR NOT has_table_privilege('trust_circle_messaging', 'messages', 'INSERT')
     OR has_table_privilege('trust_circle_messaging', 'messages', 'UPDATE')
     OR has_table_privilege('trust_circle_messaging', 'messages', 'DELETE')
     OR has_table_privilege('trust_circle_messaging', 'refresh_tokens', 'SELECT')
     OR has_table_privilege('trust_circle_messaging', 'refresh_tokens', 'INSERT')
     OR has_table_privilege('trust_circle_messaging', 'refresh_tokens', 'UPDATE')
     OR has_table_privilege('trust_circle_messaging', 'refresh_tokens', 'DELETE')
     OR has_table_privilege('trust_circle_messaging', 'notifications', 'SELECT')
     OR has_table_privilege('trust_circle_messaging', 'join_request_votes', 'SELECT') THEN
    RAISE EXCEPTION 'invalid Messaging boundary privileges';
  END IF;

  IF NOT has_column_privilege('trust_circle_messaging', 'users', 'created_at', 'UPDATE')
     OR has_column_privilege('trust_circle_messaging', 'users', 'password', 'UPDATE')
     OR NOT has_column_privilege('trust_circle_messaging', 'groups', 'created_at', 'UPDATE')
     OR has_column_privilege('trust_circle_messaging', 'groups', 'name', 'UPDATE')
     OR NOT has_column_privilege('trust_circle_messaging', 'conversations', 'created_at', 'UPDATE')
     OR has_column_privilege('trust_circle_messaging', 'conversations', 'group_id', 'UPDATE')
     OR has_column_privilege('trust_circle_messaging', 'conversations', 'type', 'UPDATE') THEN
    RAISE EXCEPTION 'row-lock column grants are not minimal';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_roles
     WHERE rolname IN ('trust_circle_migrator', 'trust_circle_auth', 'trust_circle_messaging')
       AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'a Trust Circle non-admin role has administrative attributes';
  END IF;
END
$verify$;

ROLLBACK;
