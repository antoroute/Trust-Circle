//! C1g-1 executable policy experiment, compiled ONLY for unit tests.
//! Pins, prior roles and requests are trusted FIXTURES, not verified proofs.
//! No wire format, signature scheme, production validator or durable ledger.
use super::*;
use std::collections::BTreeMap;

#[path = "authenticated_proposal_tests.rs"]
mod authenticated_proposal_tests;

const GROUP: &[u8] = b"fixture-env/circle/conversation/generation-1";

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct Identity {
    account: u8,
    account_incarnation: u8,
    device: u8,
    device_incarnation: u8,
}

fn id(account: u8, device: u8) -> Identity {
    Identity {
        account,
        account_incarnation: 1,
        device,
        device_incarnation: 1,
    }
}

#[derive(Clone)]
struct Pin {
    credential: Credential,
    key: Vec<u8>,
    identity: Identity,
    version: u32,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Role {
    Owner,
    Admin,
    Member,
}

#[derive(Clone, Copy)]
enum Target {
    Device(Identity),
    Account(u8, u8),
}

impl Target {
    fn covers(self, identity: Identity) -> bool {
        match self {
            Self::Device(target) => identity == target,
            Self::Account(account, incarnation) => {
                identity.account == account && identity.account_incarnation == incarnation
            }
        }
    }
}

#[derive(Clone)]
struct Request {
    issuer: Identity,
    target: Target,
}

/// This object is not deserializable and is NEVER constructed from a server
/// notice. Tests inject all trust roots/requests. Equality with a fixture is
/// not a cryptographic verification of the identity/authority it represents.
#[derive(Clone)]
struct FixturePolicy {
    group: Vec<u8>,
    epoch: u64,
    authenticator: Vec<u8>,
    pins: Vec<Pin>,
    active: BTreeSet<Identity>,
    roles: BTreeMap<(u8, u8), Role>,
    requests: Vec<Request>,
}

impl FixturePolicy {
    fn pin(&self, credential: &Credential, key: &[u8]) -> Result<&Pin> {
        let mut matches = self
            .pins
            .iter()
            .filter(|p| p.credential == *credential && p.key == key);
        let pin = matches.next().ok_or(Error::PolicyEvidenceRequired)?;
        if matches.next().is_some() {
            return Err(Error::PolicyRejected);
        }
        Ok(pin)
    }

    fn successor(&self, before: &Pin, leaf: &LeafNode) -> Result<()> {
        let after = self.pin(leaf.credential(), leaf.signature_key().as_slice())?;
        if after.identity != before.identity
            || (after.credential != before.credential || after.key != before.key)
                && before.version.checked_add(1) != Some(after.version)
        {
            return Err(Error::PolicyRejected);
        }
        Ok(())
    }

    fn validate(&self, state: &MlsGroup, sender: &Sender, commit: &StagedCommit) -> Result<()> {
        if self.group != state.group_id().as_slice() {
            return Err(Error::PolicyRejected);
        }
        if self.epoch != state.epoch().as_u64()
            || self.authenticator != state.epoch_authenticator().as_slice()
        {
            return Err(Error::PolicyEvidenceRequired);
        }
        if self.pins.len() > MAX_MEMBERS * 2 || self.requests.len() > MAX_MEMBERS {
            return Err(Error::Input);
        }
        if self.requests.is_empty() {
            return Err(Error::PolicyEvidenceRequired);
        }
        let mut members = BTreeMap::new();
        let mut identities = BTreeSet::new();
        for member in state.members() {
            let pin = self.pin(&member.credential, &member.signature_key)?;
            if !identities.insert(pin.identity) {
                return Err(Error::PolicyRejected);
            }
            members.insert(member.index, pin);
        }
        let Sender::Member(executor) = sender else {
            return Err(Error::PolicyRejected);
        };
        let executor = members.get(executor).ok_or(Error::PolicyRejected)?;
        if !self.active.contains(&executor.identity) {
            return Err(Error::PolicyRejected);
        }

        // Authority is resolved from the fixture's PRIOR view, not the committer
        // or a proposed role. No general admin privilege is granted to executor.
        for request in &self.requests {
            if !self.active.contains(&request.issuer) {
                return Err(Error::PolicyRejected);
            }
            match request.target {
                Target::Device(target) => {
                    if (request.issuer.account, request.issuer.account_incarnation)
                        != (target.account, target.account_incarnation)
                    {
                        return Err(Error::PolicyRejected);
                    }
                }
                Target::Account(account, incarnation) => {
                    let role = self
                        .roles
                        .get(&(request.issuer.account, request.issuer.account_incarnation))
                        .ok_or(Error::PolicyEvidenceRequired)?;
                    let target_role = self
                        .roles
                        .get(&(account, incarnation))
                        .ok_or(Error::PolicyEvidenceRequired)?;
                    if !matches!(role, Role::Owner | Role::Admin) || *target_role == Role::Owner {
                        return Err(Error::PolicyRejected);
                    }
                }
            }
            if request.target.covers(executor.identity) {
                return Err(Error::PolicyRejected);
            }
        }
        for proposal in commit.queued_proposals() {
            // No referenced/third-party proposals in this deliberately narrow
            // experiment. In the full protocol, absent references mean WAIT.
            if proposal.proposal_or_ref_type() != ProposalOrRefType::Proposal
                || proposal.sender() != sender
            {
                return Err(Error::PolicyRejected);
            }
            let Proposal::Remove(remove) = proposal.proposal() else {
                return Err(Error::PolicyRejected);
            };
            let removed = members
                .get(&remove.removed())
                .ok_or(Error::PolicyRejected)?;
            if !self
                .requests
                .iter()
                .any(|r| r.target.covers(removed.identity))
            {
                return Err(Error::PolicyRejected);
            }
        }
        // An UpdatePath can replace the credential without an Update proposal.
        if let Some(leaf) = commit.update_path_leaf_node() {
            self.successor(executor, leaf)?;
        }
        // Acceptance of a control is NOT satisfaction of all requests. In
        // particular a pure self-update or partial removal does not unlock Q3.
        Ok(())
    }
}

fn receive(
    device: &mut Device,
    wire: &[u8],
    policy: &FixturePolicy,
    fault: Fault,
) -> Result<Received> {
    device.receive_with_commit_policy_synthetic(GROUP, wire, fault, |state, sender, staged| {
        policy.validate(state, sender, staged)
    })
}

fn fixture() -> (tempfile::TempDir, [Device; 4], FixturePolicy) {
    let dir = tempfile::tempdir().unwrap();
    let mut devices = std::array::from_fn::<_, 4, _>(|n| {
        let mut device = Device::open_synthetic(&dir.path().join(n.to_string())).unwrap();
        device
            .initialize(format!("synthetic-{n}").as_bytes())
            .unwrap();
        device
    });
    devices[0].create(GROUP, Fault::None).unwrap();
    let packages: Vec<_> = devices[1..]
        .iter_mut()
        .map(|d| d.key_package().unwrap())
        .collect();
    let added = devices[0]
        .add(GROUP, "initial", &packages, Fault::None)
        .unwrap();
    devices[0]
        .receive(GROUP, &added.message, Fault::None)
        .unwrap();
    let welcome = devices[0].outbox("initial").unwrap().welcome.unwrap();
    for d in &mut devices[1..] {
        d.join(GROUP, &welcome, Fault::None).unwrap();
    }
    let identities = [id(1, 1), id(2, 1), id(3, 1), id(3, 2)];
    let pins = devices
        .iter()
        .zip(identities)
        .map(|(device, identity)| {
            let (credential, _) = signer(
                &device.connection,
                &Provider::new(&device.connection, &device.crypto),
            )
            .unwrap();
            Pin {
                credential: credential.credential,
                key: credential.signature_key.as_slice().to_vec(),
                identity,
                version: 1,
            }
        })
        .collect();
    let state = load(
        &Provider::new(&devices[0].connection, &devices[0].crypto),
        GROUP,
    )
    .unwrap();
    let policy = FixturePolicy {
        group: GROUP.to_vec(),
        epoch: state.epoch().as_u64(),
        authenticator: state.epoch_authenticator().as_slice().to_vec(),
        pins,
        active: identities.into_iter().collect(),
        roles: [
            ((1, 1), Role::Owner),
            ((2, 1), Role::Member),
            ((3, 1), Role::Member),
        ]
        .into_iter()
        .collect(),
        requests: vec![Request {
            issuer: id(1, 1),
            target: Target::Account(3, 1),
        }],
    };
    (dir, devices, policy)
}

fn leaves(device: &Device, policy: &FixturePolicy, target: Target) -> Vec<u32> {
    let state = load(&Provider::new(&device.connection, &device.crypto), GROUP).unwrap();
    state
        .members()
        .filter_map(|m| {
            let identity = policy
                .pin(&m.credential, &m.signature_key)
                .unwrap()
                .identity;
            target.covers(identity).then_some(m.index.u32())
        })
        .collect()
}

#[test]
fn ordinary_participant_executes_exact_removal_without_unlocking() {
    let (_dir, mut devices, policy) = fixture();
    let targets = leaves(&devices[1], &policy, Target::Account(3, 1));
    assert_eq!(targets.len(), 2);
    for d in &mut devices {
        d.hold_group_synthetic(GROUP, Fault::None).unwrap();
    }
    let commit = devices[1]
        .remove_many(GROUP, "remove", &targets, Fault::None)
        .unwrap();
    for d in &mut devices {
        assert_eq!(
            receive(d, &commit.message, &policy, Fault::None),
            Ok(Received::Commit)
        );
        assert_eq!(d.group_publication_held(GROUP), Ok(true));
        assert!(matches!(
            d.send(GROUP, "still-held", b"synthetic", Fault::None),
            Err(Error::GroupHeld)
        ));
    }
    // Removed recipients can process their eviction, not confirm future secrets.
    assert_eq!(devices[0].members(GROUP).unwrap().len(), 2);
}

#[test]
fn authority_scope_incarnation_and_executor_are_distinct_checks() {
    let (_dir, mut devices, policy) = fixture();
    let targets = leaves(&devices[1], &policy, Target::Account(3, 1));
    let commit = devices[1]
        .remove_many(GROUP, "remove", &targets, Fault::None)
        .unwrap();
    let mut wrong_issuer = policy.clone();
    wrong_issuer.requests[0].issuer = id(2, 1); // executor is not an admin
    let mut wrong_account = policy.clone();
    wrong_account.requests[0].target = Target::Device(id(3, 1)); // issuer belongs to account 1
    let mut wrong_generation = policy.clone();
    wrong_generation.requests[0].target = Target::Device(Identity {
        device_incarnation: 2,
        ..id(3, 1)
    });
    wrong_generation.requests[0].issuer = id(3, 2);
    let mut revoked_executor = policy.clone();
    revoked_executor.active.remove(&id(2, 1));
    let mut targeted_executor = policy.clone();
    targeted_executor.requests.push(Request {
        issuer: id(1, 1),
        target: Target::Account(2, 1),
    });
    let mut wrong_scope = policy.clone();
    wrong_scope.group = b"fixture-other-generation".to_vec();
    let mut unknown_authority = policy.clone();
    unknown_authority.requests[0].issuer = id(4, 1);
    for bad in [
        wrong_issuer,
        wrong_account,
        wrong_generation,
        revoked_executor,
        targeted_executor,
        wrong_scope,
        unknown_authority,
    ] {
        assert_eq!(
            receive(&mut devices[0], &commit.message, &bad, Fault::None),
            Err(Error::PolicyRejected)
        );
        assert_eq!(devices[0].epoch(GROUP), Ok(policy.epoch));
    }
    let mut admin = policy.clone();
    admin.roles.insert((2, 1), Role::Admin); // explicit prior-role fixture, not server JSON
    admin.requests[0].issuer = id(2, 1);
    assert_eq!(
        receive(&mut devices[0], &commit.message, &admin, Fault::None),
        Ok(Received::Commit)
    );
}

#[test]
fn missing_or_ambiguous_pins_and_stale_view_do_not_consume_a_candidate() {
    let (_dir, mut devices, policy) = fixture();
    let leaf = leaves(&devices[1], &policy, Target::Device(id(3, 1)))[0];
    let commit = devices[1]
        .remove(GROUP, "remove", leaf, Fault::None)
        .unwrap();
    let mut absent = policy.clone();
    absent.pins.pop(); // even an unrelated member must resolve before acceptance
    let mut wrong_key = policy.clone();
    wrong_key.pins[1].key[0] ^= 1; // same credential string is not enough
    let mut stale = policy.clone();
    stale.epoch += 1;
    let mut other_branch = policy.clone();
    other_branch.authenticator[0] ^= 1; // same epoch number, different view
    let mut missing_request = policy.clone();
    missing_request.requests.clear();
    for missing in [absent, wrong_key, stale, other_branch, missing_request] {
        assert_eq!(
            receive(&mut devices[0], &commit.message, &missing, Fault::None),
            Err(Error::PolicyEvidenceRequired)
        );
    }
    let mut ambiguous = policy.clone();
    ambiguous.pins.push(policy.pins[1].clone());
    assert_eq!(
        receive(&mut devices[0], &commit.message, &ambiguous, Fault::None),
        Err(Error::PolicyRejected)
    );
    assert_eq!(
        receive(&mut devices[0], &commit.message, &policy, Fault::None),
        Ok(Received::Commit)
    );
    // Partial account removal is allowed as progress, not completion.
    assert_eq!(leaves(&devices[0], &policy, Target::Account(3, 1)).len(), 1);
}

#[test]
fn same_account_device_request_needs_no_admin_but_owner_removal_is_rejected() {
    let (_dir, mut devices, mut policy) = fixture();
    policy.requests = vec![Request {
        issuer: id(3, 2),
        target: Target::Device(id(3, 1)),
    }];
    let target = leaves(&devices[1], &policy, Target::Device(id(3, 1)))[0];
    let commit = devices[1]
        .remove(GROUP, "device", target, Fault::None)
        .unwrap();
    assert_eq!(
        receive(&mut devices[0], &commit.message, &policy, Fault::None),
        Ok(Received::Commit)
    );

    let (_dir, mut devices, mut policy) = fixture();
    policy.roles.insert((2, 1), Role::Admin);
    policy.requests = vec![Request {
        issuer: id(2, 1),
        target: Target::Account(1, 1),
    }];
    let owner = leaves(&devices[1], &policy, Target::Account(1, 1))[0];
    let commit = devices[1]
        .remove(GROUP, "owner", owner, Fault::None)
        .unwrap();
    assert_eq!(
        receive(&mut devices[0], &commit.message, &policy, Fault::None),
        Err(Error::PolicyRejected)
    );
}

#[test]
fn remote_policy_failure_rolls_back_ratchet_pending_and_outbox_across_restart() {
    let (dir, mut devices, policy) = fixture();
    let old = devices[0]
        .send(GROUP, "old", b"synthetic", Fault::None)
        .unwrap();
    let pending = devices[0].update(GROUP, "pending", Fault::None).unwrap();
    let leaf = leaves(&devices[1], &policy, Target::Device(id(3, 1)))[0];
    let commit = devices[1]
        .remove(GROUP, "remove", leaf, Fault::None)
        .unwrap();
    let mut bad = policy.clone();
    bad.requests[0].issuer = id(2, 1);
    assert_eq!(
        receive(&mut devices[0], &commit.message, &bad, Fault::None),
        Err(Error::PolicyRejected)
    );
    assert!(devices[0].outbox("old").unwrap() == old);
    assert!(devices[0].outbox("pending").unwrap() == pending);
    drop(devices);
    let mut reopened = Device::open_synthetic(&dir.path().join("0")).unwrap();
    assert_eq!(
        receive(&mut reopened, &commit.message, &policy, Fault::BeforeCommit),
        Err(Error::BeforeCommit)
    );
    assert_eq!(reopened.epoch(GROUP), Ok(policy.epoch));
    assert!(reopened.outbox("old").unwrap() == old);
    assert_eq!(
        receive(&mut reopened, &commit.message, &policy, Fault::None),
        Ok(Received::Commit)
    );
    assert!(matches!(reopened.outbox("old"), Err(Error::Superseded)));
    assert!(matches!(reopened.outbox("pending"), Err(Error::Superseded)));
}

#[test]
fn own_echo_policy_cannot_be_bypassed_and_rejection_keeps_pending() {
    let (_dir, mut devices, policy) = fixture();
    let leaf = leaves(&devices[1], &policy, Target::Device(id(3, 1)))[0];
    let commit = devices[1]
        .remove(GROUP, "remove", leaf, Fault::None)
        .unwrap();
    let mut bad = policy.clone();
    bad.requests[0].issuer = id(2, 1);
    assert_eq!(
        receive(&mut devices[1], &commit.message, &bad, Fault::None),
        Err(Error::PolicyRejected)
    );
    assert_eq!(devices[1].epoch(GROUP), Ok(policy.epoch));
    assert!(devices[1].outbox("remove").unwrap() == commit);
    let mut altered = commit.message.clone();
    *altered.last_mut().unwrap() ^= 1;
    assert!(
        devices[1]
            .receive_with_commit_policy_synthetic(GROUP, &altered, Fault::None, |_, _, _| panic!(
                "unauthenticated own hint reached policy"
            ))
            .is_err()
    );
    assert_eq!(
        receive(&mut devices[1], &commit.message, &policy, Fault::None),
        Ok(Received::Commit)
    );
}

#[test]
fn extra_removal_and_remove_plus_add_are_rejected_on_both_paths() {
    let (dir, mut devices, policy) = fixture();
    let owner = leaves(&devices[1], &policy, Target::Account(1, 1))[0];
    let target = leaves(&devices[1], &policy, Target::Device(id(3, 1)))[0];
    let commit = devices[1]
        .remove_many(GROUP, "extra", &[target, owner], Fault::None)
        .unwrap();
    for i in [0, 1] {
        assert_eq!(
            receive(&mut devices[i], &commit.message, &policy, Fault::None),
            Err(Error::PolicyRejected)
        );
    }
    let mut newcomer = Device::open_synthetic(&dir.path().join("newcomer")).unwrap();
    newcomer.initialize(b"synthetic-new").unwrap();
    let kp = newcomer.key_package().unwrap();
    let mixed = devices[2]
        .prepare(
            GROUP,
            "mixed",
            b"synthetic-mixed",
            Fault::None,
            false,
            |provider, state, key| {
                let MlsMessageBodyIn::KeyPackage(kp) = decode(&kp)?.extract() else {
                    return Err(Error::Input);
                };
                let kp = mls(kp.validate(provider.crypto(), ProtocolVersion::Mls10))?;
                let bundle =
                    mls(state.swap_members(provider, key, &[LeafNodeIndex::new(owner)], &[kp]))?;
                Ok(Outbound {
                    message: encode(bundle.commit)?,
                    welcome: Some(encode(bundle.welcome)?),
                })
            },
        )
        .unwrap();
    // Change only the fixture's request to authorize this Remove, never the Add.
    let mut mixed_policy = policy.clone();
    mixed_policy.requests = vec![Request {
        issuer: id(1, 1),
        target: Target::Device(id(1, 1)),
    }];
    for i in [0, 2] {
        assert_eq!(
            devices[i].receive_with_commit_policy_synthetic(
                GROUP,
                &mixed.message,
                Fault::None,
                |state, sender, staged| {
                    assert_eq!(staged.remove_proposals().count(), 1);
                    assert_eq!(staged.add_proposals().count(), 1);
                    let Sender::Member(index) = sender else {
                        panic!("expected member");
                    };
                    let member = state.member_at(*index).unwrap();
                    let path = staged.update_path_leaf_node().unwrap();
                    assert!(path.credential() == &member.credential);
                    assert!(path.signature_key().as_slice() == member.signature_key);
                    mixed_policy.validate(state, sender, staged)
                }
            ),
            Err(Error::PolicyRejected)
        );
    }
    assert!(devices[2].outbox("mixed").unwrap().welcome.is_none());
}

fn update_credential(device: &mut Device, credential: CredentialWithKey) -> Outbound {
    device
        .prepare(
            GROUP,
            "rotate-credential",
            b"synthetic-rotation",
            Fault::None,
            false,
            |provider, state, key| {
                let params = LeafNodeParameters::builder()
                    .with_credential_with_key(credential)
                    .build();
                let bundle = mls(state.self_update(provider, key, params))?;
                Ok(Outbound {
                    message: encode(bundle.into_commit())?,
                    welcome: None,
                })
            },
        )
        .unwrap()
}

#[test]
fn update_path_succession_requires_exact_pin_same_identity_and_next_version() {
    let (_dir, mut devices, policy) = fixture();
    let new_credential: Credential = BasicCredential::new(b"synthetic-rotated".to_vec()).into();
    let new_pin = Pin {
        credential: new_credential.clone(),
        version: 2,
        ..policy.pins[1].clone()
    };
    let update = update_credential(
        &mut devices[1],
        CredentialWithKey {
            credential: new_credential,
            signature_key: new_pin.key.clone().into(),
        },
    );
    assert_eq!(
        receive(&mut devices[0], &update.message, &policy, Fault::None),
        Err(Error::PolicyEvidenceRequired)
    );
    for bad_pin in [
        Pin {
            identity: id(1, 1),
            ..new_pin.clone()
        },
        Pin {
            identity: Identity {
                account_incarnation: 2,
                ..id(2, 1)
            },
            ..new_pin.clone()
        },
        Pin {
            version: 1,
            ..new_pin.clone()
        },
        Pin {
            version: 3,
            ..new_pin.clone()
        },
    ] {
        let mut bad = policy.clone();
        bad.pins.push(bad_pin);
        assert_eq!(
            receive(&mut devices[0], &update.message, &bad, Fault::None),
            Err(Error::PolicyRejected)
        );
    }
    let mut allowed = policy.clone();
    allowed.pins.push(new_pin);
    devices[0].hold_group_synthetic(GROUP, Fault::None).unwrap();
    for i in [0, 1] {
        assert_eq!(
            receive(&mut devices[i], &update.message, &allowed, Fault::None),
            Ok(Received::Commit)
        );
    }
    assert_eq!(
        leaves(&devices[0], &allowed, Target::Account(3, 1)).len(),
        2
    );
    assert_eq!(devices[0].group_publication_held(GROUP), Ok(true));
}

#[test]
fn same_credential_with_new_signing_key_requires_an_explicit_successor_pin() {
    let (_dir, mut devices, policy) = fixture();
    let new_key = SignatureKeyPair::new(SUITE.signature_algorithm()).unwrap();
    let new_pin = Pin {
        key: new_key.public().to_vec(),
        version: 2,
        ..policy.pins[1].clone()
    };
    let credential = CredentialWithKey {
        credential: new_pin.credential.clone(),
        signature_key: new_pin.key.clone().into(),
    };
    let update = devices[1]
        .prepare(
            GROUP,
            "new-key",
            b"synthetic-new-key",
            Fault::None,
            false,
            |provider, state, old_key| {
                let bundle = mls(state.self_update_with_new_signer(
                    provider,
                    old_key,
                    openmls::credentials::NewSignerBundle {
                        signer: &new_key,
                        credential_with_key: credential,
                    },
                    LeafNodeParameters::default(),
                ))?;
                Ok(Outbound {
                    message: encode(bundle.into_commit())?,
                    welcome: None,
                })
            },
        )
        .unwrap();
    for i in [0, 1] {
        assert_eq!(
            receive(&mut devices[i], &update.message, &policy, Fault::None),
            Err(Error::PolicyEvidenceRequired)
        );
    }
    let mut allowed = policy.clone();
    allowed.pins.push(new_pin);
    for i in [0, 1] {
        assert_eq!(
            receive(&mut devices[i], &update.message, &allowed, Fault::None),
            Ok(Received::Commit)
        );
    }
    // Only pre-merge identity binding is tested. Device's operational signer
    // store has NOT been rotated here; no further emission from devices[1].
}

#[test]
fn replacement_leaf_does_not_inherit_authority_or_revocation_of_old_device() {
    let (dir, mut devices, mut policy) = fixture();
    let target = leaves(&devices[1], &policy, Target::Device(id(3, 1)))[0];
    let removed = devices[1]
        .remove(GROUP, "remove", target, Fault::None)
        .unwrap();
    for i in [0, 1] {
        receive(&mut devices[i], &removed.message, &policy, Fault::None).unwrap();
    }
    let mut newcomer = Device::open_synthetic(&dir.path().join("replacement")).unwrap();
    newcomer.initialize(b"synthetic-replacement").unwrap();
    let added = devices[0]
        .add(
            GROUP,
            "replace",
            &[newcomer.key_package().unwrap()],
            Fault::None,
        )
        .unwrap();
    // Historical permissive fixture admission, NOT authorized by removal policy.
    for i in [0, 1] {
        devices[i]
            .receive(GROUP, &added.message, Fault::None)
            .unwrap();
    }
    let state = load(
        &Provider::new(&devices[0].connection, &devices[0].crypto),
        GROUP,
    )
    .unwrap();
    policy.epoch = state.epoch().as_u64();
    policy.authenticator = state.epoch_authenticator().as_slice().to_vec();
    let new_member = state.member_at(LeafNodeIndex::new(target)).unwrap();
    policy.pins.push(Pin {
        credential: new_member.credential,
        key: new_member.signature_key,
        identity: id(4, 1),
        version: 1,
    });
    policy.active.insert(id(4, 1));
    let stale_remove = devices[1]
        .remove(GROUP, "stale-leaf", target, Fault::None)
        .unwrap();
    assert_eq!(
        receive(&mut devices[0], &stale_remove.message, &policy, Fault::None),
        Err(Error::PolicyRejected)
    );
}

#[test]
fn malformed_input_and_applications_never_invoke_commit_policy_and_recovery_wins() {
    let (_dir, mut devices, policy) = fixture();
    let message = devices[1]
        .send(GROUP, "text", b"synthetic", Fault::None)
        .unwrap();
    devices[0]
        .receive_with_commit_policy_synthetic(GROUP, &message.message, Fault::None, |_, _, _| {
            panic!("application reached commit policy")
        })
        .unwrap();
    assert_eq!(devices[0].inbox(GROUP).unwrap().len(), 1);
    let update = devices[1].update(GROUP, "update", Fault::None).unwrap();
    let mut corrupt = update.message.clone();
    *corrupt.last_mut().unwrap() ^= 1;
    assert!(
        devices[0]
            .receive_with_commit_policy_synthetic(GROUP, &corrupt, Fault::None, |_, _, _| panic!(
                "unauthenticated input reached policy"
            ))
            .is_err()
    );
    devices[0].require_reactivation().unwrap();
    assert_eq!(
        receive(&mut devices[0], &update.message, &policy, Fault::None),
        Err(Error::RecoveryRequired)
    );
    assert_eq!(devices[0].inbox(GROUP).unwrap().len(), 1);
}
