//! The Rust derivation must produce the same Prover.toml as
//! circuits/tools/gen-prover.ts for the committed test vector.
use prover_mobile_core::{derive, ProverInput};

fn fixture(rel: &str) -> String {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(rel);
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {e}", p.display()))
}

fn input() -> ProverInput {
    serde_json::from_str(&fixture("prover-sp1/fixtures/realistic-input.json")).unwrap()
}

#[test]
fn prover_toml_matches_gen_prover_ts() {
    let expected = fixture("circuits/pid-sdjwt/Prover.toml");
    // gen-prover.ts writes one comment line with the input path first.
    let expected_body: String = expected.lines().skip(1).map(|l| format!("{l}\n")).collect();
    let ci = derive(&input()).unwrap();
    assert_eq!(ci.to_prover_toml(), expected_body);
    assert_eq!(ci.shape, prover_mobile_core::AgeShape::A);
    assert_eq!(ci.expected.nonce_hex, "0x306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762");
    // the uniffi entry point (x5c key, pinned aud) gives the same text
    let i = input();
    let toml = prover_mobile_core::derive_prover_inputs(i.presentation.clone(), i.bound_address_hex.clone(), i.challenge_hex.clone()).unwrap();
    assert_eq!(toml, expected_body);
}

fn artifact() -> serde_json::Value {
    serde_json::from_str(&fixture("circuits/pid-sdjwt/target/pid_sdjwt.json")).unwrap()
}

#[test]
fn flat_witness_len_matches_artifact_abi() {
    let circuit = fixture("circuits/pid-sdjwt/target/pid_sdjwt.json");
    let n = prover_mobile_core::abi_witness_len(&circuit).unwrap();
    let w = derive(&input()).unwrap().to_flat_witness(&artifact()["abi"]).unwrap();
    assert_eq!(w.len(), n);
    // BoundedVec layout: storage then len; first param is issuer_header_b64 ("eyJ..." starts with 'e' = 101).
    assert_eq!(w[0], "101");
    let hdr_len: usize = input().presentation.split('.').next().unwrap().len();
    assert_eq!(w[prover_mobile_core::Bounds::default().header_b64_max], hdr_len.to_string());
}

#[test]
fn bounds_come_from_the_artifact() {
    let b = prover_mobile_core::Bounds::from_abi(&artifact()["abi"]).unwrap();
    assert_eq!(b, prover_mobile_core::Bounds::default());
}

#[test]
fn issuer_key_from_x5c_leaf() {
    // The realistic fixture's x5c leaf carries the key that signed it.
    let i = input();
    let header = i.presentation.split('.').next().unwrap();
    let k = prover_mobile_core::issuer_key_from_x5c(header).unwrap();
    assert_eq!(hex::encode(&k), i.issuer_key_sec1_hex.trim_start_matches("0x"));
}

#[test]
fn wrong_aud_is_rejected() {
    let mut i = input();
    i.expected_aud = Some("https://self-issued.me/v2".into());
    assert!(derive(&i).unwrap_err().to_string().contains("aud"));
}

#[test]
fn public_inputs_match_desktop_bb() {
    // Written by `bb prove -t evm` on the desktop; 86 x 32 bytes.
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../circuits/pid-sdjwt/out/adapted/public_inputs");
    let Ok(bytes) = std::fs::read(&p) else { eprintln!("skip: {} missing", p.display()); return };
    let ours: Vec<u8> = derive(&input()).unwrap().expected_public_inputs().concat();
    assert_eq!(ours, bytes);
}

#[test]
fn tampered_nonce_is_rejected() {
    let mut i = input();
    i.challenge_hex = format!("0x{}", "00".repeat(32));
    assert!(derive(&i).unwrap_err().to_string().contains("nonce"));
}
