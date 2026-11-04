//! C1g-2a: actual MLS-authenticated sources, with explicitly injected initial
//! identity pins/roles. ONLY test code; no V3 proof format or account root.
//! A Remove means this leaf in this group/epoch, never a global account ban.
use super::*;

struct PriorView(FixturePolicy);

impl PriorView {
    fn check_view(&self, state: &MlsGroup) -> Result<()> {
        if self.0.group != state.group_id().as_slice() {
            return Err(Error::PolicyRejected);
        }
        if self.0.epoch != state.epoch().as_u64()
            || self.0.authenticator != state.epoch_authenticator().as_slice()
        {
            return Err(Error::PolicyEvidenceRequired);
        }
        if self.0.pins.len() > MAX_MEMBERS * 2 {
            return Err(Error::Input);
        }
        let mut identities = BTreeSet::new();
        for member in state.members() {
            let pin = self.0.pin(&member.credential, &member.signature_key)?;
            if !identities.insert(pin.identity) {
                return Err(Error::PolicyRejected);
            }
        }
        Ok(())
    }

    fn member<'a>(&'a self, state: &MlsGroup, index: LeafNodeIndex) -> Result<&'a Pin> {
        let member = state.member_at(index).ok_or(Error::PolicyRejected)?;
        self.0.pin(&member.credential, &member.signature_key)
    }

    fn sender<'a>(&'a self, state: &MlsGroup, sender: &Sender) -> Result<&'a Pin> {
        let Sender::Member(index) = sender else {
            return Err(Error::PolicyRejected);
        };
        let pin = self.member(state, *index)?;
        if !self.0.active.contains(&pin.identity) {
            return Err(Error::PolicyRejected);
        }
        Ok(pin)
    }

    /// Only called on a proposal authenticated by MLS or loaded from its local
    /// store. There is NO caller-supplied issuer, role, target or verified flag.
    fn request(&self, state: &MlsGroup, proposal: &QueuedProposal) -> Result<Request> {
        self.check_view(state)?;
        if proposal.proposal_or_ref_type() != ProposalOrRefType::Reference {
            return Err(Error::PolicyRejected);
        }
        let issuer = self.sender(state, proposal.sender())?.identity;
        let Proposal::Remove(remove) = proposal.proposal() else {
            return Err(Error::PolicyRejected);
        };
        let target = self.member(state, remove.removed())?.identity;
        if issuer == target {
            return Err(Error::PolicyRejected);
        }
        let own_account = (issuer.account, issuer.account_incarnation)
            == (target.account, target.account_incarnation);
        if !own_account {
            let issuer_role = self
                .0
                .roles
                .get(&(issuer.account, issuer.account_incarnation))
                .ok_or(Error::PolicyEvidenceRequired)?;
            let target_role = self
                .0
                .roles
                .get(&(target.account, target.account_incarnation))
                .ok_or(Error::PolicyEvidenceRequired)?;
            if !matches!(issuer_role, Role::Owner | Role::Admin) || *target_role == Role::Owner {
                return Err(Error::PolicyRejected);
            }
        }
        Ok(Request {
            issuer,
            target: Target::Device(target),
        })
    }

    /// Resolve refs to the previously authenticated local store, then recheck
    /// authority. Inline proposals do NOT inherit another author's authority.
    fn commit(&self, state: &MlsGroup, sender: &Sender, commit: &StagedCommit) -> Result<()> {
        self.check_view(state)?;
        let executor = self.sender(state, sender)?;
        for known in state.pending_proposals() {
            if self.request(state, known)?.target.covers(executor.identity) {
                return Err(Error::PolicyRejected);
            }
        }
        for proposal in commit.queued_proposals() {
            if proposal.proposal_or_ref_type() != ProposalOrRefType::Reference {
                return Err(Error::PolicyRejected);
            }
            let known = state
                .pending_proposals()
                .find(|known| known.proposal_reference_ref() == proposal.proposal_reference_ref())
                .ok_or(Error::PolicyEvidenceRequired)?;
            self.request(state, known)?;
            // MLS already resolved the reference; also inspect its staged author
            // and target, so the test does not just count proposals.
            self.request(state, proposal)?;
        }
        if let Some(leaf) = commit.update_path_leaf_node() {
            self.0.successor(executor, leaf)?;
        }
        Ok(())
    }

    fn refresh(&mut self, device: &Device) {
        let state = load(&Provider::new(&device.connection, &device.crypto), GROUP).unwrap();
        self.0.epoch = state.epoch().as_u64();
        self.0.authenticator = state.epoch_authenticator().as_slice().to_vec();
    }
}

fn setup() -> (tempfile::TempDir, [Device; 4], PriorView) {
    let (dir, devices, mut prior) = fixture();
    // Unlike C1g-1, NO authorization request is injected into the fixture.
    prior.requests.clear();
    (dir, devices, PriorView(prior))
}

// These builders are test setup, not a reliable proposal outbox or product
// authoring API. OpenMLS queues local proposals as part of their creation.
fn propose_with_key(device: &mut Device, leaf: u32, key: Option<&SignatureKeyPair>) -> Vec<u8> {
    device
        .atomic(Fault::None, |tx, provider| {
            let (_, stored_key) = signer(tx, provider)?;
            let mut state = load(provider, GROUP)?;
            let (wire, _) = mls(state.propose_remove_member(
                provider,
                key.unwrap_or(&stored_key),
                LeafNodeIndex::new(leaf),
            ))?;
            encode(wire)
        })
        .unwrap()
}

fn propose(device: &mut Device, leaf: u32) -> Vec<u8> {
    propose_with_key(device, leaf, None)
}

fn target_leaf(device: &Device, view: &PriorView, target: Identity) -> u32 {
    let resolved = leaves(device, &view.0, Target::Device(target));
    assert_eq!(resolved.len(), 1);
    resolved[0]
}

fn accept(device: &mut Device, wire: &[u8], view: &PriorView, fault: Fault) -> Result<()> {
    device.receive_removal_proposal_with_policy_synthetic(GROUP, wire, fault, |state, proposal| {
        view.request(state, proposal).map(|_| ())
    })
}

fn merge(device: &mut Device, wire: &[u8], view: &PriorView, fault: Fault) -> Result<Received> {
    device.receive_with_commit_policy_synthetic(GROUP, wire, fault, |state, sender, staged| {
        view.commit(state, sender, staged)
    })
}

fn pending_count(device: &Device) -> usize {
    load(&Provider::new(&device.connection, &device.crypto), GROUP)
        .unwrap()
        .pending_proposals()
        .count()
}

fn commit_pending(device: &mut Device) -> Outbound {
    device
        .prepare(
            GROUP,
            "commit-references",
            b"synthetic-refs",
            Fault::None,
            false,
            |provider, state, key| {
                let (wire, welcome, _) = mls(state.commit_to_pending_proposals(provider, key))?;
                assert!(welcome.is_none());
                Ok(Outbound {
                    message: encode(wire)?,
                    welcome: None,
                })
            },
        )
        .unwrap()
}

#[test]
fn private_proposal_authenticates_source_and_member_executes_refs_after_restart() {
    let (dir, mut devices, view) = setup();
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    let wire = propose(&mut devices[0], leaf);
    assert!(decode(&wire).unwrap().wire_format() == WireFormat::PrivateMessage);
    for d in &mut devices[1..] {
        accept(d, &wire, &view, Fault::None).unwrap();
        assert_eq!(d.group_publication_held(GROUP), Ok(true));
    }
    devices[1] = Device::open_synthetic(&dir.path().join("1")).unwrap();
    assert_eq!(pending_count(&devices[1]), 1);
    assert!(matches!(
        devices[1].send(GROUP, "blocked", b"text", Fault::None),
        Err(Error::GroupHeld)
    ));
    let commit = commit_pending(&mut devices[1]);
    for d in &mut devices {
        d.receive_with_commit_policy_synthetic(
            GROUP,
            &commit.message,
            Fault::None,
            |state, sender, staged| {
                assert!(view.sender(state, sender)?.identity == id(2, 1));
                assert_eq!(staged.queued_proposals().count(), 1);
                let proposal = staged.queued_proposals().next().unwrap();
                let request = view.request(state, proposal)?;
                assert!(request.issuer == id(1, 1));
                assert!(request.target.covers(id(3, 1)));
                assert!(!request.target.covers(id(3, 2)));
                view.commit(state, sender, staged)
            },
        )
        .unwrap();
    }
    assert_eq!(devices[1].members(GROUP).unwrap().len(), 3);
    assert_eq!(devices[1].group_publication_held(GROUP), Ok(true));
    assert_eq!(pending_count(&devices[1]), 0);
}

#[test]
fn valid_mls_signature_is_not_removal_authority_and_rejection_does_not_latch() {
    let (_dir, mut devices, view) = setup();
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    let unauthorized = propose(&mut devices[1], leaf);
    assert_eq!(
        accept(&mut devices[2], &unauthorized, &view, Fault::None),
        Err(Error::PolicyRejected)
    );
    assert_eq!(pending_count(&devices[2]), 0);
    assert_eq!(devices[2].group_publication_held(GROUP), Ok(false));
    // A separate authenticated request by the sibling device is permitted,
    // without promoting that account to administrator.
    let authorized = propose(&mut devices[3], leaf);
    accept(&mut devices[2], &authorized, &view, Fault::None).unwrap();
    assert_eq!(pending_count(&devices[2]), 1);
    assert!(view.0.roles[&(3, 1)] == Role::Member);
}

#[test]
fn missing_pin_role_or_stale_view_rolls_back_and_exact_retry_survives_restart() {
    let (dir, mut devices, view) = setup();
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    let wire = propose(&mut devices[0], leaf);
    for case in 0..5 {
        let mut missing = PriorView(view.0.clone());
        match case {
            0 => {
                missing.0.pins.remove(0);
            }
            1 => {
                missing.0.pins[0].key[0] ^= 1;
            }
            2 => {
                missing.0.roles.remove(&(1, 1));
            }
            3 => {
                missing.0.epoch += 1;
            }
            _ => {
                missing.0.authenticator[0] ^= 1;
            }
        }
        assert_eq!(
            accept(&mut devices[1], &wire, &missing, Fault::None),
            Err(Error::PolicyEvidenceRequired)
        );
        assert_eq!(pending_count(&devices[1]), 0);
        assert_eq!(devices[1].group_publication_held(GROUP), Ok(false));
    }
    devices[1] = Device::open_synthetic(&dir.path().join("1")).unwrap();
    accept(&mut devices[1], &wire, &view, Fault::None).unwrap();
    assert!(accept(&mut devices[1], &wire, &view, Fault::None).is_err());
    assert_eq!(pending_count(&devices[1]), 1);
}

#[test]
fn counterexample_mutable_role_snapshot_can_reauthorize_an_old_request() {
    let (_dir, mut devices, mut view) = setup();
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    let wire = propose(&mut devices[1], leaf);
    assert_eq!(
        accept(&mut devices[2], &wire, &view, Fault::None),
        Err(Error::PolicyRejected)
    );
    // Deliberately replace a TRUSTED fixture role without an MLS transition.
    // This is not an implemented role-grant protocol. It demonstrates why the
    // product MUST bind the request to its authenticated prior authority view.
    view.0.roles.insert((2, 1), Role::Admin);
    accept(&mut devices[2], &wire, &view, Fault::None).unwrap();
    assert_eq!(devices[2].epoch(GROUP), Ok(view.0.epoch));
    assert_eq!(pending_count(&devices[2]), 1);
    // MLS replay protection alone does not reject a previously unaccepted
    // request whose application authority was changed outside MLS.
}

#[test]
fn forged_signature_ciphertext_wrong_group_and_wrong_content_never_reach_policy() {
    let (_dir, mut devices, view) = setup();
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    // Valid encryption as member 0, but signed with a different member's key.
    let (_, wrong_key) = signer(
        &devices[1].connection,
        &Provider::new(&devices[1].connection, &devices[1].crypto),
    )
    .unwrap();
    let forged = propose_with_key(&mut devices[0], leaf, Some(&wrong_key));
    let wire = propose(&mut devices[0], leaf);
    let mut corrupted = wire.clone();
    *corrupted.last_mut().unwrap() ^= 1;
    for bad in [&forged, &corrupted] {
        assert!(
            devices[2]
                .receive_removal_proposal_with_policy_synthetic(
                    GROUP,
                    bad,
                    Fault::None,
                    |_, _| panic!("unauthenticated callback")
                )
                .is_err()
        );
    }
    devices[2]
        .create(b"different-conversation", Fault::None)
        .unwrap();
    assert!(
        devices[2]
            .receive_removal_proposal_with_policy_synthetic(
                b"different-conversation",
                &wire,
                Fault::None,
                |_, _| panic!("wrong context")
            )
            .is_err()
    );
    let application = devices[3]
        .send(GROUP, "ordinary", b"synthetic", Fault::None)
        .unwrap();
    assert_eq!(
        devices[2].receive_removal_proposal_with_policy_synthetic(
            GROUP,
            &application.message,
            Fault::None,
            |_, _| panic!("application callback")
        ),
        Err(Error::Input)
    );
    devices[2]
        .receive(GROUP, &application.message, Fault::None)
        .unwrap();
    assert_eq!(devices[2].group_publication_held(GROUP), Ok(false));
    accept(&mut devices[2], &wire, &view, Fault::None).unwrap();
}

#[test]
fn proposal_hold_and_ratchet_persist_together_and_failed_write_latches_only_actor() {
    for fault in [Fault::BeforeCommit, Fault::AfterCommit] {
        let (dir, mut devices, view) = setup();
        let leaf = target_leaf(&devices[0], &view, id(3, 1));
        let wire = propose(&mut devices[0], leaf);
        let expected = if matches!(fault, Fault::BeforeCommit) {
            Error::BeforeCommit
        } else {
            Error::AfterCommit
        };
        assert_eq!(accept(&mut devices[1], &wire, &view, fault), Err(expected));
        assert_eq!(devices[1].group_publication_held(GROUP), Ok(true));
        let before = matches!(fault, Fault::BeforeCommit);
        assert_eq!(pending_count(&devices[1]), usize::from(!before));
        let mut reopened = Device::open_synthetic(&dir.path().join("1")).unwrap();
        assert_eq!(reopened.group_publication_held(GROUP), Ok(!before));
        if before {
            accept(&mut reopened, &wire, &view, Fault::None).unwrap();
        } else {
            assert!(accept(&mut reopened, &wire, &view, Fault::None).is_err());
        }
        assert_eq!(pending_count(&reopened), 1);
        assert_eq!(reopened.group_publication_held(GROUP), Ok(true));
    }
    let (dir, mut devices, view) = setup();
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    let wire = propose(&mut devices[0], leaf);
    devices[1]
        .connection
        .execute_batch(
            "CREATE TEMP TRIGGER fail_hold BEFORE INSERT ON probe_group_hold
         BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
        )
        .unwrap();
    assert_eq!(
        accept(&mut devices[1], &wire, &view, Fault::None),
        Err(Error::Storage)
    );
    assert_eq!(pending_count(&devices[1]), 0);
    assert_eq!(devices[1].group_publication_held(GROUP), Ok(true));
    let mut other = Device::open_synthetic(&dir.path().join("1")).unwrap();
    assert_eq!(other.group_publication_held(GROUP), Ok(false));
    accept(&mut other, &wire, &view, Fault::None).unwrap();
    assert_eq!(pending_count(&other), 1);
}

#[test]
fn missing_reference_is_wait_not_invalid_and_same_commit_can_be_retried() {
    let (_dir, mut devices, view) = setup();
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    let wire = propose(&mut devices[0], leaf);
    accept(&mut devices[1], &wire, &view, Fault::None).unwrap();
    let commit = commit_pending(&mut devices[1]);
    assert_eq!(
        merge(&mut devices[3], &commit.message, &view, Fault::None),
        Err(Error::PolicyEvidenceRequired)
    );
    assert_eq!(devices[3].epoch(GROUP), Ok(view.0.epoch));
    accept(&mut devices[3], &wire, &view, Fault::None).unwrap();
    assert_eq!(
        merge(&mut devices[3], &commit.message, &view, Fault::None),
        Ok(Received::Commit)
    );
}

#[test]
fn authority_is_rechecked_on_both_merge_paths_and_inline_substitution_is_rejected() {
    let (_dir, mut devices, view) = setup();
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    let wire = propose(&mut devices[0], leaf);
    for i in [1, 3] {
        accept(&mut devices[i], &wire, &view, Fault::None).unwrap();
    }
    let commit = commit_pending(&mut devices[1]);
    for case in 0..3 {
        let mut revoked = PriorView(view.0.clone());
        match case {
            0 => {
                revoked.0.active.remove(&id(1, 1));
            }
            1 => {
                revoked.0.roles.insert((1, 1), Role::Member);
            }
            _ => {
                revoked.0.active.remove(&id(2, 1));
            }
        }
        for i in [1, 3] {
            assert_eq!(
                merge(&mut devices[i], &commit.message, &revoked, Fault::None),
                Err(Error::PolicyRejected)
            );
            assert_eq!(devices[i].epoch(GROUP), Ok(view.0.epoch));
            assert_eq!(pending_count(&devices[i]), 1);
        }
    }
    for i in [1, 3] {
        merge(&mut devices[i], &commit.message, &view, Fault::None).unwrap();
    }
    let (_dir, mut devices, view) = setup();
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    let wire = propose(&mut devices[0], leaf);
    accept(&mut devices[3], &wire, &view, Fault::None).unwrap();
    // Executor did not receive the author's proposal. Its own inline Remove
    // names the same leaf but is not a delegation from the owner.
    let inline = devices[1]
        .remove(GROUP, "inline", leaf, Fault::None)
        .unwrap();
    for i in [1, 3] {
        assert_eq!(
            merge(&mut devices[i], &inline.message, &view, Fault::None),
            Err(Error::PolicyRejected)
        );
    }
}

#[test]
fn concurrent_update_discards_epoch_proposals_but_not_the_hold() {
    let (_dir, mut devices, mut view) = setup();
    // Prepared BEFORE the request, so this Commit contains no Remove.
    let update = devices[3]
        .update(GROUP, "concurrent-update", Fault::None)
        .unwrap();
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    let wire = propose(&mut devices[0], leaf);
    accept(&mut devices[1], &wire, &view, Fault::None).unwrap();
    merge(&mut devices[1], &update.message, &view, Fault::None).unwrap();
    view.refresh(&devices[1]);
    assert_eq!(pending_count(&devices[1]), 0);
    assert_eq!(devices[1].members(GROUP).unwrap().len(), 4);
    assert_eq!(target_leaf(&devices[1], &view, id(3, 1)), leaf);
    assert_eq!(devices[1].group_publication_held(GROUP), Ok(true));
    assert!(accept(&mut devices[1], &wire, &view, Fault::None).is_err());
    assert!(matches!(
        devices[1].send(GROUP, "still-blocked", b"text", Fault::None),
        Err(Error::GroupHeld)
    ));
    // Counterexample: epoch proposal storage is NOT a stable obligation ledger.
}

#[test]
fn references_do_not_authorize_extra_removes_or_adds_on_either_merge_path() {
    for add in [false, true] {
        let (dir, mut devices, view) = setup();
        let leaf = target_leaf(&devices[0], &view, id(3, 1));
        let wire = propose(&mut devices[0], leaf);
        for i in [1, 3] {
            accept(&mut devices[i], &wire, &view, Fault::None).unwrap();
        }
        let outbound = if add {
            let mut newcomer = Device::open_synthetic(&dir.path().join("newcomer")).unwrap();
            newcomer.initialize(b"synthetic-newcomer").unwrap();
            let kp = newcomer.key_package().unwrap();
            // Adversarial test builder bypasses the authoring hold; it does not
            // grant a product exception to Add while publication is held.
            devices[1]
                .prepare(
                    GROUP,
                    "extra-add",
                    b"extra-add",
                    Fault::None,
                    false,
                    |provider, state, key| {
                        let MlsMessageBodyIn::KeyPackage(kp) = decode(&kp)?.extract() else {
                            return Err(Error::Input);
                        };
                        let kp = mls(kp.validate(provider.crypto(), ProtocolVersion::Mls10))?;
                        let (commit, welcome, _) = mls(state.add_members(provider, key, &[kp]))?;
                        Ok(Outbound {
                            message: encode(commit)?,
                            welcome: Some(encode(welcome)?),
                        })
                    },
                )
                .unwrap()
        } else {
            let extra = target_leaf(&devices[0], &view, id(3, 2));
            devices[1]
                .remove(GROUP, "extra-remove", extra, Fault::None)
                .unwrap()
        };
        for i in [1, 3] {
            assert_eq!(
                devices[i].receive_with_commit_policy_synthetic(
                    GROUP,
                    &outbound.message,
                    Fault::None,
                    |state, sender, staged| {
                        assert_eq!(staged.queued_proposals().count(), 2);
                        assert_eq!(staged.queued_proposals().filter(|p|
                        p.proposal_or_ref_type() == ProposalOrRefType::Reference).count(), 1);
                        assert_eq!(staged.add_proposals().count(), usize::from(add));
                        view.commit(state, sender, staged)
                    }
                ),
                Err(Error::PolicyRejected)
            );
            assert_eq!(devices[i].epoch(GROUP), Ok(view.0.epoch));
            assert_eq!(pending_count(&devices[i]), 1);
        }
    }
}

#[test]
fn own_echo_non_proposal_and_recovery_cannot_bypass_source_validation() {
    let (_dir, mut devices, view) = setup();
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    let wire = propose(&mut devices[0], leaf);
    assert!(
        devices[0]
            .receive_removal_proposal_with_policy_synthetic(
                GROUP,
                &wire,
                Fault::None,
                |_, _| panic!("own proposal echo")
            )
            .is_err()
    );
    assert_eq!(devices[0].group_publication_held(GROUP), Ok(false));
    // The builder queued its local proposal, not the receiving API.
    assert_eq!(pending_count(&devices[0]), 1);
    let kp = devices[3].key_package().unwrap();
    assert_eq!(
        devices[1].receive_removal_proposal_with_policy_synthetic(
            GROUP,
            &kp,
            Fault::None,
            |_, _| panic!("not a private proposal")
        ),
        Err(Error::Input)
    );
    devices[1].require_reactivation().unwrap();
    assert_eq!(
        devices[1].receive_removal_proposal_with_policy_synthetic(
            GROUP,
            &wire,
            Fault::None,
            |_, _| panic!("recovery gate bypass")
        ),
        Err(Error::RecoveryRequired)
    );
    assert_eq!(pending_count(&devices[1]), 0);
    assert_eq!(devices[1].group_publication_held(GROUP), Ok(false));
}

#[test]
fn proposal_queue_is_bounded_and_repeated_authenticated_content_is_not_new_authority() {
    let (_dir, mut devices, view) = setup();
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    for _ in 0..2 {
        let wire = propose(&mut devices[0], leaf);
        accept(&mut devices[1], &wire, &view, Fault::None).unwrap();
    }
    assert_eq!(pending_count(&devices[1]), 1);
    for n in 1..=MAX_MEMBERS {
        let wire = devices[0]
            .atomic(Fault::None, |tx, provider| {
                let (_, key) = signer(tx, provider)?;
                let mut state = load(provider, GROUP)?;
                // Distinct authenticated contents for the quota test only.
                state.set_aad(n.to_be_bytes().to_vec());
                let (wire, _) =
                    mls(state.propose_remove_member(provider, &key, LeafNodeIndex::new(leaf)))?;
                encode(wire)
            })
            .unwrap();
        if n < MAX_MEMBERS {
            accept(&mut devices[1], &wire, &view, Fault::None).unwrap();
        } else {
            assert_eq!(
                devices[1].receive_removal_proposal_with_policy_synthetic(
                    GROUP,
                    &wire,
                    Fault::None,
                    |_, _| panic!("quota bypass")
                ),
                Err(Error::Input)
            );
        }
    }
    assert_eq!(pending_count(&devices[1]), MAX_MEMBERS);
    assert_eq!(devices[1].group_publication_held(GROUP), Ok(true));
}

fn rotate(device: &mut Device, key: &SignatureKeyPair, credential: Credential) -> Outbound {
    device
        .prepare(
            GROUP,
            "rotate-key",
            b"synthetic-rotation",
            Fault::None,
            false,
            |provider, state, old_key| {
                let bundle = mls(state.self_update_with_new_signer(
                    provider,
                    old_key,
                    openmls::credentials::NewSignerBundle {
                        signer: key,
                        credential_with_key: CredentialWithKey {
                            credential,
                            signature_key: key.public().to_vec().into(),
                        },
                    },
                    LeafNodeParameters::default(),
                ))?;
                Ok(Outbound {
                    message: encode(bundle.into_commit())?,
                    welcome: None,
                })
            },
        )
        .unwrap()
}

// This experiment derives a successor ONLY inside the authenticated Commit
// callback, then publishes the in-memory pin only after SQL commit succeeds.
// It does not persist the trust chain or rotate Device's signer storage.
fn merge_key_successor(
    device: &mut Device,
    wire: &[u8],
    view: &mut PriorView,
    fault: Fault,
) -> Result<Received> {
    let mut successor = None;
    let result = device.receive_with_commit_policy_synthetic(
        GROUP,
        wire,
        fault,
        |state, sender, staged| {
            view.check_view(state)?;
            let before = view.sender(state, sender)?;
            let leaf = staged
                .update_path_leaf_node()
                .ok_or(Error::PolicyRejected)?;
            if leaf.credential() != &before.credential
                || leaf.signature_key().as_slice() == before.key
            {
                return Err(Error::PolicyRejected);
            }
            let after = Pin {
                key: leaf.signature_key().as_slice().to_vec(),
                version: before.version.checked_add(1).ok_or(Error::PolicyRejected)?,
                ..before.clone()
            };
            let mut candidate = PriorView(view.0.clone());
            candidate.0.pins.push(after.clone());
            candidate.commit(state, sender, staged)?;
            successor = Some(after);
            Ok(())
        },
    )?;
    view.0.pins.push(successor.unwrap());
    view.refresh(device);
    Ok(result)
}

#[test]
fn key_continuity_comes_from_old_signed_commit_not_a_server_successor_pin() {
    let (_dir, mut devices, mut view) = setup();
    let fresh = SignatureKeyPair::new(SUITE.signature_algorithm()).unwrap();
    let old_pin_count = view.0.pins.len();
    let update = rotate(&mut devices[3], &fresh, view.0.pins[3].credential.clone());
    assert_eq!(
        merge(&mut devices[1], &update.message, &view, Fault::None),
        Err(Error::PolicyEvidenceRequired)
    );
    assert_eq!(
        merge_key_successor(
            &mut devices[1],
            &update.message,
            &mut view,
            Fault::BeforeCommit
        ),
        Err(Error::BeforeCommit)
    );
    assert_eq!(view.0.pins.len(), old_pin_count);
    merge_key_successor(&mut devices[1], &update.message, &mut view, Fault::None).unwrap();
    assert!(view.0.pins.last().unwrap().identity == id(3, 2));
    assert_eq!(view.0.pins.last().unwrap().key, fresh.public());
    devices[3]
        .receive(GROUP, &update.message, Fault::None)
        .unwrap();
    let leaf = target_leaf(&devices[1], &view, id(3, 1));
    // The stored operational signer is deliberately NOT rotated by this test.
    // Old-key proof fails; the actual new key authenticates a subsequent request.
    let old_key_wire = propose(&mut devices[3], leaf);
    assert_eq!(
        accept(&mut devices[1], &old_key_wire, &view, Fault::None),
        Err(Error::Crypto)
    );
    let new_key_wire = propose_with_key(&mut devices[3], leaf, Some(&fresh));
    accept(&mut devices[1], &new_key_wire, &view, Fault::None).unwrap();
    assert_eq!(pending_count(&devices[1]), 1);

    // Counterexample for the non-durable pin helper: a lost success response
    // advances MLS without publishing the successor in memory. Refreshing only
    // epoch/authenticator cannot repair the missing identity binding.
    let (_dir, mut devices, mut view) = setup();
    let fresh = SignatureKeyPair::new(SUITE.signature_algorithm()).unwrap();
    let update = rotate(&mut devices[3], &fresh, view.0.pins[3].credential.clone());
    assert_eq!(
        merge_key_successor(
            &mut devices[1],
            &update.message,
            &mut view,
            Fault::AfterCommit
        ),
        Err(Error::AfterCommit)
    );
    assert_eq!(devices[1].epoch(GROUP), Ok(view.0.epoch + 1));
    assert_eq!(view.0.pins.len(), 4);
    view.refresh(&devices[1]);
    let state = load(
        &Provider::new(&devices[1].connection, &devices[1].crypto),
        GROUP,
    )
    .unwrap();
    assert_eq!(view.check_view(&state), Err(Error::PolicyEvidenceRequired));
    // This policy refuses to infer trust. The permissive legacy Device APIs
    // are NOT a product recovery path and do not enforce this view.
}

#[test]
fn key_change_cannot_relabel_identity_or_let_a_known_target_execute() {
    let (_dir, mut devices, mut view) = setup();
    let fresh = SignatureKeyPair::new(SUITE.signature_algorithm()).unwrap();
    let changed: Credential =
        BasicCredential::new(b"different-account-incarnation".to_vec()).into();
    let update = rotate(&mut devices[3], &fresh, changed);
    assert_eq!(
        merge_key_successor(&mut devices[1], &update.message, &mut view, Fault::None),
        Err(Error::PolicyRejected)
    );
    assert_eq!(view.0.pins.len(), 4);
    let (_dir, mut devices, mut view) = setup();
    let fresh = SignatureKeyPair::new(SUITE.signature_algorithm()).unwrap();
    let update = rotate(&mut devices[2], &fresh, view.0.pins[2].credential.clone());
    let leaf = target_leaf(&devices[0], &view, id(3, 1));
    let wire = propose(&mut devices[0], leaf);
    accept(&mut devices[1], &wire, &view, Fault::None).unwrap();
    assert_eq!(
        merge_key_successor(&mut devices[1], &update.message, &mut view, Fault::None),
        Err(Error::PolicyRejected)
    );
    assert_eq!(pending_count(&devices[1]), 1);
    assert_eq!(view.0.pins.len(), 4);
    assert_eq!(devices[1].group_publication_held(GROUP), Ok(true));
}
