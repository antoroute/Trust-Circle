-- Verify trust-circle:unique_pending_join_request on pg

BEGIN;

DO $verify$
DECLARE
  index_definition TEXT;
BEGIN
  SELECT indexdef
    INTO index_definition
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname = 'uidx_join_requests_pending_group_user';

  IF index_definition IS NULL
     OR index_definition NOT LIKE 'CREATE UNIQUE INDEX%'
     OR index_definition NOT LIKE '%(group_id, user_id)%'
     OR index_definition NOT LIKE '%status = ''pending''%' THEN
    RAISE EXCEPTION 'pending join request uniqueness index is invalid';
  END IF;
END
$verify$;

ROLLBACK;
