#![cfg(feature = "prototype")]
use circlehaven_mls_probe::{Device, Error, Fault, MAX_WIRE, Received};
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
    let key = b.key_package().unwrap();
    let add = a.add(GROUP, "initial-add", &[key], Fault::None).unwrap();
    assert_eq!(
        a.epoch(GROUP).unwrap(),
        0,
        "no merge before authenticated echo"
    );
    a.receive(GROUP, &add.message, Fault::None).unwrap();
    b.join(GROUP, add.welcome.as_ref().unwrap(), Fault::None)
        .unwrap();
    (dir, a, b)
}

#[test]
fn lifecycle_add_update_remove_and_future_confidentiality() {
    let (_dir, mut a, mut b) = pair();
    let message = a
        .send(GROUP, "hello", b"synthetic payload", Fault::None)
        .unwrap();
    assert_eq!(
        b.receive(GROUP, &message.message, Fault::None),
        Ok(Received::Application)
    );
    assert!(b.inbox(GROUP).unwrap() == [b"synthetic payload"]);
    let update = b.update(GROUP, "rotate", Fault::None).unwrap();
    a.receive(GROUP, &update.message, Fault::None).unwrap();
    b.receive(GROUP, &update.message, Fault::None).unwrap();
    assert_eq!(a.epoch(GROUP).unwrap(), 2);
    let remove = a.remove(GROUP, "remove-b", 1, Fault::None).unwrap();
    a.receive(GROUP, &remove.message, Fault::None).unwrap();
    b.receive(GROUP, &remove.message, Fault::None).unwrap();
    let future = a.send(GROUP, "future", b"future", Fault::None).unwrap();
    assert!(b.receive(GROUP, &future.message, Fault::None).is_err());
    assert!(
        b.send(GROUP, "revoked-send", b"forbidden", Fault::None)
            .is_err()
    );
}

#[test]
fn tamper_replay_wrong_group_trailing_bytes_and_versions_are_rejected() {
    let (_dir, mut a, mut b) = pair();
    let message = a.send(GROUP, "m", b"synthetic", Fault::None).unwrap();
    let mut tampered = message.message.clone();
    *tampered.last_mut().unwrap() ^= 1;
    assert!(b.receive(GROUP, &tampered, Fault::None).is_err());
    let mut trailing = message.message.clone();
    trailing.push(0);
    assert!(b.receive(GROUP, &trailing, Fault::None).is_err());
    let mut wrong_version = message.message.clone();
    wrong_version[1] = 2;
    assert!(b.receive(GROUP, &wrong_version, Fault::None).is_err());
    assert!(
        b.receive(b"other-group", &message.message, Fault::None)
            .is_err()
    );
    assert!(
        b.receive(GROUP, &vec![0; MAX_WIRE + 1], Fault::None)
            .is_err()
    );
    assert!(b.inbox(GROUP).unwrap().is_empty());
    b.receive(GROUP, &message.message, Fault::None).unwrap();
    assert!(b.receive(GROUP, &message.message, Fault::None).is_err());
    assert_eq!(b.inbox(GROUP).unwrap().len(), 1);
}

#[test]
fn out_of_order_delivery_is_bounded_and_supported() {
    let (_dir, mut a, mut b) = pair();
    let mut wires = Vec::new();
    for i in 0..20 {
        wires.push(a.send(GROUP, &format!("m{i}"), &[i], Fault::None).unwrap());
    }
    for wire in wires.iter().rev() {
        b.receive(GROUP, &wire.message, Fault::None).unwrap();
    }
    assert_eq!(b.inbox(GROUP).unwrap().len(), 20);
}

#[test]
fn failed_receive_never_publishes_plaintext_or_advances_ratchet() {
    let (dir, mut a, mut b) = pair();
    let message = a.send(GROUP, "m", b"synthetic", Fault::None).unwrap();
    assert_eq!(
        b.receive(GROUP, &message.message, Fault::BeforeCommit),
        Err(Error::BeforeCommit)
    );
    assert!(b.inbox(GROUP).unwrap().is_empty());
    drop(b);
    let mut b = Device::open_synthetic(&dir.path().join("b")).unwrap();
    b.receive(GROUP, &message.message, Fault::None).unwrap();
    assert_eq!(b.inbox(GROUP).unwrap().len(), 1);
}

#[test]
fn durable_send_retries_return_identical_ciphertext_after_restart() {
    let (dir, mut a, mut b) = pair();
    assert!(matches!(
        a.send(GROUP, "m", b"synthetic", Fault::AfterCommit),
        Err(Error::AfterCommit)
    ));
    let durable = a.outbox("m").unwrap();
    drop(a);
    let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
    let retry = a.send(GROUP, "m", b"synthetic", Fault::None).unwrap();
    assert!(durable == retry);
    assert!(matches!(
        a.send(GROUP, "m", b"different", Fault::None),
        Err(Error::Conflict)
    ));
    b.receive(GROUP, &retry.message, Fault::None).unwrap();
}

#[test]
fn commit_merge_failure_preserves_pending_commit_for_authenticated_retry() {
    let (dir, mut a, mut b) = pair();
    let update = a.update(GROUP, "rotate", Fault::None).unwrap();
    assert_eq!(
        a.receive(GROUP, &update.message, Fault::BeforeCommit),
        Err(Error::BeforeCommit)
    );
    assert_eq!(a.epoch(GROUP).unwrap(), 1);
    drop(a);
    let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
    a.receive(GROUP, &update.message, Fault::None).unwrap();
    b.receive(GROUP, &update.message, Fault::None).unwrap();
    assert_eq!(a.epoch(GROUP).unwrap(), 2);
    assert!(a.receive(GROUP, &update.message, Fault::None).is_err());
}

#[test]
fn welcome_failure_preserves_keypackage_and_success_consumes_it() {
    let dir = tempfile::tempdir().unwrap();
    let mut a = device(&dir, "a");
    let mut b = device(&dir, "b");
    a.create(GROUP, Fault::None).unwrap();
    let key = b.key_package().unwrap();
    let add = a
        .add(GROUP, "add", std::slice::from_ref(&key), Fault::None)
        .unwrap();
    let welcome = add.welcome.unwrap();
    let mut bad = welcome.clone();
    *bad.last_mut().unwrap() ^= 1;
    assert!(b.join(GROUP, &bad, Fault::None).is_err());
    assert_eq!(
        b.join(GROUP, &welcome, Fault::BeforeCommit),
        Err(Error::BeforeCommit)
    );
    assert!(b.epoch(GROUP).is_err());
    b.join(GROUP, &welcome, Fault::None).unwrap();
    assert!(b.join(GROUP, &welcome, Fault::None).is_err());
    a.create(b"second", Fault::None).unwrap();
    let reused = a.add(b"second", "reuse", &[key], Fault::None).unwrap();
    assert!(
        b.join(b"second", reused.welcome.as_ref().unwrap(), Fault::None)
            .is_err()
    );
}

#[test]
fn concurrent_commits_follow_one_order_and_reject_losing_echo() {
    let (_dir, mut a, mut b) = pair();
    let winner = a.update(GROUP, "winner", Fault::None).unwrap();
    let loser = b.update(GROUP, "loser", Fault::None).unwrap();
    a.receive(GROUP, &winner.message, Fault::None).unwrap();
    b.receive(GROUP, &winner.message, Fault::None).unwrap();
    assert!(a.receive(GROUP, &loser.message, Fault::None).is_err());
    assert!(b.receive(GROUP, &loser.message, Fault::None).is_err());
    assert_eq!(a.epoch(GROUP).unwrap(), b.epoch(GROUP).unwrap());
    let message = b
        .send(GROUP, "after-conflict", b"synthetic", Fault::None)
        .unwrap();
    a.receive(GROUP, &message.message, Fault::None).unwrap();
}

#[test]
fn malformed_lengths_do_not_panic_or_change_state() {
    let (_dir, _a, mut b) = pair();
    for wire in [
        &[0, 1, 0, 2, 0xff, 0xff, 0xff, 0xff][..],
        &[0, 1, 0, 2, 0x80, 0, 0, 1][..],
    ] {
        assert!(b.receive(GROUP, wire, Fault::None).is_err());
    }
    assert_eq!(b.epoch(GROUP).unwrap(), 1);
    assert!(b.inbox(GROUP).unwrap().is_empty());
}

#[test]
fn expired_keypackage_and_forged_own_echo_are_rejected() {
    let (dir, mut a, _b) = pair();
    let mut c = device(&dir, "c");
    let expired = c
        .key_package_with_lifetime(openmls::prelude::Lifetime::init(1, 2))
        .unwrap();
    assert!(a.add(GROUP, "expired", &[expired], Fault::None).is_err());
    let update = a.update(GROUP, "update", Fault::None).unwrap();
    let mut forged = update.message.clone();
    *forged.last_mut().unwrap() ^= 1;
    assert!(a.receive(GROUP, &forged, Fault::None).is_err());
    assert_eq!(a.epoch(GROUP).unwrap(), 1);
    a.receive(GROUP, &update.message, Fault::None).unwrap();
    assert_eq!(a.epoch(GROUP).unwrap(), 2);
}

#[test]
fn bounded_batch_is_atomic_on_tampering_duplicates_and_storage_failure() {
    let (_dir, mut a, mut b) = pair();
    let wires: Vec<_> = (0..100)
        .map(|i| {
            a.send(GROUP, &format!("batch-{i}"), b"synthetic", Fault::None)
                .unwrap()
                .message
        })
        .collect();
    let mut bad = wires.clone();
    *bad[50].last_mut().unwrap() ^= 1;
    assert!(b.receive_batch(GROUP, &bad, Fault::None).is_err());
    assert!(b.inbox(GROUP).unwrap().is_empty());
    let duplicate = vec![wires[0].clone(), wires[0].clone()];
    assert!(b.receive_batch(GROUP, &duplicate, Fault::None).is_err());
    assert!(b.inbox(GROUP).unwrap().is_empty());
    assert_eq!(
        b.receive_batch(GROUP, &wires, Fault::BeforeCommit),
        Err(Error::BeforeCommit)
    );
    assert!(b.inbox(GROUP).unwrap().is_empty());
    assert_eq!(
        b.receive_batch(GROUP, &wires, Fault::AfterCommit),
        Err(Error::AfterCommit)
    );
    assert_eq!(b.inbox(GROUP).unwrap().len(), 100);
    assert!(b.receive_batch(GROUP, &wires, Fault::None).is_err());
    assert_eq!(b.inbox(GROUP).unwrap().len(), 100);
}

#[test]
fn batch_rejects_control_messages_and_excess_without_consuming_state() {
    let (_dir, mut a, mut b) = pair();
    let wire = a
        .send(GROUP, "first", b"synthetic", Fault::None)
        .unwrap()
        .message;
    assert!(
        b.receive_batch(GROUP, &vec![wire.clone(); 101], Fault::None)
            .is_err()
    );
    assert!(
        b.receive_batch(GROUP, &[vec![0; MAX_WIRE + 1]], Fault::None)
            .is_err()
    );
    assert!(b.receive_batch(GROUP, &[], Fault::None).is_err());
    let update = a.update(GROUP, "rotate", Fault::None).unwrap();
    assert!(
        b.receive_batch(GROUP, &[wire.clone(), update.message.clone()], Fault::None)
            .is_err()
    );
    assert!(b.inbox(GROUP).unwrap().is_empty());
    assert_eq!(b.epoch(GROUP).unwrap(), 1);
    b.receive(GROUP, &wire, Fault::None).unwrap();
    b.receive(GROUP, &update.message, Fault::None).unwrap();
    assert_eq!(b.epoch(GROUP).unwrap(), 2);
}
