-- Deploy trust-circle:runtime_database_privileges to pg

BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trust_circle_auth')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trust_circle_messaging') THEN
    RAISE EXCEPTION 'runtime roles must exist before deploying privileges';
  END IF;
END
$roles$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM trust_circle_auth, trust_circle_messaging;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM trust_circle_auth, trust_circle_messaging;

GRANT USAGE ON SCHEMA public
  TO trust_circle_auth, trust_circle_messaging;

GRANT SELECT, INSERT ON TABLE users TO trust_circle_auth;
GRANT SELECT, INSERT, DELETE ON TABLE refresh_tokens TO trust_circle_auth;
GRANT SELECT, INSERT, DELETE ON TABLE device_bootstrap_grants TO trust_circle_auth;
GRANT USAGE, SELECT ON SEQUENCE refresh_tokens_id_seq TO trust_circle_auth;

GRANT SELECT ON TABLE users TO trust_circle_messaging;
GRANT UPDATE (created_at) ON TABLE users TO trust_circle_messaging;
GRANT SELECT, INSERT ON TABLE groups TO trust_circle_messaging;
GRANT UPDATE (created_at) ON TABLE groups TO trust_circle_messaging;
GRANT INSERT ON TABLE group_keys TO trust_circle_messaging;
GRANT SELECT, INSERT ON TABLE user_groups TO trust_circle_messaging;
GRANT UPDATE (role) ON TABLE user_groups TO trust_circle_messaging;
GRANT SELECT, INSERT ON TABLE join_requests TO trust_circle_messaging;
GRANT UPDATE (status, handled_by) ON TABLE join_requests TO trust_circle_messaging;
GRANT SELECT ON TABLE device_bootstrap_grants TO trust_circle_messaging;
GRANT UPDATE (consumed_at) ON TABLE device_bootstrap_grants TO trust_circle_messaging;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE device_registration_challenges
  TO trust_circle_messaging;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE device_approval_challenges
  TO trust_circle_messaging;
GRANT SELECT, INSERT, UPDATE ON TABLE account_devices TO trust_circle_messaging;
GRANT SELECT, INSERT, UPDATE ON TABLE group_device_keys TO trust_circle_messaging;
GRANT SELECT, INSERT ON TABLE group_device_key_history TO trust_circle_messaging;
GRANT SELECT, INSERT ON TABLE conversations TO trust_circle_messaging;
GRANT UPDATE (created_at) ON TABLE conversations TO trust_circle_messaging;
GRANT SELECT, INSERT ON TABLE conversation_users TO trust_circle_messaging;
GRANT UPDATE (last_read_at) ON TABLE conversation_users TO trust_circle_messaging;
GRANT SELECT, INSERT ON TABLE messages TO trust_circle_messaging;

COMMIT;
