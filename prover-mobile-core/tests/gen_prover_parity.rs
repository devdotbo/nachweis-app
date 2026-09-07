//! The Rust derivation must produce the same Prover.toml as
//! circuits/tools/gen-prover.ts for the committed test vector.
use prover_mobile_core::{derive, ProverInput};

fn fixture(rel: &str) -> String {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(rel);
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("{}: {e}", p.display()))
}

fn input() -> ProverInput {
    serde_json::from_str(&fixture("prover-sp1/fixtures/input.json")).unwrap()
}

#[test]
fn prover_toml_matches_gen_prover_ts() {
    let expected = fixture("circuits/pid-sdjwt/Prover.toml");
    // gen-prover.ts writes one comment line with the input path first.
    let expected_body: String = expected.lines().skip(1).map(|l| format!("{l}\n")).collect();
    let ci = derive(&input()).unwrap();
    assert_eq!(ci.to_prover_toml(), expected_body);
    assert_eq!(ci.expected.issuer_key_hash_hex, "0x78cf23963b47d3e393c79ea091c4ed80ebbae4ff78992058dd92fd34e1635183");
    assert_eq!(ci.expected.nonce_hex, "0x306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762");
    assert_eq!(ci.expected.expiry, 1819756800);
}

#[test]
fn flat_witness_len_matches_artifact_abi() {
    let circuit = fixture("circuits/pid-sdjwt/target/pid_sdjwt.json");
    let n = prover_mobile_core::abi_witness_len(&circuit).unwrap();
    assert_eq!(derive(&input()).unwrap().to_flat_witness().len(), n);
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
