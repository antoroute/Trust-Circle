-- Laboratory only. Older application outboxes do not record their creation
-- epoch, so eligibility after previous transitions cannot be reconstructed.
UPDATE probe_recovery SET required=1 WHERE singleton=1 AND
    EXISTS(SELECT 1 FROM probe_outbox WHERE disposition='application');
-- Limit epoch retirement to still-publishable rows of the affected group.
CREATE INDEX probe_epoch_outbox ON probe_outbox(group_id)
    WHERE disposition='application';
PRAGMA user_version=4;
