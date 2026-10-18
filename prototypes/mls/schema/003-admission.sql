-- Synthetic laboratory only. Local merge is NOT global arbitration/freshness.
ALTER TABLE probe_outbox ADD COLUMN disposition TEXT NOT NULL DEFAULT 'legacy'
    CHECK(disposition IN ('legacy', 'application', 'pending', 'merged', 'superseded'));
CREATE UNIQUE INDEX probe_one_pending_outbox_per_group
    ON probe_outbox(group_id) WHERE disposition='pending';
-- Old outboxes have no durable evidence of their merge/publication outcome.
-- Preserve history, but never infer that an old Welcome is safe to release.
UPDATE probe_recovery SET required=1 WHERE singleton=1 AND
    (EXISTS(SELECT 1 FROM probe_outbox) OR EXISTS(SELECT 1 FROM probe_pending));
PRAGMA user_version=3;
