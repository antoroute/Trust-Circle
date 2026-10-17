-- Laboratory-only, monotone stop after an EXTERNAL restoration signal.
-- This row is NOT an anti-rollback witness: a full snapshot can restore it.
CREATE TABLE probe_recovery (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    required INTEGER NOT NULL CHECK(required IN (0,1))
);
INSERT INTO probe_recovery(singleton, required) VALUES(1, 0);
PRAGMA user_version=2;
