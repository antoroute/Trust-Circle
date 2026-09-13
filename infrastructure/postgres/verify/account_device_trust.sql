-- Verify trust-circle:account_device_trust on pg

BEGIN;

DO $verify$
DECLARE
  missing_tables TEXT;
BEGIN
  SELECT string_agg(expected.name, ', ' ORDER BY expected.name)
    INTO missing_tables
    FROM (
      VALUES
        ('device_bootstrap_grants'),
        ('account_devices'),
        ('device_registration_challenges')
    ) AS expected(name)
   WHERE to_regclass(format('public.%I', expected.name)) IS NULL;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'missing device trust tables: %', missing_tables;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.table_constraints
     WHERE table_schema = 'public'
       AND table_name = 'account_devices'
       AND constraint_type = 'PRIMARY KEY'
  ) THEN
    RAISE EXCEPTION 'account_devices primary key is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'idx_device_challenges_outstanding'
       AND indexdef LIKE '%WHERE (consumed_at IS NULL)%'
  ) THEN
    RAISE EXCEPTION 'outstanding device challenge index is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.account_devices'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%octet_length(identity_public_key) = 32%'
  ) THEN
    RAISE EXCEPTION 'account device identity key size is not constrained';
  END IF;
END
$verify$;

ROLLBACK;
