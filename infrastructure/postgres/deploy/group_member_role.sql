-- Deploy trust-circle:group_member_role to pg
-- requires: v2_baseline

BEGIN;

ALTER TABLE user_groups
  ADD COLUMN role TEXT NOT NULL DEFAULT 'member';

ALTER TABLE user_groups
  ADD CONSTRAINT user_groups_role_check
  CHECK (role IN ('admin', 'member'));

COMMIT;
