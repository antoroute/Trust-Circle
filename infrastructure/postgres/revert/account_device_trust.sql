-- Revert trust-circle:account_device_trust from pg

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

DROP TABLE device_registration_challenges;
DROP TABLE account_devices;
DROP TABLE device_bootstrap_grants;

COMMIT;
