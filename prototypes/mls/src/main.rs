use circlehaven_mls_probe::{Device, Error, Fault, Result, benchmark};
use std::path::Path;

fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("benchmark") if args.len() == 5 => {
            let size = args[2].parse().map_err(|_| Error::Input)?;
            let samples = args[3].parse().map_err(|_| Error::Input)?;
            let sparse = match args[4].as_str() {
                "dense" => false,
                "sparse" => true,
                _ => return Err(Error::Input),
            };
            println!("{}", benchmark::run(size, samples, sparse)?);
            Ok(())
        }
        Some("crash-worker") if args.len() == 5 => {
            let root = Path::new(&args[2]);
            let fault = match args[4].as_str() {
                "before" => Fault::CrashBeforeCommit,
                "after" => Fault::CrashAfterCommit,
                _ => return Err(Error::Input),
            };
            let action = args[3].as_str();
            let actor = match action {
                "receive" | "receive-batch" | "merge-peer" => "b",
                "join" => "c",
                _ => "a",
            };
            let mut device = Device::open_synthetic(&root.join(actor))?;
            match action {
                "send" => {
                    device.send(b"synthetic-group", "crash", b"synthetic", fault)?;
                }
                "update" => {
                    device.update(b"synthetic-group", "crash", fault)?;
                }
                "create" => device.create(b"new-group", fault)?,
                "add" => {
                    let kp = std::fs::read(root.join("wire")).map_err(|_| Error::Storage)?;
                    device.add(b"synthetic-group", "crash", &[kp], fault)?;
                }
                "remove" => {
                    device.remove(b"synthetic-group", "crash", 1, fault)?;
                }
                "join" => {
                    let wire = std::fs::read(root.join("wire")).map_err(|_| Error::Storage)?;
                    device.join(b"synthetic-group", &wire, fault)?;
                }
                "receive-batch" => {
                    let wires = (0..3)
                        .map(|n| {
                            std::fs::read(root.join(format!("wire-{n}")))
                                .map_err(|_| Error::Storage)
                        })
                        .collect::<Result<Vec<_>>>()?;
                    device.receive_batch(b"synthetic-group", &wires, fault)?;
                }
                "receive" | "merge-own" | "merge-peer" => {
                    let wire = std::fs::read(root.join("wire")).map_err(|_| Error::Storage)?;
                    device.receive(b"synthetic-group", &wire, fault)?;
                }
                _ => return Err(Error::Input),
            }
            Err(Error::Input) // A crash control must never return normally.
        }
        _ => Err(Error::Input),
    }
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
