-- Verify trust-circle:v2_baseline on pg

BEGIN;

DO $verify$
DECLARE
  missing_tables TEXT;
BEGIN
  SELECT string_agg(expected.name, ', ' ORDER BY expected.name)
    INTO missing_tables
    FROM (
      VALUES
        ('users'),
        ('groups'),
        ('group_keys'),
        ('user_groups'),
        ('join_requests'),
        ('join_request_votes'),
        ('group_device_keys'),
        ('conversations'),
        ('conversation_users'),
        ('messages'),
        ('refresh_tokens'),
        ('notifications')
    ) AS expected(name)
   WHERE to_regclass(format('public.%I', expected.name)) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'missing baseline tables: %', missing_tables;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
  ) THEN
    RAISE EXCEPTION 'pgcrypto extension is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'uidx_messages_message_id'
  ) THEN
    RAISE EXCEPTION 'message anti-replay index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'messages'
       AND column_name = 'message_id'
       AND is_nullable = 'NO'
       AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'messages.message_id contract is invalid';
  END IF;
END
$verify$;

ROLLBACK;
