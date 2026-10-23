#![cfg(feature = "prototype")]
use circlehaven_mls_probe::{Device, Error, Fault, Result};
use rusqlite::Connection;
use std::process::Command;
use tempfile::TempDir;

const GROUP: &[u8] = b"synthetic-group";

fn pair() -> (TempDir, Device, Device) {
    let dir = tempfile::tempdir().unwrap();
    let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
    let mut b = Device::open_synthetic(&dir.path().join("b")).unwrap();
    a.initialize(b"synthetic-a").unwrap();
    b.initialize(b"synthetic-b").unwrap();
    a.create(GROUP, Fault::None).unwrap();
    let add = a
        .add(GROUP, "initial", &[b.key_package().unwrap()], Fault::None)
        .unwrap();
    a.receive(GROUP, &add.message, Fault::None).unwrap();
    b.join(
        GROUP,
        &a.outbox("initial").unwrap().welcome.unwrap(),
        Fault::None,
    )
    .unwrap();
    (dir, a, b)
}

fn held<T>(result: Result<T>) {
    assert!(matches!(result, Err(Error::GroupHeld)));
}

#[test]
fn hold_blocks_sends_retries_and_adds_but_preserves_other_groups_and_inbox() {
    let (dir, mut a, mut b) = pair();
    a.create(b"other", Fault::None).unwrap();
    let old = a.send(GROUP, "old", b"synthetic-old", Fault::None).unwrap();
    let incoming = b
        .send(GROUP, "incoming", b"synthetic-history", Fault::None)
        .unwrap();
    a.receive(GROUP, &incoming.message, Fault::None).unwrap();
    let mut c = Device::open_synthetic(&dir.path().join("c")).unwrap();
    c.initialize(b"synthetic-c").unwrap();
    let kp = c.key_package().unwrap();
    a.hold_group_synthetic(GROUP, Fault::None).unwrap();
    held(a.send(GROUP, "new", b"synthetic-new", Fault::None));
    held(a.send(GROUP, "old", b"synthetic-old", Fault::None));
    held(a.outbox("old"));
    held(a.add(GROUP, "add-c", &[kp], Fault::None));
    assert!(a.last_transaction_timing().is_none());
    assert_eq!(a.epoch(GROUP), Ok(1));
    let db = Connection::open(dir.path().join("a")).unwrap();
    let created: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM probe_outbox WHERE operation IN ('new','add-c')",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(created, 0);
    assert!(a.inbox(GROUP).unwrap() == [b"synthetic-history"]);
    assert!(a.send(b"other", "other", b"synthetic", Fault::None).is_ok());
    assert!(a.outbox("other").is_ok());
    // Reception remains available, not only the already validated local inbox.
    let next = b
        .send(GROUP, "next", b"synthetic-next", Fault::None)
        .unwrap();
    a.receive_batch(GROUP, &[next.message], Fault::None)
        .unwrap();
    assert_eq!(a.inbox(GROUP).unwrap().len(), 2);
    // No retroactive recall or propagation to a separate database.
    b.receive(GROUP, &old.message, Fault::None).unwrap();
    assert_eq!(b.group_publication_held(GROUP), Ok(false));
}

#[test]
fn hold_is_durable_idempotent_and_observed_by_an_existing_actor() {
    let (dir, mut a, _b) = pair();
    a.send(GROUP, "old", b"synthetic", Fault::None).unwrap();
    let mut other = Device::open_synthetic(&dir.path().join("a")).unwrap();
    a.hold_group_synthetic(GROUP, Fault::None).unwrap();
    a.hold_group_synthetic(GROUP, Fault::None).unwrap();
    held(other.send(GROUP, "other-actor", b"synthetic", Fault::None));
    held(other.outbox("old"));
    assert!(other.outbox("initial").unwrap().welcome.is_none());
    drop(a);
    let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
    assert_eq!(a.group_publication_held(GROUP), Ok(true));
    held(a.send(GROUP, "restart", b"synthetic", Fault::None));
    let db = Connection::open(dir.path().join("a")).unwrap();
    let count: i64 = db
        .query_row("SELECT COUNT(*) FROM probe_group_hold", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn pending_and_historical_welcomes_stay_masked_even_after_own_merge() {
    let (dir, mut a, _b) = pair();
    let mut c = Device::open_synthetic(&dir.path().join("c")).unwrap();
    c.initialize(b"synthetic-c").unwrap();
    let kp = c.key_package().unwrap();
    let add = a
        .add(GROUP, "add-c", std::slice::from_ref(&kp), Fault::None)
        .unwrap();
    a.hold_group_synthetic(GROUP, Fault::None).unwrap();
    assert!(a.outbox("initial").unwrap().welcome.is_none());
    assert!(a.outbox("add-c").unwrap() == add);
    a.receive(GROUP, &add.message, Fault::None).unwrap();
    assert!(a.outbox("add-c").unwrap() == add);
    held(a.add(GROUP, "add-c", &[kp], Fault::None));
    drop(a);
    let a = Device::open_synthetic(&dir.path().join("a")).unwrap();
    assert!(a.outbox("add-c").unwrap().welcome.is_none());
    // No authorization to republish controls is inferred from their availability.
}

#[test]
fn losing_remove_epoch_advance_and_successful_remove_never_unlock_by_themselves() {
    let (_dir, mut a, mut b) = pair();
    a.hold_group_synthetic(GROUP, Fault::None).unwrap();
    a.remove(GROUP, "losing-remove", 1, Fault::None).unwrap();
    let update = b.update(GROUP, "winner", Fault::None).unwrap();
    b.receive(GROUP, &update.message, Fault::None).unwrap();
    a.receive(GROUP, &update.message, Fault::None).unwrap();
    assert_eq!(a.epoch(GROUP), Ok(2));
    assert!(a.members(GROUP).unwrap().contains(&1));
    assert!(matches!(a.outbox("losing-remove"), Err(Error::Superseded)));
    held(a.send(GROUP, "too-early", b"synthetic", Fault::None));
    let remove = a.remove(GROUP, "remove", 1, Fault::None).unwrap();
    assert!(a.outbox("remove").unwrap() == remove);
    a.receive(GROUP, &remove.message, Fault::None).unwrap();
    assert!(!a.members(GROUP).unwrap().contains(&1));
    assert_eq!(a.group_publication_held(GROUP), Ok(true));
    held(a.send(GROUP, "no-proof", b"synthetic", Fault::None));
    // This hook deliberately does NOT claim target identity/authority validation.
    // Even an actual Remove cannot authorize automatic resume in this lot.
}

#[test]
fn remote_controls_and_rollbacks_preserve_hold_with_recovery_gate_prioritary() {
    let (_dir, mut a, mut b) = pair();
    a.hold_group_synthetic(GROUP, Fault::None).unwrap();
    let own = a.update(GROUP, "own", Fault::None).unwrap();
    let peer = b.update(GROUP, "peer", Fault::None).unwrap();
    let mut invalid = peer.message.clone();
    *invalid.last_mut().unwrap() ^= 1;
    assert!(a.receive(GROUP, &invalid, Fault::None).is_err());
    assert_eq!(
        a.receive(GROUP, &peer.message, Fault::BeforeCommit),
        Err(Error::BeforeCommit)
    );
    assert_eq!(a.epoch(GROUP), Ok(1));
    assert!(a.outbox("own").unwrap() == own);
    a.receive(GROUP, &peer.message, Fault::None).unwrap();
    held(a.send(GROUP, "new", b"synthetic", Fault::None));
    a.require_reactivation().unwrap();
    assert!(matches!(
        a.update(GROUP, "recovery", Fault::None),
        Err(Error::RecoveryRequired)
    ));
    assert!(matches!(a.outbox("initial"), Err(Error::RecoveryRequired)));
    assert_eq!(
        a.receive(GROUP, &peer.message, Fault::None),
        Err(Error::RecoveryRequired)
    );
}

#[test]
fn failed_persistence_latches_only_current_actor_until_retry_succeeds() {
    let (dir, mut a, _b) = pair();
    a.send(GROUP, "old", b"synthetic", Fault::None).unwrap();
    let db = Connection::open(dir.path().join("a")).unwrap();
    db.execute_batch(
        "CREATE TRIGGER fail_hold BEFORE INSERT ON probe_group_hold
        BEGIN SELECT RAISE(ABORT, 'synthetic fault'); END;",
    )
    .unwrap();
    assert_eq!(
        a.hold_group_synthetic(GROUP, Fault::None),
        Err(Error::Storage)
    );
    held(a.send(GROUP, "new", b"synthetic", Fault::None));
    held(a.outbox("old"));
    assert!(a.outbox("initial").unwrap().welcome.is_none());
    let other = Device::open_synthetic(&dir.path().join("a")).unwrap();
    assert_eq!(other.group_publication_held(GROUP), Ok(false));
    assert!(other.outbox("old").is_ok()); // NOT a promised cross-actor stop yet.
    db.execute_batch("DROP TRIGGER fail_hold").unwrap();
    a.hold_group_synthetic(GROUP, Fault::None).unwrap();
    held(other.outbox("old"));
}

#[test]
fn injected_failures_and_process_crashes_distinguish_latch_from_durable_hold() {
    for fault in [Fault::BeforeCommit, Fault::AfterCommit] {
        let (dir, mut a, _b) = pair();
        let committed = matches!(fault, Fault::AfterCommit);
        assert_eq!(
            a.hold_group_synthetic(GROUP, fault),
            Err(if committed {
                Error::AfterCommit
            } else {
                Error::BeforeCommit
            })
        );
        assert_eq!(a.group_publication_held(GROUP), Ok(true));
        let other = Device::open_synthetic(&dir.path().join("a")).unwrap();
        assert_eq!(other.group_publication_held(GROUP), Ok(committed));
        a.hold_group_synthetic(GROUP, Fault::None).unwrap();
        assert_eq!(other.group_publication_held(GROUP), Ok(true));
    }
    for phase in ["before", "after"] {
        let (dir, a, b) = pair();
        drop(a);
        drop(b);
        let output = Command::new(env!("CARGO_BIN_EXE_mls-probe"))
            .args([
                "crash-worker",
                dir.path().to_str().unwrap(),
                "hold-group",
                phase,
            ])
            .output()
            .unwrap();
        assert_eq!(
            output.status.code(),
            Some(if phase == "before" { 86 } else { 87 })
        );
        assert!(output.stdout.is_empty() && output.stderr.is_empty());
        let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
        assert_eq!(a.group_publication_held(GROUP), Ok(phase == "after"));
        if phase == "after" {
            held(a.send(GROUP, "new", b"synthetic", Fault::None));
        }
        // A crash before persistence loses the signal: a durable upstream source
        // must replay it before allowing publication. This hook is not that source.
    }
}

#[test]
fn v4_upgrade_is_atomic_preserves_recovery_and_rejects_missing_current_table() {
    for stopped in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("v4");
        let db = Connection::open(&path).unwrap();
        for schema in [
            include_str!("../schema/001-probe.sql"),
            include_str!("../schema/002-recovery.sql"),
            include_str!("../schema/003-admission.sql"),
            include_str!("../schema/004-epoch-outbox.sql"),
        ] {
            db.execute_batch(schema).unwrap();
        }
        if stopped {
            db.execute("UPDATE probe_recovery SET required=1", [])
                .unwrap();
        }
        db.execute(
            "INSERT INTO probe_inbox(group_id,payload) VALUES(?1,?2)",
            rusqlite::params![GROUP, b"synthetic-history".as_slice()],
        )
        .unwrap();
        // Conflicting synthetic DDL must not advance the version.
        db.execute_batch("CREATE TABLE probe_group_hold(bad INTEGER)")
            .unwrap();
        assert!(matches!(Device::open_synthetic(&path), Err(Error::Storage)));
        let version: i64 = db
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(version, 4);
        db.execute_batch("DROP TABLE probe_group_hold").unwrap();
        let a = Device::open_synthetic(&path).unwrap();
        assert_eq!(a.reactivation_required(), Ok(stopped));
        assert_eq!(a.group_publication_held(GROUP), Ok(false));
        assert!(a.inbox(GROUP).unwrap() == [b"synthetic-history"]);
        drop(a);
        db.execute_batch("DROP TABLE probe_group_hold").unwrap();
        assert!(matches!(Device::open_synthetic(&path), Err(Error::Storage)));
    }
}
