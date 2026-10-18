#![cfg(feature = "prototype")]
use circlehaven_mls_probe::{Device, Error, Fault};
use rusqlite::{Connection, params};
use std::process::Command;
use tempfile::TempDir;

const GROUP: &[u8] = b"synthetic-group";

fn device(dir: &TempDir, name: &str) -> Device {
    let mut d = Device::open_synthetic(&dir.path().join(name)).unwrap();
    d.initialize(name.as_bytes()).unwrap();
    d
}

fn pair() -> (TempDir, Device, Device) {
    let dir = tempfile::tempdir().unwrap();
    let mut a = device(&dir, "a");
    let mut b = device(&dir, "b");
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

#[test]
fn welcome_stays_local_until_durable_own_merge_even_after_restart() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a");
    let mut a = Device::open_synthetic(&path).unwrap();
    let mut b = Device::open_synthetic(&dir.path().join("b")).unwrap();
    a.initialize(b"synthetic-a").unwrap();
    b.initialize(b"synthetic-b").unwrap();
    a.create(GROUP, Fault::None).unwrap();
    let key = b.key_package().unwrap();
    let prepared = a
        .add(GROUP, "add", std::slice::from_ref(&key), Fault::None)
        .unwrap();
    assert!(
        prepared.welcome.is_none(),
        "Welcome must not leave the author yet"
    );
    assert!(a.outbox("add").unwrap().welcome.is_none());
    drop(a);
    let mut a = Device::open_synthetic(&path).unwrap();
    let retry = a
        .add(GROUP, "add", std::slice::from_ref(&key), Fault::None)
        .unwrap();
    assert!(retry == prepared);
    let mut forged = prepared.message.clone();
    *forged.last_mut().unwrap() ^= 1;
    assert!(a.receive(GROUP, &forged, Fault::None).is_err());
    assert!(a.outbox("add").unwrap().welcome.is_none());
    assert!(
        a.receive(GROUP, &prepared.message, Fault::BeforeCommit)
            .is_err()
    );
    assert!(a.outbox("add").unwrap().welcome.is_none());
    assert_eq!(a.epoch(GROUP), Ok(0));
    a.receive(GROUP, &prepared.message, Fault::None).unwrap();
    let released = a.outbox("add").unwrap();
    assert!(released.message == prepared.message);
    let welcome = released.welcome.as_ref().unwrap();
    b.join(GROUP, welcome, Fault::None).unwrap();
    drop(a);
    let mut a = Device::open_synthetic(&path).unwrap();
    assert!(a.outbox("add").unwrap() == released);
    assert!(a.add(GROUP, "add", &[key], Fault::None).unwrap() == released);
}

#[test]
fn only_a_valid_competing_commit_durably_invalidates_pending_output() {
    let (dir, mut a, mut b) = pair();
    let mut c = device(&dir, "c");
    let key = c.key_package().unwrap();
    let losing = a
        .add(GROUP, "losing", std::slice::from_ref(&key), Fault::None)
        .unwrap();
    let other_handle = Device::open_synthetic(&dir.path().join("a")).unwrap();
    // Unrelated groups keep their own pending Welcome and history.
    a.create(b"other-group", Fault::None).unwrap();
    let other = a
        .add(
            b"other-group",
            "other",
            &[c.key_package().unwrap()],
            Fault::None,
        )
        .unwrap();
    let message = b
        .send(GROUP, "while-pending", b"synthetic", Fault::None)
        .unwrap();
    a.receive(GROUP, &message.message, Fault::None).unwrap();
    assert_eq!(a.inbox(GROUP).unwrap().len(), 1);
    assert!(a.outbox("losing").unwrap() == losing);
    let winner = b.update(GROUP, "winner", Fault::None).unwrap();
    let mut bad = winner.message.clone();
    *bad.last_mut().unwrap() ^= 1;
    assert!(a.receive(GROUP, &bad, Fault::None).is_err());
    assert_eq!(a.epoch(GROUP), Ok(1));
    assert!(a.outbox("losing").unwrap() == losing);
    assert_eq!(
        a.receive(GROUP, &winner.message, Fault::BeforeCommit),
        Err(Error::BeforeCommit)
    );
    assert!(a.outbox("losing").unwrap() == losing);
    b.receive(GROUP, &winner.message, Fault::None).unwrap();
    a.receive(GROUP, &winner.message, Fault::None).unwrap();
    assert!(matches!(a.outbox("losing"), Err(Error::Superseded)));
    assert!(matches!(
        other_handle.outbox("losing"),
        Err(Error::Superseded)
    ));
    assert!(a.outbox("other").unwrap() == other);
    assert!(a.receive(GROUP, &losing.message, Fault::None).is_err());
    drop(a);
    let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
    assert!(matches!(
        a.add(GROUP, "losing", &[key], Fault::None),
        Err(Error::Superseded)
    ));
    // The tombstone also keeps the idempotency-conflict check.
    assert!(matches!(
        a.update(GROUP, "losing", Fault::None),
        Err(Error::Conflict)
    ));
    let db = Connection::open(dir.path().join("a")).unwrap();
    let (state, bytes): (String, i64) = db
        .query_row(
            "SELECT disposition, length(wire) FROM probe_outbox WHERE operation='losing'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!((state.as_str(), bytes), ("superseded", 0));
    let message = a.send(GROUP, "after", b"synthetic", Fault::None).unwrap();
    b.receive(GROUP, &message.message, Fault::None).unwrap();
    assert_eq!(b.inbox(GROUP).unwrap().len(), 1);
}

#[test]
fn failure_to_store_release_rolls_back_mls_merge_and_allows_retry() {
    let (dir, mut a, _b) = pair();
    let mut c = device(&dir, "c");
    let add = a
        .add(GROUP, "candidate", &[c.key_package().unwrap()], Fault::None)
        .unwrap();
    let db = Connection::open(dir.path().join("a")).unwrap();
    db.execute_batch(
        "CREATE TRIGGER fail_release BEFORE UPDATE OF disposition ON probe_outbox
        BEGIN SELECT RAISE(ABORT, 'synthetic fault'); END;",
    )
    .unwrap();
    assert_eq!(
        a.receive(GROUP, &add.message, Fault::None),
        Err(Error::Storage)
    );
    assert_eq!(a.epoch(GROUP), Ok(1));
    assert!(a.outbox("candidate").unwrap().welcome.is_none());
    drop(a);
    db.execute_batch("DROP TRIGGER fail_release").unwrap();
    let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
    a.receive(GROUP, &add.message, Fault::None).unwrap();
    c.join(
        GROUP,
        &a.outbox("candidate").unwrap().welcome.unwrap(),
        Fault::None,
    )
    .unwrap();
    assert_eq!(c.epoch(GROUP), Ok(2));
}

#[test]
fn legacy_outbox_without_merge_evidence_requires_reactivation_not_release() {
    for version in [0, 2] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("legacy");
        let db = Connection::open(&path).unwrap();
        db.execute_batch(include_str!("../schema/001-probe.sql"))
            .unwrap();
        if version == 2 {
            db.execute_batch(include_str!("../schema/002-recovery.sql"))
                .unwrap();
        }
        db.execute(
            "INSERT INTO probe_inbox(group_id,payload) VALUES(?1,?2)",
            params![GROUP, b"synthetic-history".as_slice()],
        )
        .unwrap();
        db.execute(
            "INSERT INTO probe_outbox VALUES('old',?1,?2,?3)",
            params![
                GROUP,
                b"synthetic-fingerprint".as_slice(),
                b"synthetic-opaque".as_slice()
            ],
        )
        .unwrap();
        drop(db);
        let mut a = Device::open_synthetic(&path).unwrap();
        assert_eq!(a.reactivation_required(), Ok(true));
        assert!(matches!(a.outbox("old"), Err(Error::RecoveryRequired)));
        assert_eq!(a.initialize(b"replacement"), Err(Error::RecoveryRequired));
        assert!(a.inbox(GROUP).unwrap() == [b"synthetic-history"]);
        drop(a);
        assert_eq!(
            Device::open_synthetic(&path)
                .unwrap()
                .reactivation_required(),
            Ok(true)
        );
    }
}

#[test]
fn abrupt_exit_atomically_releases_or_invalidates_the_welcome() {
    for local_wins in [true, false] {
        for phase in ["before", "after"] {
            let (dir, mut a, mut b) = pair();
            let mut c = device(&dir, "c");
            let add = a
                .add(GROUP, "candidate", &[c.key_package().unwrap()], Fault::None)
                .unwrap();
            let wire = if local_wins {
                add.message
            } else {
                let update = b.update(GROUP, "winner", Fault::None).unwrap();
                b.receive(GROUP, &update.message, Fault::None).unwrap();
                update.message
            };
            std::fs::write(dir.path().join("wire"), &wire).unwrap();
            drop(a);
            drop(b);
            drop(c);
            // Existing worker processes this exact wire as actor A, then exits
            // before/after the SQL commit; no new transport or crash mechanism.
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
                assert!(a.outbox("candidate").unwrap().welcome.is_none());
                a.receive(GROUP, &wire, Fault::None).unwrap();
            }
            if local_wins {
                let released = a.outbox("candidate").unwrap();
                let mut c = Device::open_synthetic(&dir.path().join("c")).unwrap();
                c.join(GROUP, released.welcome.as_ref().unwrap(), Fault::None)
                    .unwrap();
                assert!(a.outbox("candidate").unwrap() == released);
            } else {
                assert!(matches!(a.outbox("candidate"), Err(Error::Superseded)));
            }
        }
    }
}

#[test]
fn removal_of_the_author_also_invalidates_its_pending_admission() {
    let (dir, mut a, mut b) = pair();
    let mut c = device(&dir, "c");
    a.add(GROUP, "losing", &[c.key_package().unwrap()], Fault::None)
        .unwrap();
    let remove = b.remove(GROUP, "remove-a", 0, Fault::None).unwrap();
    b.receive(GROUP, &remove.message, Fault::None).unwrap();
    a.receive(GROUP, &remove.message, Fault::None).unwrap();
    assert!(matches!(a.outbox("losing"), Err(Error::Superseded)));
    assert!(a.send(GROUP, "removed", b"synthetic", Fault::None).is_err());
    drop(a);
    let a = Device::open_synthetic(&dir.path().join("a")).unwrap();
    assert!(matches!(a.outbox("losing"), Err(Error::Superseded)));
}

#[test]
fn previously_joined_member_can_author_a_usable_welcome() {
    let (dir, mut a, mut b) = pair();
    let mut c = device(&dir, "c");
    let add = b
        .add(GROUP, "add-c", &[c.key_package().unwrap()], Fault::None)
        .unwrap();
    assert!(add.welcome.is_none());
    a.receive(GROUP, &add.message, Fault::None).unwrap();
    b.receive(GROUP, &add.message, Fault::None).unwrap();
    c.join(
        GROUP,
        &b.outbox("add-c").unwrap().welcome.unwrap(),
        Fault::None,
    )
    .unwrap();
    let message = b
        .send(GROUP, "from-joiner", b"synthetic", Fault::None)
        .unwrap();
    a.receive(GROUP, &message.message, Fault::None).unwrap();
    c.receive(GROUP, &message.message, Fault::None).unwrap();
    assert_eq!(a.epoch(GROUP), c.epoch(GROUP));
    assert!(c.inbox(GROUP).unwrap() == [b"synthetic"]);
}

#[test]
fn local_release_is_not_global_agreement_under_divergent_delivery() {
    let (dir, mut a, mut b) = pair();
    let mut c = device(&dir, "c");
    let mut d = device(&dir, "d");
    let left = a
        .add(GROUP, "left", &[c.key_package().unwrap()], Fault::None)
        .unwrap();
    let right = b
        .add(GROUP, "right", &[d.key_package().unwrap()], Fault::None)
        .unwrap();
    // A dishonest delivery service echoes a different first Commit to each author.
    a.receive(GROUP, &left.message, Fault::None).unwrap();
    b.receive(GROUP, &right.message, Fault::None).unwrap();
    c.join(
        GROUP,
        &a.outbox("left").unwrap().welcome.unwrap(),
        Fault::None,
    )
    .unwrap();
    d.join(
        GROUP,
        &b.outbox("right").unwrap().welcome.unwrap(),
        Fault::None,
    )
    .unwrap();
    assert_eq!(a.epoch(GROUP), b.epoch(GROUP));
    let from_a = a
        .send(GROUP, "a-branch", b"synthetic-a", Fault::None)
        .unwrap();
    c.receive(GROUP, &from_a.message, Fault::None).unwrap();
    assert!(d.receive(GROUP, &from_a.message, Fault::None).is_err());
    let from_b = b
        .send(GROUP, "b-branch", b"synthetic-b", Fault::None)
        .unwrap();
    d.receive(GROUP, &from_b.message, Fault::None).unwrap();
    assert!(c.receive(GROUP, &from_b.message, Fault::None).is_err());
    assert!(a.receive(GROUP, &right.message, Fault::None).is_err());
    assert!(b.receive(GROUP, &left.message, Fault::None).is_err());
    // Negative evidence, NOT a successful reconciliation or detection protocol.
    assert!(c.inbox(GROUP).unwrap() == [b"synthetic-a"]);
    assert!(d.inbox(GROUP).unwrap() == [b"synthetic-b"]);
}
