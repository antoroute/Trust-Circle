//! One process-wide worker owns all synthetic MLS/SQLite state. Admission uses
//! try_send: at most 8 queued requests plus one executing, never an unbounded queue.
#![forbid(unsafe_code)]
use crate::api::lab::{LabAction, LabReply};
use circlehaven_mls_probe::{Device, Fault};
use futures_channel::oneshot;
use std::{
    path::Path,
    sync::{
        mpsc::{self, SyncSender, TrySendError},
        OnceLock,
    },
    time::Instant,
};

const GROUP: &[u8] = b"synthetic-flutter-lab";
const CAPACITY: usize = 8;
type Outcome = Result<LabReply, String>;
pub(crate) enum Command {
    Start(String),
    Execute {
        session: u32,
        action: LabAction,
        count: u32,
    },
    Close(u32),
}
struct Request {
    command: Command,
    queued: Instant,
    reply: oneshot::Sender<Outcome>,
}
static WORKER: OnceLock<Result<SyncSender<Request>, String>> = OnceLock::new();

fn start_worker() -> Result<SyncSender<Request>, String> {
    let (tx, rx) = mpsc::sync_channel::<Request>(CAPACITY);
    std::thread::Builder::new()
        .name("mls-lab-owner".into())
        .spawn(move || {
            let mut state = State::default();
            for request in rx {
                let start = Instant::now();
                let wait = ms(request.queued);
                let result = state.handle(request.command).map(|mut reply| {
                    reply.queue_ms = wait;
                    reply.native_ms = ms(start);
                    reply
                });
                // A dropped Dart waiter does not undo already accepted durable work.
                let _ = request.reply.send(result);
            }
        })
        .map_err(|_| "worker_unavailable".to_owned())?;
    Ok(tx)
}
fn enqueue(tx: &SyncSender<Request>, request: Request) -> Result<(), String> {
    tx.try_send(request).map_err(|error| match error {
        TrySendError::Full(_) => "busy".into(),
        TrySendError::Disconnected(_) => "worker_unavailable".into(),
    })
}
pub(crate) async fn submit(command: Command) -> Outcome {
    let tx = WORKER
        .get_or_init(start_worker)
        .as_ref()
        .map_err(Clone::clone)?;
    let (reply, receiver) = oneshot::channel();
    enqueue(
        tx,
        Request {
            command,
            queued: Instant::now(),
            reply,
        },
    )?;
    receiver
        .await
        .map_err(|_| "worker_unavailable".to_owned())?
}
fn ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}
fn checked<T>(result: circlehaven_mls_probe::Result<T>) -> Result<T, String> {
    result.map_err(|_| "mls_or_storage_rejected".into())
}
fn empty(session: u32) -> LabReply {
    LabReply {
        session,
        epoch: 0,
        members: 0,
        delivered: 0,
        queue_ms: 0.0,
        native_ms: 0.0,
        send_ms: 0.0,
        receive_ms: 0.0,
    }
}
#[derive(Default)]
struct State {
    session: Option<Session>,
    next: u32,
}
impl State {
    fn handle(&mut self, command: Command) -> Outcome {
        match command {
            Command::Start(parent) => {
                if self.session.is_some() {
                    return Err("already_open".into());
                }
                let id = self.next.checked_add(1).ok_or("session_limit")?;
                let session = Session::new(Path::new(&parent), id)?;
                let reply = session.summary()?;
                self.next = id;
                self.session = Some(session);
                Ok(reply)
            }
            Command::Execute {
                session,
                action,
                count,
            } => {
                let active = self
                    .session
                    .as_mut()
                    .filter(|s| s.id == session)
                    .ok_or("stale_session")?;
                let result = active.execute(action, count);
                // Virtual devices do not share one database transaction. If a
                // scenario fails midway, never continue a possibly split group.
                // This is a lab reset, not a production resynchronization policy.
                if result.is_err() {
                    if let Some(failed) = self.session.take() {
                        failed.close()?;
                    }
                }
                result
            }
            Command::Close(id) => {
                if self.session.as_ref().is_none_or(|s| s.id != id) {
                    return Err("stale_session".into());
                }
                let active = self.session.take().ok_or("stale_session")?;
                active.close()?;
                Ok(empty(id))
            }
        }
    }
}
// Drop order matters on Windows: close SQLite before deleting its own temp dir.
struct Session {
    devices: Vec<Device>,
    directory: tempfile::TempDir,
    id: u32,
    sequence: u32,
    messages: u32,
    third_added: bool,
    third_active: bool,
}
impl Session {
    fn new(parent: &Path, id: u32) -> Result<Self, String> {
        let directory = tempfile::Builder::new()
            .prefix("circlehaven-mls-lab-")
            .tempdir_in(parent)
            .map_err(|_| "storage_unavailable")?;
        let mut devices = Vec::new();
        for name in ["synthetic-a", "synthetic-b", "synthetic-c"] {
            let mut device = checked(Device::open_synthetic(&directory.path().join(name)))?;
            checked(device.initialize(name.as_bytes()))?;
            devices.push(device);
        }
        checked(devices[0].create(GROUP, Fault::None))?;
        let package = checked(devices[1].key_package())?;
        let add = checked(devices[0].add(GROUP, "initial-add", &[package], Fault::None))?;
        checked(devices[0].receive(GROUP, &add.message, Fault::None))?;
        checked(devices[1].join(
            GROUP,
            add.welcome.as_deref().ok_or("missing_welcome")?,
            Fault::None,
        ))?;
        Ok(Self {
            devices,
            directory,
            id,
            sequence: 0,
            messages: 0,
            third_added: false,
            third_active: false,
        })
    }
    fn summary(&self) -> Outcome {
        let mut reply = empty(self.id);
        reply.epoch = checked(self.devices[0].epoch(GROUP))?
            .try_into()
            .map_err(|_| "epoch_limit")?;
        reply.members = checked(self.devices[0].members(GROUP))?.len() as u32;
        Ok(reply)
    }
    fn next_operation(&mut self) -> Result<String, String> {
        if self.sequence >= 10_000 {
            return Err("lab_limit_restart_required".into());
        }
        self.sequence += 1;
        Ok(format!("lab-{}", self.sequence))
    }
    fn distribute(&mut self, wire: &[u8], include_third: bool) -> Result<(), String> {
        for device in self
            .devices
            .iter_mut()
            .take(if include_third { 3 } else { 2 })
        {
            checked(device.receive(GROUP, wire, Fault::None))?;
        }
        Ok(())
    }
    fn execute(&mut self, action: LabAction, count: u32) -> Outcome {
        if count == 0 || count > 100 {
            return Err("invalid_input".into());
        }
        match action {
            LabAction::Exchange | LabAction::ExchangeBatch => {
                if self.messages + count > 5000 {
                    return Err("lab_limit_restart_required".into());
                }
                let start = Instant::now();
                let payload = vec![0x41; 1024];
                let mut wires = Vec::new();
                for _ in 0..count {
                    let id = self.next_operation()?;
                    wires.push(
                        checked(self.devices[0].send(GROUP, &id, &payload, Fault::None))?.message,
                    );
                }
                let send_ms = ms(start);
                let start = Instant::now();
                for device in
                    self.devices
                        .iter_mut()
                        .skip(1)
                        .take(if self.third_active { 2 } else { 1 })
                {
                    if matches!(action, LabAction::ExchangeBatch) {
                        checked(device.receive_batch(GROUP, &wires, Fault::None))?;
                    } else {
                        for wire in &wires {
                            checked(device.receive(GROUP, wire, Fault::None))?;
                        }
                    }
                }
                let receive_ms = ms(start);
                if self.third_added
                    && !self.third_active
                    && self.devices[2]
                        .receive(GROUP, &wires[0], Fault::None)
                        .is_ok()
                {
                    return Err("removed_member_accepted_message".into());
                }
                self.messages += count;
                let mut reply = self.summary()?;
                reply.delivered = count * if self.third_active { 2 } else { 1 };
                reply.send_ms = send_ms;
                reply.receive_ms = receive_ms;
                Ok(reply)
            }
            LabAction::Update => {
                let id = self.next_operation()?;
                let update = checked(self.devices[0].update(GROUP, &id, Fault::None))?;
                self.distribute(&update.message, self.third_active)?;
                self.summary()
            }
            LabAction::AddThird => {
                if self.third_added {
                    return Err("third_already_used".into());
                }
                let id = self.next_operation()?;
                let package = checked(self.devices[2].key_package())?;
                let add = checked(self.devices[0].add(GROUP, &id, &[package], Fault::None))?;
                self.distribute(&add.message, false)?;
                checked(self.devices[2].join(
                    GROUP,
                    add.welcome.as_deref().ok_or("missing_welcome")?,
                    Fault::None,
                ))?;
                self.third_added = true;
                self.third_active = true;
                self.summary()
            }
            LabAction::RemoveThird => {
                if !self.third_active {
                    return Err("third_not_active".into());
                }
                let id = self.next_operation()?;
                let remove = checked(self.devices[0].remove(GROUP, &id, 2, Fault::None))?;
                self.distribute(&remove.message, true)?;
                self.third_active = false;
                self.summary()
            }
        }
    }
    fn close(self) -> Result<(), String> {
        drop(self.devices);
        self.directory.close().map_err(|_| "cleanup_failed".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lifecycle_generation_isolation_and_cleanup() {
        let dir = tempfile::tempdir().unwrap();
        let mut state = State::default();
        let root = dir.path().to_str().unwrap().to_owned();
        let id = state.handle(Command::Start(root.clone())).unwrap().session;
        assert!(state.handle(Command::Start(root.clone())).is_err());
        for (action, count, expected_members) in [
            (LabAction::Exchange, 1, 2),
            (LabAction::AddThird, 1, 3),
            (LabAction::ExchangeBatch, 100, 3),
            (LabAction::Update, 1, 3),
            (LabAction::RemoveThird, 1, 2),
            (LabAction::ExchangeBatch, 2, 2),
        ] {
            let reply = state
                .handle(Command::Execute {
                    session: id,
                    action,
                    count,
                })
                .unwrap();
            assert_eq!(reply.members, expected_members);
        }
        state.handle(Command::Close(id)).unwrap();
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
        let next = state.handle(Command::Start(root)).unwrap().session;
        assert_ne!(next, id);
        assert!(state
            .handle(Command::Execute {
                session: id,
                action: LabAction::Update,
                count: 1
            })
            .is_err());
        state.handle(Command::Close(next)).unwrap();
    }
    #[test]
    fn failed_scenario_invalidates_the_session_and_allows_a_fresh_start() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap().to_owned();
        let mut state = State::default();
        let id = state.handle(Command::Start(root.clone())).unwrap().session;
        assert!(state
            .handle(Command::Execute {
                session: id,
                action: LabAction::RemoveThird,
                count: 1,
            })
            .is_err());
        assert!(state.session.is_none());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
        assert!(state.handle(Command::Close(id)).is_err());
        let next = state.handle(Command::Start(root)).unwrap().session;
        assert_ne!(id, next);
        state.handle(Command::Close(next)).unwrap();
    }
    #[test]
    fn saturated_queue_rejects_without_waiting_or_growing() {
        let (tx, _rx) = mpsc::sync_channel(CAPACITY);
        for _ in 0..CAPACITY {
            let (reply, _) = oneshot::channel();
            enqueue(
                &tx,
                Request {
                    command: Command::Close(1),
                    queued: Instant::now(),
                    reply,
                },
            )
            .unwrap();
        }
        let (reply, _) = oneshot::channel();
        assert_eq!(
            enqueue(
                &tx,
                Request {
                    command: Command::Close(1),
                    queued: Instant::now(),
                    reply
                }
            ),
            Err("busy".into())
        );
    }
}
