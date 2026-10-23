#![cfg(feature = "prototype")]
use circlehaven_mls_probe::{Device, Error, Fault};
use rusqlite::Connection;
use std::process::Command;
use tempfile::TempDir;

const GROUP: &[u8] = b"synthetic-group";

fn trio() -> (TempDir, Device, Device, Device) {
    let dir = tempfile::tempdir().unwrap();
    let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
    let mut b = Device::open_synthetic(&dir.path().join("b")).unwrap();
    let mut c = Device::open_synthetic(&dir.path().join("c")).unwrap();
    a.initialize(b"synthetic-a").unwrap();
    b.initialize(b"synthetic-b").unwrap();
    c.initialize(b"synthetic-c").unwrap();
    a.create(GROUP, Fault::None).unwrap();
    let add = a
        .add(
            GROUP,
            "initial",
            &[b.key_package().unwrap(), c.key_package().unwrap()],
            Fault::None,
        )
        .unwrap();
    a.receive(GROUP, &add.message, Fault::None).unwrap();
    let welcome = a.outbox("initial").unwrap().welcome.unwrap();
    b.join(GROUP, &welcome, Fault::None).unwrap();
    c.join(GROUP, &welcome, Fault::None).unwrap();
    (dir, a, b, c)
}

#[test]
fn removal_retires_old_output_on_author_peers_and_removed_device() {
    let (dir, mut a, mut b, mut c) = trio();
    let previous = a.send(GROUP, "old", b"synthetic-old", Fault::None).unwrap();
    b.send(GROUP, "old", b"synthetic-b", Fault::None).unwrap();
    c.send(GROUP, "old", b"synthetic-c", Fault::None).unwrap();
    c.receive(GROUP, &previous.message, Fault::None).unwrap();
    a.create(b"other", Fault::None).unwrap();
    let other = a
        .send(b"other", "other", b"synthetic", Fault::None)
        .unwrap();
    let second_handle = Device::open_synthetic(&dir.path().join("a")).unwrap();

    let remove = a.remove(GROUP, "remove-b", 1, Fault::None).unwrap();
    a.receive(GROUP, &remove.message, Fault::None).unwrap();
    // Even before B processes its removal, its old keys cannot read new output.
    let fresh = a
        .send(GROUP, "fresh", b"synthetic-fresh", Fault::None)
        .unwrap();
    assert!(b.receive(GROUP, &fresh.message, Fault::None).is_err());
    // An old ciphertext already handed out can still be read with old keys.
    // Invalidating the outbox is not retroactive revocation of these bytes.
    b.receive(GROUP, &previous.message, Fault::None).unwrap();
    assert!(b.inbox(GROUP).unwrap() == [b"synthetic-old"]);
    c.receive(GROUP, &remove.message, Fault::None).unwrap();
    c.receive(GROUP, &fresh.message, Fault::None).unwrap();
    b.receive(GROUP, &remove.message, Fault::None).unwrap();
    for actor in [&a, &b, &c, &second_handle] {
        assert!(matches!(actor.outbox("old"), Err(Error::Superseded)));
    }
    // Historical control delivery is separate from application publication.
    assert!(a.outbox("initial").unwrap().welcome.is_some());
    assert!(a.outbox("other").unwrap() == other);
    assert!(c.inbox(GROUP).unwrap() == [b"synthetic-old".to_vec(), b"synthetic-fresh".to_vec()]);
    assert!(b.send(GROUP, "new", b"synthetic", Fault::None).is_err());
    assert!(matches!(
        a.send(GROUP, "old", b"synthetic-old", Fault::None),
        Err(Error::Superseded)
    ));
    assert!(matches!(
        a.send(GROUP, "old", b"different", Fault::None),
        Err(Error::Conflict)
    ));
    drop(a);
    let a = Device::open_synthetic(&dir.path().join("a")).unwrap();
    assert!(matches!(a.outbox("old"), Err(Error::Superseded)));
    assert!(a.outbox("fresh").unwrap() == fresh);

    let db = Connection::open(dir.path().join("a")).unwrap();
    let remaining: i64 = db
        .query_row(
            "SELECT length(wire) FROM probe_outbox WHERE operation='old'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(remaining, 0); // Logical invalidation, not physical erasure.
}

#[test]
fn preparation_application_and_invalid_candidate_do_not_retire_output() {
    let (_dir, mut a, mut b, _c) = trio();
    let old = a.send(GROUP, "old", b"synthetic", Fault::None).unwrap();
    let welcome = a.outbox("initial").unwrap();
    let pending = a.remove(GROUP, "remove-b", 1, Fault::None).unwrap();
    let incoming = b
        .send(GROUP, "incoming", b"synthetic", Fault::None)
        .unwrap();
    a.receive(GROUP, &incoming.message, Fault::None).unwrap();
    let competing = b.update(GROUP, "competing", Fault::None).unwrap();
    let mut invalid = competing.message;
    *invalid.last_mut().unwrap() ^= 1;
    assert!(a.receive(GROUP, &invalid, Fault::None).is_err());
    let mut false_echo = pending.message.clone();
    *false_echo.last_mut().unwrap() ^= 1;
    assert!(a.receive(GROUP, &false_echo, Fault::None).is_err());
    assert_eq!(
        a.receive(GROUP, &pending.message, Fault::BeforeCommit),
        Err(Error::BeforeCommit)
    );
    assert_eq!(a.epoch(GROUP), Ok(1));
    assert!(a.outbox("old").unwrap() == old);
    assert!(a.outbox("initial").unwrap() == welcome);
    assert!(a.outbox("remove-b").unwrap() == pending);
    assert!(a.inbox(GROUP).unwrap() == [b"synthetic"]);
}

#[test]
fn retirement_storage_failure_rolls_back_local_or_remote_merge() {
    for own in [true, false] {
        let (dir, mut a, _b, mut c) = trio();
        let old = a.send(GROUP, "old", b"synthetic", Fault::None).unwrap();
        let pending = if own {
            a.remove(GROUP, "pending", 1, Fault::None).unwrap()
        } else {
            a.update(GROUP, "pending", Fault::None).unwrap()
        };
        let wire = if own {
            pending.message.clone()
        } else {
            c.remove(GROUP, "winner", 1, Fault::None).unwrap().message
        };
        let db = Connection::open(dir.path().join("a")).unwrap();
        db.execute_batch(
            "CREATE TRIGGER fail_retirement BEFORE UPDATE ON probe_outbox
             WHEN OLD.disposition='application'
             BEGIN SELECT RAISE(ABORT, 'synthetic fault'); END;",
        )
        .unwrap();
        assert_eq!(a.receive(GROUP, &wire, Fault::None), Err(Error::Storage));
        assert_eq!(a.epoch(GROUP), Ok(1));
        assert!(a.outbox("old").unwrap() == old);
        assert!(a.outbox("pending").unwrap() == pending);
        assert!(a.outbox("initial").unwrap().welcome.is_some());
        drop(a);
        db.execute_batch("DROP TRIGGER fail_retirement").unwrap();
        let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
        a.receive(GROUP, &wire, Fault::None).unwrap();
        assert_eq!(a.epoch(GROUP), Ok(2));
        assert!(matches!(a.outbox("old"), Err(Error::Superseded)));
        if own {
            assert!(a.outbox("pending").unwrap() == pending);
        } else {
            assert!(matches!(a.outbox("pending"), Err(Error::Superseded)));
        }
    }
}

#[test]
fn abrupt_exit_keeps_epoch_and_retirement_atomic() {
    for own in [true, false] {
        for phase in ["before", "after"] {
            let (dir, mut a, b, mut c) = trio();
            let old = a.send(GROUP, "old", b"synthetic", Fault::None).unwrap();
            let wire = if own {
                a.remove(GROUP, "remove-b", 1, Fault::None).unwrap().message
            } else {
                c.remove(GROUP, "remove-b", 1, Fault::None).unwrap().message
            };
            std::fs::write(dir.path().join("wire"), &wire).unwrap();
            drop(a);
            drop(b);
            drop(c);
            // The existing worker receives either exact own echo or peer Commit as A.
            let result = Command::new(env!("CARGO_BIN_EXE_mls-probe"))
                .args([
                    "crash-worker",
                    dir.path().to_str().unwrap(),
                    "merge-own",
                    phase,
                ])
                .output()
                .unwrap();
            assert_eq!(
                result.status.code(),
                Some(if phase == "before" { 86 } else { 87 })
            );
            assert!(result.stdout.is_empty() && result.stderr.is_empty());
            let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
            assert_eq!(a.epoch(GROUP), Ok(if phase == "before" { 1 } else { 2 }));
            if phase == "before" {
                assert!(a.outbox("old").unwrap() == old);
                assert!(a.outbox("initial").unwrap().welcome.is_some());
                a.receive(GROUP, &wire, Fault::None).unwrap();
            }
            assert!(matches!(a.outbox("old"), Err(Error::Superseded)));
            assert!(a.outbox("initial").unwrap().welcome.is_some());
            if own {
                assert!(a.outbox("remove-b").unwrap().message == wire);
            }
        }
    }
}

#[test]
fn epoch_advance_is_not_evidence_that_the_requested_member_was_removed() {
    let (_dir, mut a, mut b, mut c) = trio();
    a.send(GROUP, "old", b"synthetic", Fault::None).unwrap();
    let removal = a.remove(GROUP, "remove-b", 1, Fault::None).unwrap();
    let update = c.update(GROUP, "winner", Fault::None).unwrap();
    c.receive(GROUP, &update.message, Fault::None).unwrap();
    a.receive(GROUP, &update.message, Fault::None).unwrap();
    b.receive(GROUP, &update.message, Fault::None).unwrap();
    assert_eq!(a.epoch(GROUP), Ok(2));
    assert!(a.members(GROUP).unwrap().contains(&1));
    assert!(matches!(a.outbox("remove-b"), Err(Error::Superseded)));
    assert!(matches!(a.outbox("old"), Err(Error::Superseded)));
    assert!(a.receive(GROUP, &removal.message, Fault::None).is_err());
    let fresh = a.send(GROUP, "fresh", b"synthetic", Fault::None).unwrap();
    b.receive(GROUP, &fresh.message, Fault::None).unwrap();
    // Negative evidence: this probe has no authenticated revocation-intent gate.
    // A product gate must NOT resume simply because the epoch increased.
    assert!(b.inbox(GROUP).unwrap() == [b"synthetic"]);
}

#[test]
fn historical_controls_still_allow_ordered_peer_catchup() {
    let (_dir, mut a, mut b, mut c) = trio();
    for n in 0..2 {
        a.send(GROUP, &format!("old-{n}"), b"synthetic", Fault::None)
            .unwrap();
        let update = a
            .update(GROUP, &format!("update-{n}"), Fault::None)
            .unwrap();
        a.receive(GROUP, &update.message, Fault::None).unwrap();
        b.receive(GROUP, &update.message, Fault::None).unwrap();
    }
    assert_eq!(a.epoch(GROUP), Ok(3));
    assert_eq!(c.epoch(GROUP), Ok(1));
    for n in 0..2 {
        assert!(matches!(
            a.outbox(&format!("old-{n}")),
            Err(Error::Superseded)
        ));
        let control = a.outbox(&format!("update-{n}")).unwrap();
        c.receive(GROUP, &control.message, Fault::None).unwrap();
    }
    assert_eq!(c.epoch(GROUP), Ok(3));
    let fresh = a
        .send(GROUP, "fresh", b"synthetic-fresh", Fault::None)
        .unwrap();
    c.receive(GROUP, &fresh.message, Fault::None).unwrap();
    assert!(c.inbox(GROUP).unwrap() == [b"synthetic-fresh"]);
    // No claim of complete application-history catch-up: no DS journal here.
}

#[test]
fn already_released_welcome_is_not_a_proof_of_current_admission() {
    let dir = tempfile::tempdir().unwrap();
    let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
    let mut b = Device::open_synthetic(&dir.path().join("b")).unwrap();
    a.initialize(b"synthetic-a").unwrap();
    b.initialize(b"synthetic-b").unwrap();
    a.create(GROUP, Fault::None).unwrap();
    let add = a
        .add(GROUP, "add-b", &[b.key_package().unwrap()], Fault::None)
        .unwrap();
    a.receive(GROUP, &add.message, Fault::None).unwrap();
    let released = a.outbox("add-b").unwrap();
    let removal = a.remove(GROUP, "remove-b", 1, Fault::None).unwrap();
    a.receive(GROUP, &removal.message, Fault::None).unwrap();
    assert!(a.outbox("add-b").unwrap() == released);
    // Bytes returned earlier cannot be recalled: MLS accepts the old Welcome.
    b.join(GROUP, &released.welcome.unwrap(), Fault::None)
        .unwrap();
    assert_eq!(b.epoch(GROUP), Ok(1));
    assert_eq!(a.epoch(GROUP), Ok(2));
    let old = b.send(GROUP, "stale", b"synthetic", Fault::None).unwrap();
    assert!(a.receive(GROUP, &old.message, Fault::None).is_err());
    let fresh = a.send(GROUP, "fresh", b"synthetic", Fault::None).unwrap();
    assert!(b.receive(GROUP, &fresh.message, Fault::None).is_err());
    // This is NOT a recipient freshness check or a safe readmission protocol.
}

#[test]
fn leaf_index_can_represent_a_different_device_after_removal() {
    let (dir, mut a, mut b, mut c) = trio();
    let remove = a.remove(GROUP, "remove-b", 1, Fault::None).unwrap();
    a.receive(GROUP, &remove.message, Fault::None).unwrap();
    c.receive(GROUP, &remove.message, Fault::None).unwrap();
    assert!(!a.members(GROUP).unwrap().contains(&1));
    let mut d = Device::open_synthetic(&dir.path().join("d")).unwrap();
    d.initialize(b"synthetic-d").unwrap();
    let add = a
        .add(GROUP, "add-d", &[d.key_package().unwrap()], Fault::None)
        .unwrap();
    a.receive(GROUP, &add.message, Fault::None).unwrap();
    c.receive(GROUP, &add.message, Fault::None).unwrap();
    d.join(
        GROUP,
        &a.outbox("add-d").unwrap().welcome.unwrap(),
        Fault::None,
    )
    .unwrap();
    assert!(a.members(GROUP).unwrap() == [0, 1, 2]);
    let fresh = a.send(GROUP, "fresh", b"synthetic", Fault::None).unwrap();
    d.receive(GROUP, &fresh.message, Fault::None).unwrap();
    assert!(b.receive(GROUP, &fresh.message, Fault::None).is_err());
    // Leaf 1 is occupied again, but is no longer B. Bind product revocations to
    // authenticated account/device incarnations, not an index across epochs.
}

#[test]
fn v3_application_outboxes_are_stopped_while_history_and_controls_are_preserved() {
    for disposition in [None, Some("application"), Some("merged"), Some("pending")] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("v3");
        let db = Connection::open(&path).unwrap();
        db.execute_batch(include_str!("../schema/001-probe.sql"))
            .unwrap();
        db.execute_batch(include_str!("../schema/002-recovery.sql"))
            .unwrap();
        db.execute_batch(include_str!("../schema/003-admission.sql"))
            .unwrap();
        db.execute(
            "INSERT INTO probe_inbox(group_id,payload) VALUES(?1,?2)",
            rusqlite::params![GROUP, b"synthetic-history".as_slice()],
        )
        .unwrap();
        if let Some(state) = disposition {
            db.execute(
                "INSERT INTO probe_outbox VALUES('old',?1,X'00',X'00',?2)",
                rusqlite::params![GROUP, state],
            )
            .unwrap();
        }
        drop(db);
        let mut a = Device::open_synthetic(&path).unwrap();
        let blocked = disposition == Some("application");
        assert_eq!(a.reactivation_required(), Ok(blocked));
        assert!(a.inbox(GROUP).unwrap() == [b"synthetic-history"]);
        if blocked {
            assert!(matches!(a.outbox("old"), Err(Error::RecoveryRequired)));
            assert_eq!(a.initialize(b"replacement"), Err(Error::RecoveryRequired));
        } else {
            a.initialize(b"synthetic").unwrap();
        }
        drop(a);
        assert_eq!(
            Device::open_synthetic(&path)
                .unwrap()
                .reactivation_required(),
            Ok(blocked)
        );
        let version: i64 = Connection::open(&path)
            .unwrap()
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(version, 4);
    }
}

#[test]
fn failed_v4_migration_does_not_partially_set_recovery_or_version() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("v3");
    let db = Connection::open(&path).unwrap();
    db.execute_batch(include_str!("../schema/001-probe.sql"))
        .unwrap();
    db.execute_batch(include_str!("../schema/002-recovery.sql"))
        .unwrap();
    db.execute_batch(include_str!("../schema/003-admission.sql"))
        .unwrap();
    // Synthetic DDL conflict forces failure AFTER the proposed marker write.
    db.execute_batch(
        "INSERT INTO probe_outbox VALUES('old',X'00',X'00',X'00','application');
        CREATE INDEX probe_epoch_outbox ON probe_outbox(operation);",
    )
    .unwrap();
    assert!(matches!(Device::open_synthetic(&path), Err(Error::Storage)));
    let required: i64 = db
        .query_row("SELECT required FROM probe_recovery", [], |r| r.get(0))
        .unwrap();
    let version: i64 = db
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap();
    assert_eq!((required, version), (0, 3));
    db.execute_batch("DROP INDEX probe_epoch_outbox").unwrap();
    assert_eq!(
        Device::open_synthetic(&path)
            .unwrap()
            .reactivation_required(),
        Ok(true)
    );
}
