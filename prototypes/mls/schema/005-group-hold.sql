-- Synthetic laboratory hook only: no authenticated revocation proof or unlock.
-- A row is an irreversible hold in this API, independent of MLS epoch/pending.
CREATE TABLE probe_group_hold (
    group_id BLOB PRIMARY KEY NOT NULL CHECK(length(group_id) BETWEEN 1 AND 64)
);
PRAGMA user_version=5;
