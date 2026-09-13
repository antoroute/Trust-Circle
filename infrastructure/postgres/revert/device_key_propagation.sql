-- Revert trust-circle:device_key_propagation from pg

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'trust_circle_migration_test'
     AND current_setting('trust_circle.allow_destructive_revert', true)
       IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'trust-regressing revert blocked; explicit operator opt-in required';
  END IF;
END
$guard$;

DROP TABLE group_device_key_history;

DELETE FROM device_approval_challenges WHERE decision = 'revoke';

ALTER TABLE device_approval_challenges
  DROP CONSTRAINT device_approval_challenges_decision_check,
  ADD CONSTRAINT device_approval_challenges_decision_check
    CHECK (decision IN ('approve', 'reject'));

ALTER TABLE group_device_keys
  DROP CONSTRAINT ck_group_device_keys_revoked_at,
  DROP CONSTRAINT ck_group_device_keys_trusted_material,
  DROP CONSTRAINT ck_group_device_keys_binding_signature,
  DROP CONSTRAINT ck_group_device_keys_identity_version,
  DROP CONSTRAINT ck_group_device_keys_status;

UPDATE group_device_keys
   SET status = 'active'
 WHERE status = 'legacy';

ALTER TABLE group_device_keys
  DROP COLUMN revoked_at,
  DROP COLUMN updated_at,
  DROP COLUMN binding_signature,
  DROP COLUMN identity_key_version,
  ALTER COLUMN status SET DEFAULT 'active';

COMMIT;
