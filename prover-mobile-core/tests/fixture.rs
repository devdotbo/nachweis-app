//! Proves the committed test vector on the host and writes the proof next to
//! the desktop artefacts so `bb verify` can check byte compatibility:
//!
//!   cargo test --release -- --nocapture
//!   bb verify -k circuits/pid-sdjwt/out/adapted/vk -p prover-mobile-core/target/host-proof/proof \
//!       -i prover-mobile-core/target/host-proof/public_inputs -t evm
use std::path::PathBuf;

fn repo() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").canonicalize().unwrap()
}

#[test]
fn prove_fixture_on_host() {
    let circuit = repo().join("circuits/pid-sdjwt/target/pid_sdjwt.json");
    let vk = repo().join("circuits/pid-sdjwt/out/adapted/vk");
    if !circuit.exists() || !vk.exists() {
        eprintln!("skipped: run nargo compile + bb write_vk first (see circuits/README.md)");
        return;
    }
    let home = std::env::var("HOME").unwrap();
    let g1 = format!("{home}/.bb-crs/bn254_g1.dat");
    let g2 = format!("{home}/.bb-crs/bn254_g2.dat");
    let n = nachweis_prover::init_srs(g1, g2).unwrap();
    assert!(n >= (1 << 20) + 1, "srs has {n} points");

    let toml = std::fs::read_to_string(repo().join("circuits/pid-sdjwt/Prover.toml")).unwrap();
    let outputs = nachweis_prover::execute_pid_sdjwt(circuit.to_string_lossy().into(), toml.clone()).unwrap();
    assert_eq!(outputs.len(), 32 + 1 + 1 + 32);
    assert_eq!(outputs[32][31], 1, "over18");

    let r = nachweis_prover::prove_pid_sdjwt(circuit.to_string_lossy().into(), vk.to_string_lossy().into(), toml, false).unwrap();
    eprintln!(
        "witness {} ms, prove {} ms, peak rss {} MB, proof {} B, {} public inputs, vk_hash {}",
        r.witness_ms,
        r.prove_ms,
        r.peak_rss_bytes / 1_000_000,
        r.proof.len(),
        r.public_inputs.len(),
        hex::encode(&r.vk_hash)
    );
    assert_eq!(r.public_inputs.len(), 86);
    assert_eq!(r.proof.len(), 10_304);
    // bb returns no vk hash when the VK is supplied; byte compatibility is
    // checked by `bb verify` with the desktop VK (see the doc comment above).

    let out = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/host-proof");
    std::fs::create_dir_all(&out).unwrap();
    std::fs::write(out.join("proof"), &r.proof).unwrap();
    std::fs::write(out.join("public_inputs"), r.public_inputs.concat()).unwrap();

    let ok = nachweis_prover::verify_pid_sdjwt(vk.to_string_lossy().into(), r.proof, r.public_inputs).unwrap();
    assert!(ok, "in-process verify failed");
}
