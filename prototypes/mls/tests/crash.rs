#![cfg(feature = "prototype")]
use circlehaven_mls_probe::{Device, Fault};
use std::process::Command;
const GROUP: &[u8] = b"synthetic-group";

#[test]
fn abrupt_process_exit_preserves_transaction_boundaries() {
    for action in [
        "send",
        "receive",
        "receive-batch",
        "update",
        "create",
        "add",
        "remove",
        "join",
        "merge-own",
        "merge-peer",
    ] {
        for phase in ["before", "after"] {
            let dir = tempfile::tempdir().unwrap();
            let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
            let mut b = Device::open_synthetic(&dir.path().join("b")).unwrap();
            let mut c = Device::open_synthetic(&dir.path().join("c")).unwrap();
            a.initialize(b"synthetic-a").unwrap();
            b.initialize(b"synthetic-b").unwrap();
            c.initialize(b"synthetic-c").unwrap();
            a.create(GROUP, Fault::None).unwrap();
            let kp = b.key_package().unwrap();
            let add = a.add(GROUP, "add", &[kp], Fault::None).unwrap();
            a.receive(GROUP, &add.message, Fault::None).unwrap();
            b.join(GROUP, add.welcome.as_ref().unwrap(), Fault::None)
                .unwrap();
            if action == "receive" {
                let wire = a
                    .send(GROUP, "delivery", b"synthetic", Fault::None)
                    .unwrap();
                std::fs::write(dir.path().join("wire"), wire.message).unwrap();
            }
            if action == "receive-batch" {
                for n in 0..3 {
                    let wire = a
                        .send(GROUP, &format!("batch-{n}"), b"synthetic", Fault::None)
                        .unwrap();
                    std::fs::write(dir.path().join(format!("wire-{n}")), wire.message).unwrap();
                }
            }
            if action == "add" || action == "join" {
                let kp = c.key_package().unwrap();
                let wire = if action == "join" {
                    let add = a.add(GROUP, "add-c", &[kp], Fault::None).unwrap();
                    a.receive(GROUP, &add.message, Fault::None).unwrap();
                    add.welcome.unwrap()
                } else {
                    kp
                };
                std::fs::write(dir.path().join("wire"), wire).unwrap();
            }
            if action == "merge-own" || action == "merge-peer" {
                let update = a.update(GROUP, "prepared", Fault::None).unwrap();
                if action == "merge-peer" {
                    a.receive(GROUP, &update.message, Fault::None).unwrap();
                }
                std::fs::write(dir.path().join("wire"), update.message).unwrap();
            }
            drop(a);
            drop(b);
            drop(c);
            let output = Command::new(env!("CARGO_BIN_EXE_mls-probe"))
                .args(["crash-worker", dir.path().to_str().unwrap(), action, phase])
                .output()
                .unwrap();
            assert_eq!(
                output.status.code(),
                Some(if phase == "before" { 86 } else { 87 }),
                "worker: {action}/{phase}"
            );
            assert!(output.stdout.is_empty() && output.stderr.is_empty());
            let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
            let mut b = Device::open_synthetic(&dir.path().join("b")).unwrap();
            match action {
                "send" => {
                    assert_eq!(a.outbox("crash").is_ok(), phase == "after");
                    let wire = a.send(GROUP, "crash", b"synthetic", Fault::None).unwrap();
                    b.receive(GROUP, &wire.message, Fault::None).unwrap();
                    assert_eq!(b.inbox(GROUP).unwrap().len(), 1);
                }
                "receive" => {
                    assert_eq!(b.inbox(GROUP).unwrap().len(), usize::from(phase == "after"));
                    let wire = std::fs::read(dir.path().join("wire")).unwrap();
                    assert_eq!(
                        b.receive(GROUP, &wire, Fault::None).is_ok(),
                        phase == "before"
                    );
                    assert_eq!(b.inbox(GROUP).unwrap().len(), 1);
                }
                "receive-batch" => {
                    assert_eq!(
                        b.inbox(GROUP).unwrap().len(),
                        if phase == "after" { 3 } else { 0 }
                    );
                    let wires = (0..3)
                        .map(|n| std::fs::read(dir.path().join(format!("wire-{n}"))).unwrap())
                        .collect::<Vec<_>>();
                    assert_eq!(
                        b.receive_batch(GROUP, &wires, Fault::None).is_ok(),
                        phase == "before"
                    );
                    assert_eq!(b.inbox(GROUP).unwrap().len(), 3);
                }
                "update" => {
                    assert_eq!(a.epoch(GROUP).unwrap(), 1);
                    assert_eq!(a.outbox("crash").is_ok(), phase == "after");
                    let wire = a.update(GROUP, "crash", Fault::None).unwrap();
                    a.receive(GROUP, &wire.message, Fault::None).unwrap();
                    b.receive(GROUP, &wire.message, Fault::None).unwrap();
                    assert_eq!(a.epoch(GROUP).unwrap(), 2);
                }
                "create" => assert_eq!(a.epoch(b"new-group").is_ok(), phase == "after"),
                "add" | "remove" => {
                    assert_eq!(a.epoch(GROUP).unwrap(), 1);
                    assert_eq!(a.outbox("crash").is_ok(), phase == "after");
                    let wire = if action == "add" {
                        let kp = std::fs::read(dir.path().join("wire")).unwrap();
                        a.add(GROUP, "crash", &[kp], Fault::None).unwrap()
                    } else {
                        a.remove(GROUP, "crash", 1, Fault::None).unwrap()
                    };
                    a.receive(GROUP, &wire.message, Fault::None).unwrap();
                    b.receive(GROUP, &wire.message, Fault::None).unwrap();
                    assert_eq!(a.epoch(GROUP).unwrap(), 2);
                    assert_eq!(
                        a.members(GROUP).unwrap().len(),
                        if action == "add" { 3 } else { 1 }
                    );
                    if action == "add" {
                        let mut c = Device::open_synthetic(&dir.path().join("c")).unwrap();
                        c.join(GROUP, wire.welcome.as_ref().unwrap(), Fault::None)
                            .unwrap();
                    }
                }
                "join" => {
                    let mut c = Device::open_synthetic(&dir.path().join("c")).unwrap();
                    assert_eq!(c.epoch(GROUP).is_ok(), phase == "after");
                    if phase == "before" {
                        let wire = std::fs::read(dir.path().join("wire")).unwrap();
                        c.join(GROUP, &wire, Fault::None).unwrap();
                    }
                    assert_eq!(c.epoch(GROUP).unwrap(), 2);
                    let wire = a
                        .send(GROUP, "after-join", b"synthetic", Fault::None)
                        .unwrap();
                    c.receive(GROUP, &wire.message, Fault::None).unwrap();
                }
                "merge-own" | "merge-peer" => {
                    let device = if action == "merge-own" {
                        &mut a
                    } else {
                        &mut b
                    };
                    assert_eq!(
                        device.epoch(GROUP).unwrap(),
                        if phase == "after" { 2 } else { 1 }
                    );
                    let wire = std::fs::read(dir.path().join("wire")).unwrap();
                    assert_eq!(
                        device.receive(GROUP, &wire, Fault::None).is_ok(),
                        phase == "before"
                    );
                    assert_eq!(device.epoch(GROUP).unwrap(), 2);
                }
                _ => unreachable!(),
            }
        }
    }
}
