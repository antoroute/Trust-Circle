\set ON_ERROR_STOP on

DO $assert$
DECLARE
  public_table_count INTEGER;
  sqitch_change_count INTEGER;
BEGIN
  SELECT count(*)
    INTO public_table_count
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_type = 'BASE TABLE';

  IF public_table_count <> 17 THEN
    RAISE EXCEPTION 'expected 17 public tables, found %', public_table_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
  ) THEN
    RAISE EXCEPTION 'pgcrypto extension is missing';
  END IF;

  SELECT count(*)
    INTO sqitch_change_count
    FROM trust_circle_sqitch.changes;

  IF sqitch_change_count <> 6 THEN
    RAISE EXCEPTION 'expected 6 Sqitch changes, found %', sqitch_change_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'uidx_messages_message_id'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'uidx_join_requests_pending_group_user'
  ) THEN
    RAISE EXCEPTION 'critical uniqueness indexes are missing';
  END IF;

  IF (
    SELECT count(*)
      FROM pg_constraint
     WHERE conrelid = 'public.group_device_keys'::regclass
       AND conname LIKE 'ck_group_device_keys_%'
  ) <> 5 THEN
    RAISE EXCEPTION 'group-device key constraints are incomplete';
  END IF;
END
$assert$;
