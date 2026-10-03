//! Repeatable synthetic release benchmark. Not a Flutter/device UX measurement.
use crate::{Device, Error, Fault, PROVIDER, Result};
use serde_json::{Value, json};
use std::time::Instant;

fn statistics(mut values: Vec<f64>) -> Value {
    values.sort_by(f64::total_cmp);
    let n = values.len();
    json!({"samples":n,"p50_ms":values[(n-1)/2],"p95_ms":values[(n*95).div_ceil(100)-1]})
}
fn elapsed(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}

pub fn run(size: usize, samples: usize, sparse: bool) -> Result<Value> {
    if !(2..=256).contains(&size) || !(10..=1000).contains(&samples) {
        return Err(Error::Input);
    }
    let dir = tempfile::tempdir().map_err(|_| Error::Storage)?;
    let group = b"synthetic-benchmark";
    let mut devices = Vec::new();
    let mut packages = Vec::new();
    for i in 0..size {
        let name = format!("device-{i}");
        let mut device = Device::open_synthetic(&dir.path().join(&name))?;
        device.initialize(name.as_bytes())?;
        if i > 0 {
            packages.push(device.key_package()?);
        }
        devices.push(device);
    }
    devices[0].create(group, Fault::None)?;
    let start = Instant::now();
    let add = devices[0].add(group, "initial-add", &packages, Fault::None)?;
    let add_ms = elapsed(start);
    devices[0].receive(group, &add.message, Fault::None)?;
    let welcome = add.welcome.ok_or(Error::Missing)?;
    let mut joins = Vec::new();
    for device in devices.iter_mut().skip(1) {
        let start = Instant::now();
        device.join(group, &welcome, Fault::None)?;
        joins.push(elapsed(start));
    }
    if sparse && size > 2 {
        let removed: Vec<u32> = (2..(size as u32 - 1)).step_by(2).collect();
        let commit = devices[0].remove_many(group, "sparsify", &removed, Fault::None)?;
        for (i, device) in devices.iter_mut().enumerate() {
            if !removed.contains(&(i as u32)) {
                device.receive(group, &commit.message, Fault::None)?;
            }
        }
    }
    let mut sends = Vec::new();
    let mut receives = Vec::new();
    let mut cold = Vec::new();
    let mut update_times = Vec::new();
    let payload = vec![0x41; 1024];
    for i in 0..samples {
        let start = Instant::now();
        let wire = devices[0].send(group, &format!("send-{i}"), &payload, Fault::None)?;
        sends.push(elapsed(start));
        let start = Instant::now();
        devices[size - 1].receive(group, &wire.message, Fault::None)?;
        receives.push(elapsed(start));
        let wire = devices[0].send(group, &format!("cold-{i}"), &payload, Fault::None)?;
        let start = Instant::now();
        let mut reopened =
            Device::open_synthetic(&dir.path().join(format!("device-{}", size - 1)))?;
        reopened.receive(group, &wire.message, Fault::None)?;
        cold.push(elapsed(start));
        // Each Device loads state inside its transaction; no stale cached state.
        let start = Instant::now();
        let update = devices[0].update(group, &format!("update-{i}"), Fault::None)?;
        devices[0].receive(group, &update.message, Fault::None)?;
        devices[size - 1].receive(group, &update.message, Fault::None)?;
        update_times.push(elapsed(start));
    }
    let mut batches = Vec::new();
    for round in 0..10 {
        let mut wires = Vec::new();
        for i in 0..100 {
            wires.push(devices[0].send(
                group,
                &format!("batch-{round}-{i}"),
                &payload,
                Fault::None,
            )?);
        }
        let start = Instant::now();
        for wire in wires {
            devices[size - 1].receive(group, &wire.message, Fault::None)?;
        }
        batches.push(elapsed(start));
    }
    Ok(
        json!({"provider":PROVIDER,"os":std::env::consts::OS,"arch":std::env::consts::ARCH,
        "initial_members":size,"remaining_members":devices[0].members(group)?.len(),"sparse":sparse,
        "payload_bytes":payload.len(),"add_commit_ms":add_ms,"join":statistics(joins),
        "send_transaction":statistics(sends),"receive_transaction":statistics(receives),
        "reopen_and_receive":statistics(cold),"update_and_two_merges":statistics(update_times),
        "receive_100":statistics(batches),"scope":"synthetic native + SQLite FULL; excludes Flutter, network, encrypted storage and real-device energy"}),
    )
}
