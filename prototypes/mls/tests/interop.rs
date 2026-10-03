#![cfg(feature = "interop")]
use circlehaven_mls_probe::{Device, Fault};
use mls_rs::{
    CipherSuite, CipherSuiteProvider, Client, CryptoProvider, MlsMessage,
    group::{
        ReceivedMessage,
        mls_rules::{DefaultMlsRules, EncryptionOptions},
    },
    identity::{
        SigningIdentity,
        basic::{BasicCredential, BasicIdentityProvider},
    },
};
use mls_rs_crypto_rustcrypto::RustCryptoProvider;

#[test]
fn openmls_and_mls_rs_exchange_private_messages_and_commits() {
    let dir = tempfile::tempdir().unwrap();
    let mut open = Device::open_synthetic(&dir.path().join("open")).unwrap();
    open.initialize(b"synthetic-openmls").unwrap();
    let provider = RustCryptoProvider::new();
    let suite = CipherSuite::CURVE25519_AES128;
    let (secret, public) = provider
        .cipher_suite_provider(suite)
        .unwrap()
        .signature_key_generate()
        .unwrap();
    let identity = SigningIdentity::new(
        BasicCredential::new(b"synthetic-mls-rs".to_vec()).into_credential(),
        public,
    );
    let peer = Client::builder()
        .crypto_provider(provider)
        .identity_provider(BasicIdentityProvider)
        .mls_rules(
            DefaultMlsRules::new()
                .with_encryption_options(EncryptionOptions::new(true, Default::default())),
        )
        .signing_identity(identity, secret, suite)
        .build();
    let group_id = b"interop";
    open.create(group_id, Fault::None).unwrap();
    let kp = peer
        .generate_key_package_message(Default::default(), Default::default(), None)
        .unwrap()
        .to_bytes()
        .unwrap();
    let add = open.add(group_id, "add", &[kp], Fault::None).unwrap();
    open.receive(group_id, &add.message, Fault::None).unwrap();
    let welcome = MlsMessage::from_bytes(add.welcome.as_ref().unwrap()).unwrap();
    let (mut group, _) = peer.join_group(None, &welcome, None).unwrap();
    let from_open = open
        .send(group_id, "open-message", b"synthetic-open", Fault::None)
        .unwrap();
    let ReceivedMessage::ApplicationMessage(received) = group
        .process_incoming_message(MlsMessage::from_bytes(&from_open.message).unwrap())
        .unwrap()
    else {
        panic!("expected application message")
    };
    assert!(received.data() == b"synthetic-open");
    let from_peer = group
        .encrypt_application_message(b"synthetic-peer", Default::default())
        .unwrap()
        .to_bytes()
        .unwrap();
    open.receive(group_id, &from_peer, Fault::None).unwrap();
    assert!(open.inbox(group_id).unwrap() == [b"synthetic-peer"]);
    let update = open.update(group_id, "update", Fault::None).unwrap();
    group
        .process_incoming_message(MlsMessage::from_bytes(&update.message).unwrap())
        .unwrap();
    open.receive(group_id, &update.message, Fault::None)
        .unwrap();
    let update = group.commit_builder().build().unwrap();
    open.receive(
        group_id,
        &update.commit_message.to_bytes().unwrap(),
        Fault::None,
    )
    .unwrap();
    group.apply_pending_commit().unwrap();
    let after = group
        .encrypt_application_message(b"after-updates", Default::default())
        .unwrap()
        .to_bytes()
        .unwrap();
    open.receive(group_id, &after, Fault::None).unwrap();
    assert_eq!(open.epoch(group_id).unwrap(), 3);
}
