#![cfg(feature = "prototype")]
use openmls::ciphersuite::signature::SignContent;
use openmls::prelude::{
    MlsMessageIn,
    tls_codec::{Deserialize, Serialize},
};
use openmls_traits::{crypto::OpenMlsCrypto, types::SignatureScheme};

fn hex(s: &str) -> Vec<u8> {
    s.as_bytes()
        .as_chunks::<2>()
        .0
        .iter()
        .map(|chunk| u8::from_str_radix(std::str::from_utf8(chunk).unwrap(), 16).unwrap())
        .collect()
}

#[test]
fn rfc_wire_encoding_subset_roundtrips_exactly() {
    let vectors: serde_json::Value =
        serde_json::from_str(include_str!("vectors/rfc9420-subset.json")).unwrap();
    for wire in vectors["messages"].as_object().unwrap().values() {
        let wire = hex(wire.as_str().unwrap());
        let mut reader = std::io::Cursor::new(&wire);
        let decoded = MlsMessageIn::tls_deserialize(&mut reader).unwrap();
        assert_eq!(reader.position(), wire.len() as u64);
        assert!(decoded.tls_serialize_detached().unwrap() == wire);
    }
}

#[test]
fn rfc_signature_with_label_known_answer_and_tampering() {
    let vectors: serde_json::Value =
        serde_json::from_str(include_str!("vectors/rfc9420-subset.json")).unwrap();
    #[cfg(not(feature = "libcrux"))]
    let crypto = openmls_rust_crypto::RustCrypto::default();
    #[cfg(feature = "libcrux")]
    let crypto = openmls_libcrux_crypto::CryptoProvider::new().unwrap();
    assert!(!vectors["signatures"].as_array().unwrap().is_empty());
    for vector in vectors["signatures"].as_array().unwrap() {
        let v = &vector["sign_with_label"];
        let public = hex(v["pub"].as_str().unwrap());
        let signature = hex(v["signature"].as_str().unwrap());
        let content = SignContent::new(
            v["label"].as_str().unwrap(),
            hex(v["content"].as_str().unwrap()).into(),
        );
        let mut bytes = content.tls_serialize_detached().unwrap();
        crypto
            .verify_signature(SignatureScheme::ED25519, &bytes, &public, &signature)
            .unwrap();
        bytes[0] ^= 1;
        assert!(
            crypto
                .verify_signature(SignatureScheme::ED25519, &bytes, &public, &signature)
                .is_err()
        );
    }
}
