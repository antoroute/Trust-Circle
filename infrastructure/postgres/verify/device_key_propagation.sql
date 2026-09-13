-- Verify trust-circle:device_key_propagation on pg

BEGIN;

DO $verify$
DECLARE
  history_primary_key_columns INTEGER;
BEGIN
  IF to_regclass('public.group_device_key_history') IS NULL THEN
    RAISE EXCEPTION 'group_device_key_history is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'group_device_keys'
       AND column_name = 'binding_signature'
       AND data_type = 'bytea'
  ) OR NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'group_device_keys'
       AND column_name = 'identity_key_version'
       AND data_type = 'integer'
  ) THEN
    RAISE EXCEPTION 'trusted group-device key columns are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.device_approval_challenges'::regclass
       AND conname = 'device_approval_challenges_decision_check'
       AND pg_get_constraintdef(oid) LIKE '%revoke%'
  ) THEN
    RAISE EXCEPTION 'device revocation decision is not supported';
  END IF;

  IF (
    SELECT count(*)
      FROM pg_constraint
     WHERE conrelid = 'public.group_device_keys'::regclass
       AND conname IN (
         'ck_group_device_keys_status',
         'ck_group_device_keys_identity_version',
         'ck_group_device_keys_binding_signature',
         'ck_group_device_keys_trusted_material',
         'ck_group_device_keys_revoked_at'
       )
  ) <> 5 THEN
    RAISE EXCEPTION 'group-device key integrity constraints are incomplete';
  END IF;

  SELECT count(*)
    INTO history_primary_key_columns
    FROM information_schema.key_column_usage
   WHERE table_schema = 'public'
     AND table_name = 'group_device_key_history'
     AND constraint_name = 'group_device_key_history_pkey';

  IF history_primary_key_columns <> 4 THEN
    RAISE EXCEPTION 'group-device key history primary key is invalid';
  END IF;
END
$verify$;

ROLLBACK;
