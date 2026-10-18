#![cfg(feature = "prototype")]
use circlehaven_mls_probe::{Device, Error, Fault};
use rusqlite::Connection;
use tempfile::TempDir;

const GROUP: &[u8] = b"synthetic-recovery";

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
        .add(GROUP, "join", &[b.key_package().unwrap()], Fault::None)
        .unwrap();
    a.receive(GROUP, &add.message, Fault::None).unwrap();
    let add = a.outbox("join").unwrap();
    b.join(GROUP, add.welcome.as_ref().unwrap(), Fault::None)
        .unwrap();
    (dir, a, b)
}

fn blocked<T>(result: circlehaven_mls_probe::Result<T>) {
    assert!(matches!(result, Err(Error::RecoveryRequired)));
}

#[test]
fn detected_restore_blocks_all_operational_paths_but_preserves_history() {
    let (dir, mut a, mut b) = pair();
    let mut c = device(&dir, "c");
    let key = c.key_package().unwrap();
    a.create(b"second", Fault::None).unwrap();
    let saved = a
        .send(GROUP, "saved", b"synthetic-saved", Fault::None)
        .unwrap();
    b.receive(GROUP, &saved.message, Fault::None).unwrap();
    let incoming = b
        .send(GROUP, "incoming", b"synthetic-history", Fault::None)
        .unwrap();
    a.receive(GROUP, &incoming.message, Fault::None).unwrap();
    let later = b
        .send(GROUP, "later", b"synthetic-later", Fault::None)
        .unwrap();
    let joining = a.outbox("join").unwrap().welcome.unwrap();

    a.require_reactivation().unwrap();
    assert_eq!(a.reactivation_required(), Ok(true));
    assert!(a.last_transaction_timing().is_none());
    blocked(a.send(GROUP, "new", b"synthetic", Fault::None));
    blocked(a.send(GROUP, "saved", b"synthetic-saved", Fault::None));
    blocked(a.send(b"second", "other-group", b"synthetic", Fault::None));
    blocked(a.outbox("saved"));
    blocked(a.outbox("join"));
    blocked(a.update(GROUP, "update", Fault::None));
    blocked(a.add(GROUP, "add", &[key], Fault::None));
    blocked(a.remove(GROUP, "remove", 1, Fault::None));
    blocked(a.remove_many(GROUP, "remove-many", &[1], Fault::None));
    blocked(a.create(b"third", Fault::None));
    blocked(a.key_package());
    blocked(a.initialize(b"replacement"));
    blocked(a.join(b"new-group", &joining, Fault::None));
    blocked(a.receive(GROUP, &later.message, Fault::None));
    blocked(a.receive_batch(GROUP, &[later.message], Fault::None));
    assert!(a.inbox(GROUP).unwrap() == [b"synthetic-history"]);
    assert_eq!(a.epoch(GROUP), Ok(1));
    assert_eq!(a.epoch(b"second"), Ok(0));
    assert_eq!(a.members(GROUP).unwrap().len(), 2);
    assert!(a.last_transaction_timing().is_none());
    // No propagation to an unrelated device/database.
    assert_eq!(b.reactivation_required(), Ok(false));
    assert!(
        b.send(GROUP, "still-usable", b"synthetic", Fault::None)
            .is_ok()
    );
}

#[test]
fn stop_survives_restart_and_is_seen_by_a_previously_open_connection() {
    let (dir, mut a, _b) = pair();
    let mut second_actor = Device::open_synthetic(&dir.path().join("a")).unwrap();
    assert_eq!(second_actor.reactivation_required(), Ok(false));
    a.require_reactivation().unwrap();
    a.require_reactivation().unwrap();
    blocked(second_actor.send(GROUP, "stale-handle", b"synthetic", Fault::None));
    blocked(second_actor.outbox("join"));
    drop(a);
    let mut reopened = Device::open_synthetic(&dir.path().join("a")).unwrap();
    assert_eq!(reopened.reactivation_required(), Ok(true));
    blocked(reopened.update(GROUP, "restart", Fault::None));
    blocked(reopened.key_package());
    reopened.require_reactivation().unwrap();
    assert_eq!(reopened.epoch(GROUP), Ok(1));
}

#[test]
fn stop_before_initialization_cannot_be_bypassed_by_bootstrap() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a");
    let mut a = Device::open_synthetic(&path).unwrap();
    a.require_reactivation().unwrap();
    drop(a);
    let mut a = Device::open_synthetic(&path).unwrap();
    blocked(a.initialize(b"synthetic"));
    assert!(a.inbox(GROUP).unwrap().is_empty());
}

#[test]
fn complete_snapshot_can_restore_the_marker_and_is_not_claimed_detected() {
    let (dir, a, _b) = pair();
    let live = dir.path().join("a");
    let snapshot = dir.path().join("synthetic-snapshot");
    drop(a); // Only copy a closed, synthetic database; no live/WAL copy claim.
    std::fs::copy(&live, &snapshot).unwrap();
    let mut a = Device::open_synthetic(&live).unwrap();
    a.require_reactivation().unwrap();
    assert_eq!(a.reactivation_required(), Ok(true));
    let old = Device::open_synthetic(&snapshot).unwrap();
    // Explicit negative evidence: this local row is not an independent witness.
    // Do not encrypt with the restored state in this test.
    assert_eq!(old.reactivation_required(), Ok(false));
}

#[test]
fn legacy_schema_is_upgraded_once_without_losing_existing_data() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("legacy");
    let legacy = Connection::open(&path).unwrap();
    legacy
        .execute_batch(include_str!("../schema/001-probe.sql"))
        .unwrap();
    legacy
        .execute(
            "INSERT INTO probe_inbox(group_id,payload) VALUES(?1,?2)",
            rusqlite::params![GROUP, b"synthetic-history".as_slice()],
        )
        .unwrap();
    drop(legacy);
    let mut a = Device::open_synthetic(&path).unwrap();
    assert_eq!(a.reactivation_required(), Ok(false));
    assert!(a.inbox(GROUP).unwrap() == [b"synthetic-history"]);
    a.require_reactivation().unwrap();
    drop(a);
    let a = Device::open_synthetic(&path).unwrap();
    assert_eq!(a.reactivation_required(), Ok(true));
    assert!(a.inbox(GROUP).unwrap() == [b"synthetic-history"]);
}

#[test]
fn missing_marker_or_unknown_schema_fails_closed_instead_of_reinitializing() {
    for damage in [
        "DELETE FROM probe_recovery",
        "DROP TABLE probe_recovery",
        "PRAGMA user_version=0",
        "PRAGMA user_version=99",
    ] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a");
        let mut a = Device::open_synthetic(&path).unwrap();
        a.require_reactivation().unwrap();
        drop(a);
        Connection::open(&path)
            .unwrap()
            .execute_batch(damage)
            .unwrap();
        assert!(matches!(Device::open_synthetic(&path), Err(Error::Storage)));
    }
}

#[test]
fn post_staging_group_rejection_rolls_back_keypackage_consumption_across_restart() {
    let dir = tempfile::tempdir().unwrap();
    let mut a = device(&dir, "a");
    let mut b = device(&dir, "b");
    a.create(GROUP, Fault::None).unwrap();
    let key = b.key_package().unwrap();
    let add = a
        .add(GROUP, "join", std::slice::from_ref(&key), Fault::None)
        .unwrap();
    a.receive(GROUP, &add.message, Fault::None).unwrap();
    let welcome = a.outbox("join").unwrap().welcome.unwrap();
    // This input is valid MLS. The application group check fails AFTER staging.
    assert_eq!(
        b.join(b"wrong-context", &welcome, Fault::None),
        Err(Error::Input)
    );
    assert!(b.epoch(GROUP).is_err());
    assert!(b.epoch(b"wrong-context").is_err());
    drop(b);
    let mut b = Device::open_synthetic(&dir.path().join("b")).unwrap();
    b.join(GROUP, &welcome, Fault::None).unwrap();
    assert_eq!(b.join(GROUP, &welcome, Fault::None), Err(Error::Conflict));
    a.create(b"other", Fault::None).unwrap();
    let reused = a.add(b"other", "reuse", &[key], Fault::None).unwrap();
    a.receive(b"other", &reused.message, Fault::None).unwrap();
    let reused = a.outbox("reuse").unwrap();
    assert!(
        b.join(b"other", reused.welcome.as_ref().unwrap(), Fault::None)
            .is_err()
    );
    let wire = a
        .send(GROUP, "still-valid", b"synthetic", Fault::None)
        .unwrap();
    b.receive(GROUP, &wire.message, Fault::None).unwrap();
    assert_eq!(b.inbox(GROUP).unwrap().len(), 1);
}
