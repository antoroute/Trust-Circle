-- Revert trust-circle:unique_pending_join_request from pg

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'trust_circle_migration_test'
     AND current_setting('trust_circle.allow_destructive_revert', true)
       IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'integrity-weakening revert blocked; explicit operator opt-in required';
  END IF;
END
$guard$;

DROP INDEX uidx_join_requests_pending_group_user;

COMMIT;
