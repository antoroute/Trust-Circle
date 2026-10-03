-- Synthetic laboratory data only. NOT the application's encrypted storage.
CREATE TABLE IF NOT EXISTS probe_device (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    identity BLOB NOT NULL,
    public_key BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS probe_outbox (
    operation TEXT PRIMARY KEY,
    group_id BLOB NOT NULL,
    fingerprint BLOB NOT NULL,
    wire BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS probe_inbox (
    sequence INTEGER PRIMARY KEY,
    group_id BLOB NOT NULL,
    payload BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS probe_pending (
    group_id BLOB PRIMARY KEY,
    wire BLOB NOT NULL
);
