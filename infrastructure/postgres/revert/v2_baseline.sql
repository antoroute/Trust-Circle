-- Revert trust-circle:v2_baseline from pg

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'trust_circle_migration_test'
     AND current_setting('trust_circle.allow_destructive_revert', true)
       IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'destructive revert blocked; explicit operator opt-in required';
  END IF;
END
$guard$;

DROP TABLE notifications;
DROP TABLE refresh_tokens;
DROP TABLE messages;
DROP TABLE conversation_users;
DROP TABLE conversations;
DROP TABLE group_device_keys;
DROP TABLE join_request_votes;
DROP TABLE join_requests;
DROP TABLE user_groups;
DROP TABLE group_keys;
DROP TABLE groups;
DROP TABLE users;

COMMIT;
