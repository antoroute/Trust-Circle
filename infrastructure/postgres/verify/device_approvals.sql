-- Verify trust-circle:device_approvals on pg

BEGIN;

DO $verify$
BEGIN
  IF to_regclass('public.device_approval_challenges') IS NULL THEN
    RAISE EXCEPTION 'device_approval_challenges is missing';
  END IF;

  IF (
    SELECT count(*)
      FROM pg_constraint
     WHERE conrelid = 'public.device_approval_challenges'::regclass
       AND contype = 'f'
       AND confrelid = 'public.account_devices'::regclass
  ) <> 2 THEN
    RAISE EXCEPTION 'device approval account-device foreign keys are invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'idx_device_approvals_outstanding_target'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'idx_device_approvals_approver_created'
  ) THEN
    RAISE EXCEPTION 'device approval indexes are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.device_approval_challenges'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%octet_length(transcript) = 216%'
  ) THEN
    RAISE EXCEPTION 'device approval transcript size is not constrained';
  END IF;
END
$verify$;

ROLLBACK;
