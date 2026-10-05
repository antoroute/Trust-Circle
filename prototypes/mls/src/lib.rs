//! TC-301 laboratory only. No real accounts, no production integration.
//! SQLite is deliberately NOT encrypted here; use temporary synthetic fixtures.
#![cfg(feature = "prototype")]

use openmls::prelude::tls_codec::{Deserialize as _, Serialize as _};
use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;
#[cfg(feature = "libcrux")]
use openmls_libcrux_crypto::CryptoProvider as Engine;
#[cfg(not(feature = "libcrux"))]
use openmls_rust_crypto::RustCrypto as Engine;
use openmls_sqlite_storage::{Codec, SqliteStorageProvider};
use openmls_traits::OpenMlsProvider;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::Cursor,
    path::Path,
    time::{Duration, Instant},
};

pub const SUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
pub const MAX_WIRE: usize = 1_048_576;
pub const MAX_PLAINTEXT: usize = 16_384;
pub const MAX_MEMBERS: usize = 256;
pub const MAX_BATCH: usize = 100;
pub const PROVIDER: &str = if cfg!(feature = "libcrux") {
    "libcrux"
} else {
    "rustcrypto"
};

pub mod benchmark;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum Error {
    #[error("storage operation failed")]
    Storage,
    #[error("MLS operation rejected")]
    Crypto,
    #[error("invalid or unsupported input")]
    Input,
    #[error("unknown group or identity")]
    Missing,
    #[error("operation identifier already used for different input")]
    Conflict,
    #[error("injected failure before durable commit")]
    BeforeCommit,
    #[error("injected failure after durable commit; recover outbox")]
    AfterCommit,
}
pub type Result<T> = std::result::Result<T, Error>;
fn db<T, E>(r: std::result::Result<T, E>) -> Result<T> {
    r.map_err(|_| Error::Storage)
}
fn mls<T, E>(r: std::result::Result<T, E>) -> Result<T> {
    r.map_err(|_| Error::Crypto)
}

#[derive(Default)]
struct JsonCodec;
impl Codec for JsonCodec {
    type Error = serde_json::Error;
    fn to_vec<T: Serialize>(value: &T) -> std::result::Result<Vec<u8>, Self::Error> {
        serde_json::to_vec(value)
    }
    fn from_slice<T: serde::de::DeserializeOwned>(
        slice: &[u8],
    ) -> std::result::Result<T, Self::Error> {
        serde_json::from_slice(slice)
    }
}

struct Provider<'a> {
    crypto: &'a Engine,
    storage: SqliteStorageProvider<JsonCodec, &'a Connection>,
}
impl<'a> Provider<'a> {
    fn new(connection: &'a Connection, crypto: &'a Engine) -> Self {
        Self {
            crypto,
            storage: SqliteStorageProvider::new(connection),
        }
    }
}
impl<'a> OpenMlsProvider for Provider<'a> {
    type CryptoProvider = Engine;
    type RandProvider = Engine;
    type StorageProvider = SqliteStorageProvider<JsonCodec, &'a Connection>;
    fn crypto(&self) -> &Self::CryptoProvider {
        self.crypto
    }
    fn rand(&self) -> &Self::RandProvider {
        self.crypto
    }
    fn storage(&self) -> &Self::StorageProvider {
        &self.storage
    }
}

/// Failure controls exist only in this isolated prototype, not in the app.
#[derive(Clone, Copy, Default)]
pub enum Fault {
    #[default]
    None,
    BeforeCommit,
    AfterCommit,
    CrashBeforeCommit,
    CrashAfterCommit,
}

/// Bytes are intentionally not Debug: no plaintext/key/message dumps on error.
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct Outbound {
    pub message: Vec<u8>,
    pub welcome: Option<Vec<u8>>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Received {
    Application,
    Commit,
}

/// Successful transaction timings only; contains no identity, key or payload.
/// Work includes MLS AND its SQLite calls, not isolated cryptographic CPU time.
#[derive(Clone, Copy, Debug, Default)]
pub struct TransactionTiming {
    pub begin_ms: f64,
    pub group_load_ms: f64,
    pub work_and_sql_ms: f64,
    pub commit_ms: f64,
}

fn elapsed_ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}

/// Exclusive actor-like ownership, plus SQLite BEGIN IMMEDIATE for competing
/// processes. No cached MlsGroup survives a failed transaction.
pub struct Device {
    connection: Connection,
    crypto: Engine,
    last_transaction: Option<TransactionTiming>,
}

fn decode(wire: &[u8]) -> Result<MlsMessageIn> {
    if wire.len() < 4 || wire.len() > MAX_WIRE || wire[..2] != [0, 1] {
        return Err(Error::Input);
    }
    let mut reader = Cursor::new(wire);
    let decoded = mls(MlsMessageIn::tls_deserialize(&mut reader))?;
    if reader.position() != wire.len() as u64 {
        return Err(Error::Input);
    }
    Ok(decoded)
}
fn encode(message: MlsMessageOut) -> Result<Vec<u8>> {
    let wire = mls(message.tls_serialize_detached())?;
    if wire.len() > MAX_WIRE {
        return Err(Error::Input);
    }
    Ok(wire)
}
fn load(provider: &Provider<'_>, group: &[u8]) -> Result<MlsGroup> {
    db(MlsGroup::load(
        provider.storage(),
        &GroupId::from_slice(group),
    ))?
    .ok_or(Error::Missing)
}
fn signer(
    connection: &Connection,
    provider: &Provider<'_>,
) -> Result<(CredentialWithKey, SignatureKeyPair)> {
    let (identity, public): (Vec<u8>, Vec<u8>) = db(connection.query_row(
        "SELECT identity, public_key FROM probe_device WHERE singleton=1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ))?;
    let key = SignatureKeyPair::read(provider.storage(), &public, SUITE.signature_algorithm())
        .ok_or(Error::Missing)?;
    Ok((
        CredentialWithKey {
            credential: BasicCredential::new(identity).into(),
            signature_key: public.into(),
        },
        key,
    ))
}
fn group_input(group: &[u8]) -> Result<()> {
    if group.is_empty() || group.len() > 64 {
        return Err(Error::Input);
    }
    Ok(())
}

impl Device {
    /// The caller owns a private temporary directory. Never point at real data.
    pub fn open_synthetic(path: &Path) -> Result<Self> {
        let mut connection = db(Connection::open(path))?;
        db(connection.busy_timeout(Duration::from_secs(2)))?;
        db(connection.execute_batch("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;"))?;
        db(SqliteStorageProvider::<JsonCodec, _>::new(&mut connection).run_migrations())?;
        // Versioned laboratory schema, independent of the application DB.
        db(connection.execute_batch(include_str!("../schema/001-probe.sql")))?;
        #[cfg(not(feature = "libcrux"))]
        let crypto = Engine::default();
        #[cfg(feature = "libcrux")]
        let crypto = mls(Engine::new())?;
        Ok(Self {
            connection,
            crypto,
            last_transaction: None,
        })
    }

    fn atomic<T>(
        &mut self,
        fault: Fault,
        op: impl FnOnce(&Connection, &Provider<'_>) -> Result<T>,
    ) -> Result<T> {
        self.atomic_profiled(fault, |tx, provider, _timing| op(tx, provider))
    }

    /// Diagnostic accessor, never a success flag or authorization decision.
    pub fn last_transaction_timing(&self) -> Option<TransactionTiming> {
        self.last_transaction
    }

    fn atomic_profiled<T>(
        &mut self,
        fault: Fault,
        op: impl FnOnce(&Connection, &Provider<'_>, &mut TransactionTiming) -> Result<T>,
    ) -> Result<T> {
        self.last_transaction = None;
        let mut timing = TransactionTiming::default();
        let started = Instant::now();
        let tx = db(self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate))?;
        timing.begin_ms = elapsed_ms(started);
        let started = Instant::now();
        let value = {
            let provider = Provider::new(&tx, &self.crypto);
            op(&tx, &provider, &mut timing)?
        };
        timing.work_and_sql_ms = (elapsed_ms(started) - timing.group_load_ms).max(0.0);
        match fault {
            Fault::BeforeCommit => return Err(Error::BeforeCommit),
            Fault::CrashBeforeCommit => std::process::exit(86),
            _ => {}
        }
        let started = Instant::now();
        db(tx.commit())?;
        timing.commit_ms = elapsed_ms(started);
        match fault {
            Fault::AfterCommit => return Err(Error::AfterCommit),
            Fault::CrashAfterCommit => std::process::exit(87),
            _ => {}
        }
        self.last_transaction = Some(timing);
        Ok(value)
    }

    /// Opaque fixture identity, NOT CircleHaven's future approved credential.
    pub fn initialize(&mut self, identity: &[u8]) -> Result<()> {
        if identity.is_empty() || identity.len() > 64 {
            return Err(Error::Input);
        }
        self.atomic(Fault::None, |tx, provider| {
            let key = mls(SignatureKeyPair::new(SUITE.signature_algorithm()))?;
            db(key.store(provider.storage()))?;
            db(tx.execute(
                "INSERT INTO probe_device VALUES(1,?1,?2)",
                params![identity, key.public()],
            ))?;
            Ok(())
        })
    }

    pub fn key_package(&mut self) -> Result<Vec<u8>> {
        self.key_package_with_lifetime(Lifetime::default())
    }

    pub fn key_package_with_lifetime(&mut self, lifetime: Lifetime) -> Result<Vec<u8>> {
        self.atomic(Fault::None, |tx, provider| {
            let (credential, key) = signer(tx, provider)?;
            let bundle = mls(KeyPackage::builder()
                .key_package_lifetime(lifetime)
                .build(SUITE, provider, &key, credential))?;
            encode(bundle.into())
        })
    }

    pub fn create(&mut self, group: &[u8], fault: Fault) -> Result<()> {
        group_input(group)?;
        self.atomic(fault, |tx, provider| {
            if db(MlsGroup::load(
                provider.storage(),
                &GroupId::from_slice(group),
            ))?
            .is_some()
            {
                return Err(Error::Conflict);
            }
            let (credential, key) = signer(tx, provider)?;
            let config = MlsGroupCreateConfig::builder()
                .ciphersuite(SUITE)
                .wire_format_policy(PURE_CIPHERTEXT_WIRE_FORMAT_POLICY)
                .use_ratchet_tree_extension(true)
                .max_past_epochs(0)
                .sender_ratchet_configuration(SenderRatchetConfiguration::new(32, 256))
                .build();
            mls(MlsGroup::new_with_group_id(
                provider,
                &key,
                &config,
                GroupId::from_slice(group),
                credential,
            ))?;
            Ok(())
        })
    }

    fn prepare(
        &mut self,
        group: &[u8],
        operation: &str,
        input: &[u8],
        fault: Fault,
        op: impl FnOnce(&Provider<'_>, &mut MlsGroup, &SignatureKeyPair) -> Result<Outbound>,
    ) -> Result<Outbound> {
        group_input(group)?;
        if operation.is_empty() || operation.len() > 64 || !operation.is_ascii() {
            return Err(Error::Input);
        }
        let fingerprint = Sha256::digest(input).to_vec();
        self.atomic(fault, |tx, provider| {
            let previous: Option<(Vec<u8>, Vec<u8>, Vec<u8>)> = db(tx
                .query_row(
                    "SELECT group_id, fingerprint, wire FROM probe_outbox WHERE operation=?1",
                    [operation],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional())?;
            if let Some((old_group, old_fingerprint, wire)) = previous {
                if old_group != group || old_fingerprint != fingerprint {
                    return Err(Error::Conflict);
                }
                return db(serde_json::from_slice(&wire));
            }
            let (_, key) = signer(tx, provider)?;
            let mut state = load(provider, group)?;
            let outbound = op(provider, &mut state, &key)?;
            if state.pending_commit().is_some() {
                db(tx.execute(
                    "INSERT INTO probe_pending VALUES(?1,?2)",
                    params![group, outbound.message],
                ))?;
            }
            let wire = db(serde_json::to_vec(&outbound))?;
            db(tx.execute(
                "INSERT INTO probe_outbox VALUES(?1,?2,?3,?4)",
                params![operation, group, fingerprint, wire],
            ))?;
            Ok(outbound)
        })
    }

    pub fn add(
        &mut self,
        group: &[u8],
        operation: &str,
        packages: &[Vec<u8>],
        fault: Fault,
    ) -> Result<Outbound> {
        if packages.is_empty()
            || packages.len() >= MAX_MEMBERS
            || packages.iter().any(|p| p.len() > MAX_WIRE)
            || packages.iter().map(Vec::len).sum::<usize>() > MAX_WIRE
        {
            return Err(Error::Input);
        }
        let fingerprint = db(serde_json::to_vec(&("add", packages)))?;
        self.prepare(
            group,
            operation,
            &fingerprint,
            fault,
            |provider, state, key| {
                if state.members().count() + packages.len() > MAX_MEMBERS {
                    return Err(Error::Input);
                }
                let keys = packages
                    .iter()
                    .map(|wire| {
                        let MlsMessageBodyIn::KeyPackage(package) = decode(wire)?.extract() else {
                            return Err(Error::Input);
                        };
                        let package =
                            mls(package.validate(provider.crypto(), ProtocolVersion::Mls10))?;
                        if package.ciphersuite() != SUITE {
                            return Err(Error::Input);
                        }
                        Ok(package)
                    })
                    .collect::<Result<Vec<_>>>()?;
                let (commit, welcome, _) = mls(state.add_members(provider, key, &keys))?;
                Ok(Outbound {
                    message: encode(commit)?,
                    welcome: Some(encode(welcome)?),
                })
            },
        )
    }

    pub fn update(&mut self, group: &[u8], operation: &str, fault: Fault) -> Result<Outbound> {
        self.prepare(
            group,
            operation,
            b"update",
            fault,
            |provider, state, key| {
                let bundle = mls(state.self_update(provider, key, LeafNodeParameters::default()))?;
                Ok(Outbound {
                    message: encode(bundle.into_commit())?,
                    welcome: None,
                })
            },
        )
    }

    pub fn remove(
        &mut self,
        group: &[u8],
        operation: &str,
        leaf: u32,
        fault: Fault,
    ) -> Result<Outbound> {
        self.remove_many(group, operation, &[leaf], fault)
    }

    pub fn remove_many(
        &mut self,
        group: &[u8],
        operation: &str,
        leaves: &[u32],
        fault: Fault,
    ) -> Result<Outbound> {
        if leaves.is_empty() || leaves.len() >= MAX_MEMBERS {
            return Err(Error::Input);
        }
        self.prepare(
            group,
            operation,
            &db(serde_json::to_vec(&("remove", leaves)))?,
            fault,
            |provider, state, key| {
                let indices: Vec<_> = leaves.iter().copied().map(LeafNodeIndex::new).collect();
                let (commit, _, _) = mls(state.remove_members(provider, key, &indices))?;
                Ok(Outbound {
                    message: encode(commit)?,
                    welcome: None,
                })
            },
        )
    }

    pub fn send(
        &mut self,
        group: &[u8],
        operation: &str,
        plaintext: &[u8],
        fault: Fault,
    ) -> Result<Outbound> {
        if plaintext.len() > MAX_PLAINTEXT {
            return Err(Error::Input);
        }
        self.prepare(
            group,
            operation,
            &db(serde_json::to_vec(&("message", plaintext)))?,
            fault,
            |provider, state, key| {
                Ok(Outbound {
                    message: encode(mls(state.create_message(provider, key, plaintext))?)?,
                    welcome: None,
                })
            },
        )
    }

    pub fn join(&mut self, expected_group: &[u8], welcome: &[u8], fault: Fault) -> Result<()> {
        group_input(expected_group)?;
        let message = decode(welcome)?;
        self.atomic(fault, |_tx, provider| {
            if db(MlsGroup::load(
                provider.storage(),
                &GroupId::from_slice(expected_group),
            ))?
            .is_some()
            {
                return Err(Error::Conflict);
            }
            let MlsMessageBodyIn::Welcome(welcome) = message.extract() else {
                return Err(Error::Input);
            };
            if welcome.ciphersuite() != SUITE {
                return Err(Error::Input);
            }
            let config = MlsGroupJoinConfig::builder()
                .wire_format_policy(PURE_CIPHERTEXT_WIRE_FORMAT_POLICY)
                .max_past_epochs(0)
                .sender_ratchet_configuration(SenderRatchetConfiguration::new(32, 256))
                .build();
            let staged = mls(StagedWelcome::new_from_welcome(
                provider, &config, welcome, None,
            ))?;
            if staged.group_context().group_id().as_slice() != expected_group
                || staged.members().count() > MAX_MEMBERS
            {
                return Err(Error::Input);
            }
            mls(staged.into_group(provider))?;
            Ok(())
        })
    }

    /// The author cannot decrypt its own PrivateMessage again. Only an exact
    /// match with its atomically persisted pending ciphertext may confirm it.
    /// OpenMLS's OwnPrivateMessage hint alone is NEVER sufficient authority.
    pub fn receive(&mut self, group: &[u8], wire: &[u8], fault: Fault) -> Result<Received> {
        self.last_transaction = None;
        group_input(group)?;
        let message = decode(wire)?;
        if message.wire_format() != WireFormat::PrivateMessage {
            return Err(Error::Input);
        }
        self.atomic_profiled(fault, |tx, provider, timing| {
            let started = Instant::now();
            let mut state = load(provider, group)?;
            timing.group_load_ms = elapsed_ms(started);
            let own: Option<Vec<u8>> = db(tx
                .query_row(
                    "SELECT wire FROM probe_pending WHERE group_id=?1",
                    [group],
                    |r| r.get(0),
                )
                .optional())?;
            if own.as_deref() == Some(wire) {
                if state.pending_commit().is_none() {
                    return Err(Error::Conflict);
                }
                mls(state.merge_pending_commit(provider))?;
                db(tx.execute("DELETE FROM probe_pending WHERE group_id=?1", [group]))?;
                return Ok(Received::Commit);
            }
            let protocol = mls(message.try_into_protocol_message())?;
            let processed = mls(state.process_message(provider, protocol))?;
            match processed.into_content() {
                ProcessedMessageContent::ApplicationMessage(message) => {
                    let payload = message.into_bytes();
                    if payload.len() > MAX_PLAINTEXT {
                        return Err(Error::Input);
                    }
                    db(tx.execute(
                        "INSERT INTO probe_inbox(group_id,payload) VALUES(?1,?2)",
                        params![group, payload],
                    ))?;
                    Ok(Received::Application)
                }
                ProcessedMessageContent::StagedCommitMessage(commit) => {
                    mls(state.merge_staged_commit(provider, *commit))?;
                    if state.members().count() > MAX_MEMBERS {
                        return Err(Error::Input);
                    }
                    db(tx.execute("DELETE FROM probe_pending WHERE group_id=?1", [group]))?;
                    Ok(Received::Commit)
                }
                _ => Err(Error::Input),
            }
        })
    }

    /// Application-only batch: every message authenticates and all ratchet/inbox
    /// writes commit together. A bad message rolls back the entire batch.
    /// Commits must be delivered separately in epoch order.
    pub fn receive_batch(
        &mut self,
        group: &[u8],
        wires: &[Vec<u8>],
        fault: Fault,
    ) -> Result<usize> {
        self.last_transaction = None;
        group_input(group)?;
        if wires.is_empty()
            || wires.len() > MAX_BATCH
            || wires.iter().any(|wire| wire.len() > MAX_WIRE)
            || wires.iter().map(Vec::len).sum::<usize>() > MAX_WIRE
        {
            return Err(Error::Input);
        }
        let messages = wires
            .iter()
            .map(|wire| {
                let message = decode(wire)?;
                if message.wire_format() != WireFormat::PrivateMessage {
                    return Err(Error::Input);
                }
                mls(message.try_into_protocol_message())
            })
            .collect::<Result<Vec<_>>>()?;
        self.atomic_profiled(fault, |tx, provider, timing| {
            let started = Instant::now();
            let mut state = load(provider, group)?;
            timing.group_load_ms = elapsed_ms(started);
            for message in messages {
                let processed = mls(state.process_message(provider, message))?;
                let ProcessedMessageContent::ApplicationMessage(message) = processed.into_content()
                else {
                    return Err(Error::Input);
                };
                let payload = message.into_bytes();
                if payload.len() > MAX_PLAINTEXT {
                    return Err(Error::Input);
                }
                db(tx.execute(
                    "INSERT INTO probe_inbox(group_id,payload) VALUES(?1,?2)",
                    params![group, payload],
                ))?;
            }
            Ok(wires.len())
        })
    }

    pub fn epoch(&self, group: &[u8]) -> Result<u64> {
        Ok(load(&Provider::new(&self.connection, &self.crypto), group)?
            .epoch()
            .as_u64())
    }
    pub fn members(&self, group: &[u8]) -> Result<Vec<u32>> {
        Ok(load(&Provider::new(&self.connection, &self.crypto), group)?
            .members()
            .map(|m| m.index.u32())
            .collect())
    }
    pub fn inbox(&self, group: &[u8]) -> Result<Vec<Vec<u8>>> {
        let mut statement = db(self
            .connection
            .prepare("SELECT payload FROM probe_inbox WHERE group_id=?1 ORDER BY sequence"))?;
        let rows = db(statement.query_map([group], |r| r.get(0)))?;
        db(rows.collect())
    }
    pub fn outbox(&self, operation: &str) -> Result<Outbound> {
        let wire: Vec<u8> = db(self.connection.query_row(
            "SELECT wire FROM probe_outbox WHERE operation=?1",
            [operation],
            |r| r.get(0),
        ))?;
        db(serde_json::from_slice(&wire))
    }
}

#[cfg(test)]
mod storage_tests {
    use super::*;

    #[test]
    fn sqlite_full_does_not_consume_sender_state_without_outbox() {
        let dir = tempfile::tempdir().unwrap();
        let mut a = Device::open_synthetic(&dir.path().join("a")).unwrap();
        let mut b = Device::open_synthetic(&dir.path().join("b")).unwrap();
        a.initialize(b"synthetic-a").unwrap();
        b.initialize(b"synthetic-b").unwrap();
        let group = b"disk-full";
        a.create(group, Fault::None).unwrap();
        let kp = b.key_package().unwrap();
        let add = a.add(group, "add", &[kp], Fault::None).unwrap();
        a.receive(group, &add.message, Fault::None).unwrap();
        b.join(group, add.welcome.as_ref().unwrap(), Fault::None)
            .unwrap();
        let pages: u32 = a
            .connection
            .pragma_query_value(None, "page_count", |r| r.get(0))
            .unwrap();
        a.connection
            .pragma_update(None, "max_page_count", pages)
            .unwrap();
        let payload = vec![0x41; MAX_PLAINTEXT];
        assert!(a.send(group, "full", &payload, Fault::None).is_err());
        assert!(a.outbox("full").is_err());
        assert_eq!(a.epoch(group).unwrap(), 1);
        a.connection
            .pragma_update(None, "max_page_count", pages + 1000)
            .unwrap();
        let wire = a.send(group, "full", &payload, Fault::None).unwrap();
        b.receive(group, &wire.message, Fault::None).unwrap();
        assert!(b.inbox(group).unwrap() == [payload]);
    }
}
