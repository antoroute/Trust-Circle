-- Verify trust-circle:group_member_role on pg

BEGIN;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'user_groups'
       AND column_name = 'role'
       AND data_type = 'text'
       AND is_nullable = 'NO'
       AND column_default = '''member''::text'
  ) THEN
    RAISE EXCEPTION 'user_groups.role contract is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.user_groups'::regclass
       AND conname = 'user_groups_role_check'
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%admin%member%'
  ) THEN
    RAISE EXCEPTION 'user_groups role constraint is missing or invalid';
  END IF;
END
$verify$;

ROLLBACK;
