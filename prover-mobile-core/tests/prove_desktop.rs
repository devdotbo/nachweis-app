//! Proves the fixture with the core on the desktop and writes the proof next
//! to bb's own output so `bb verify` can check byte compatibility:
//!
//!   cargo test --release --test prove_desktop -- --nocapture
//!   bb verify -k ../circuits/pid-sdjwt/out/adapted/vk -p target/core-proof/proof \
//!      -i target/core-proof/public_inputs -t evm
//!
//! Needs ~/.bb-crs/bn254_g1.dat (bb downloads it on first `bb prove`) and the
//! desktop VK from `bb write_vk -t evm`. Skips when either is missing.
use prover_mobile_core::{derive, ProverInput};
use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

#[test]
fn core_proof_matches_bb_evm_target() {
    let vk_path = root().join("circuits/pid-sdjwt/out/adapted/vk");
    let srs = PathBuf::from(std::env::var("HOME").unwrap()).join(".bb-crs/bn254_g1.dat");
    if !vk_path.exists() || !srs.exists() {
        eprintln!("skip: {} or {} missing", vk_path.display(), srs.display());
        return;
    }
    let circuit = root().join("circuits/pid-sdjwt/target/pid_sdjwt.json");
    let input: ProverInput =
        serde_json::from_str(&std::fs::read_to_string(root().join("prover-sp1/fixtures/input.json")).unwrap()).unwrap();
    let ci = derive(&input).unwrap();
    let vk = std::fs::read(&vk_path).unwrap();

    let t = std::time::Instant::now();
    let n = prover_mobile_core::setup_srs(circuit.to_string_lossy().into(), srs.to_string_lossy().into()).unwrap();
    eprintln!("srs: {n} points in {:?}", t.elapsed());
    let t = std::time::Instant::now();
    let r = prover_mobile_core::prove(
        circuit.to_string_lossy().into(),
        srs.to_string_lossy().into(),
        vk.clone(),
        ci.to_flat_witness(),
        true,
        false,
    )
    .unwrap();
    eprintln!(
        "prove: total {:?}, execute {} ms, bb {} ms, peak rss {} MB, proof {} B, {} public inputs",
        t.elapsed(),
        r.execute_ms,
        r.prove_ms,
        r.peak_rss_bytes / 1_000_000,
        r.proof.len(),
        r.public_inputs.len()
    );
    assert_eq!(r.proof.len(), 10_304);
    assert_eq!(r.public_inputs.len(), 86);
    assert_eq!(r.public_inputs.concat(), ci.expected_public_inputs().concat());
    assert!(prover_mobile_core::verify(r.proof.clone(), r.public_inputs.clone(), vk, true).unwrap());

    let out = root().join("prover-mobile-core/target/core-proof");
    std::fs::create_dir_all(&out).unwrap();
    std::fs::write(out.join("proof"), &r.proof).unwrap();
    std::fs::write(out.join("public_inputs"), r.public_inputs.concat()).unwrap();
    eprintln!("wrote {}", out.display());
}
