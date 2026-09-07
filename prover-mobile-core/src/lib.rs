//! On-phone prover for the Nachweis `pid_sdjwt` Noir circuit.
//!
//! Pipeline (identical to the desktop `nargo execute` + `bb prove -t evm` run):
//! 1. parse `Prover.toml` text against the ABI in the compiled artifact,
//! 2. execute the ACIR program with the bn254 blackbox solver (witness),
//! 3. hand bytecode, witness and the desktop verification key to Barretenberg
//!    (UltraHonk, keccak transcript, ZK on) and return proof and public inputs.
//!
//! The SRS (bn254 G1 points, 2^20 + 1 for this circuit) must be initialised
//! once per process from a file; the app ships it in its assets.

use std::io::Read;
use std::sync::OnceLock;
use std::time::Instant;

use acvm::acir::circuit::Program;
use acvm::acir::native_types::{WitnessMap, WitnessStack};
use acvm::{AcirField, FieldElement};
use barretenberg_rs::backends::FfiBackend;
use barretenberg_rs::generated_types::{CircuitInput, CircuitInputNoVK, ProofSystemSettings};
use barretenberg_rs::BarretenbergApi;
use base64::Engine;
use bn254_blackbox_solver::Bn254BlackBoxSolver;
use flate2::read::GzDecoder;
use nargo::foreign_calls::DefaultForeignCallBuilder;
use nargo::ops::execute_program;
use noirc_abi::input_parser::Format;
use noirc_abi::Abi;

uniffi::setup_scaffolding!();

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum ProverError {
    #[error("{msg}")]
    Failed { msg: String },
}

fn fail<E: std::fmt::Display>(context: &str) -> impl FnOnce(E) -> ProverError + '_ {
    move |e| ProverError::Failed { msg: format!("{context}: {e}") }
}

/// Result of a proving run. `proof` is the flat UltraHonk proof (322 x 32 bytes
/// for pid_sdjwt), `public_inputs` are the 86 field elements, 32 bytes each,
/// in the order the Solidity verifier expects.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ProveResult {
    pub proof: Vec<u8>,
    pub public_inputs: Vec<Vec<u8>>,
    pub vk_hash: Vec<u8>,
    pub witness_ms: u64,
    pub prove_ms: u64,
    pub peak_rss_bytes: u64,
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct CircuitStats {
    pub num_gates: u32,
    pub num_gates_dyadic: u32,
    pub num_acir_opcodes: u32,
}

fn settings_evm() -> ProofSystemSettings {
    // `bb ... -t evm` = keccak oracle hash, ZK on, no IPA accumulation.
    ProofSystemSettings {
        ipa_accumulation: false,
        oracle_hash_type: "keccak".to_string(),
        disable_zk: false,
        optimized_solidity_verifier: false,
    }
}

fn api() -> Result<BarretenbergApi<FfiBackend>, ProverError> {
    let backend = FfiBackend::new().map_err(fail("FfiBackend::new"))?;
    Ok(BarretenbergApi::new(backend))
}

struct Artifact {
    abi: Abi,
    program: Program<FieldElement>,
    acir_raw: Vec<u8>,
}

fn load_artifact(circuit_json_path: &str) -> Result<Artifact, ProverError> {
    let text = std::fs::read_to_string(circuit_json_path).map_err(fail("read circuit json"))?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(fail("parse circuit json"))?;
    let abi: Abi = serde_json::from_value(json["abi"].clone()).map_err(fail("parse abi"))?;
    let bytecode_b64 = json["bytecode"].as_str().ok_or(ProverError::Failed { msg: "artifact has no bytecode".into() })?;
    let compressed = base64::engine::general_purpose::STANDARD
        .decode(bytecode_b64)
        .map_err(fail("base64 bytecode"))?;
    let mut acir_raw = Vec::new();
    GzDecoder::new(compressed.as_slice())
        .read_to_end(&mut acir_raw)
        .map_err(fail("gunzip bytecode"))?;
    let program = Program::deserialize_program(&compressed).map_err(fail("deserialize program"))?;
    Ok(Artifact { abi, program, acir_raw })
}

fn build_initial_witness(abi: &Abi, prover_toml: &str) -> Result<WitnessMap<FieldElement>, ProverError> {
    let input_map = Format::Toml.parse(prover_toml, abi).map_err(fail("parse Prover.toml"))?;
    abi.encode(&input_map, None).map_err(fail("abi encode"))
}

fn solve(artifact: &Artifact, initial: WitnessMap<FieldElement>) -> Result<WitnessStack<FieldElement>, ProverError> {
    let solver = Bn254BlackBoxSolver::default();
    let mut foreign = DefaultForeignCallBuilder::default().build();
    execute_program(&artifact.program, initial, &solver, &mut foreign).map_err(fail("execute"))
}

fn serialize_witness(stack: WitnessStack<FieldElement>) -> Result<Vec<u8>, ProverError> {
    // WitnessStack::serialize gzips in the format nargo beta.21 writes; bb wants it raw.
    let compressed = stack.serialize().map_err(fail("serialize witness"))?;
    let mut raw = Vec::new();
    GzDecoder::new(compressed.as_slice())
        .read_to_end(&mut raw)
        .map_err(fail("gunzip witness"))?;
    Ok(raw)
}

static SRS_READY: OnceLock<()> = OnceLock::new();

/// Load the bn254 SRS into Barretenberg. `g1_path` is the raw `bn254_g1.dat`
/// slice (64 bytes per point, as served by crs.aztec.network and cached by bb
/// under `~/.bb-crs`), `g2_path` the 128-byte `bn254_g2.dat`. Idempotent.
#[uniffi::export]
pub fn init_srs(g1_path: String, g2_path: String) -> Result<u32, ProverError> {
    let g1 = std::fs::read(&g1_path).map_err(fail("read g1"))?;
    let g2 = std::fs::read(&g2_path).map_err(fail("read g2"))?;
    if g2.len() != 128 {
        return Err(ProverError::Failed { msg: format!("g2 must be 128 bytes, got {}", g2.len()) });
    }
    let num_points = (g1.len() / 64) as u32;
    if SRS_READY.get().is_none() {
        let mut api = api()?;
        api.srs_init_srs(&g1, num_points, &g2).map_err(fail("srs_init_srs"))?;
        let _ = SRS_READY.set(());
    }
    Ok(num_points)
}

/// Gate counts of the circuit (needs the SRS loaded? no: stats only).
#[uniffi::export]
pub fn circuit_stats(circuit_json_path: String) -> Result<CircuitStats, ProverError> {
    let artifact = load_artifact(&circuit_json_path)?;
    let mut api = api()?;
    let circuit = CircuitInput { name: String::new(), bytecode: artifact.acir_raw, verification_key: vec![] };
    let info = api.circuit_stats(circuit, false, settings_evm()).map_err(fail("circuit_stats"))?;
    Ok(CircuitStats {
        num_gates: info.num_gates,
        num_gates_dyadic: info.num_gates_dyadic,
        num_acir_opcodes: info.num_acir_opcodes,
    })
}

/// Execute the circuit only (no proof) and return the return values as
/// 32-byte big-endian field elements: issuer_key_hash (32), over18, expiry,
/// nonce (32). Cheap; used to check the derived inputs before proving.
#[uniffi::export]
pub fn execute_pid_sdjwt(circuit_json_path: String, prover_toml: String) -> Result<Vec<Vec<u8>>, ProverError> {
    let artifact = load_artifact(&circuit_json_path)?;
    let initial = build_initial_witness(&artifact.abi, &prover_toml)?;
    let stack = solve(&artifact, initial)?;
    let main_witness = stack.peek().ok_or(ProverError::Failed { msg: "empty witness stack".into() })?;
    let (_, ret) = artifact.abi.decode(&main_witness.witness).map_err(fail("abi decode"))?;
    let mut out = Vec::new();
    flatten_value(ret.as_ref(), &mut out);
    Ok(out)
}

fn flatten_value(v: Option<&noirc_abi::input_parser::InputValue>, out: &mut Vec<Vec<u8>>) {
    use noirc_abi::input_parser::InputValue;
    match v {
        None => {}
        Some(InputValue::Field(f)) => out.push(f.to_be_bytes()),
        Some(InputValue::Vec(items)) => items.iter().for_each(|i| flatten_value(Some(i), out)),
        Some(InputValue::Struct(map)) => map.values().for_each(|i| flatten_value(Some(i), out)),
        Some(InputValue::String(s)) => s.bytes().for_each(|b| out.push(FieldElement::from(b as u128).to_be_bytes())),
    }
}

/// Full pipeline: witness + UltraHonk keccak proof with the given verification
/// key (the desktop `bb write_vk -t evm` output). `init_srs` must have run.
#[uniffi::export]
pub fn prove_pid_sdjwt(
    circuit_json_path: String,
    vk_path: String,
    prover_toml: String,
    low_memory: bool,
) -> Result<ProveResult, ProverError> {
    if SRS_READY.get().is_none() {
        return Err(ProverError::Failed { msg: "init_srs has not been called".into() });
    }
    let vk = std::fs::read(&vk_path).map_err(fail("read vk"))?;
    configure_low_memory(low_memory);

    let t0 = Instant::now();
    let artifact = load_artifact(&circuit_json_path)?;
    let initial = build_initial_witness(&artifact.abi, &prover_toml)?;
    let stack = solve(&artifact, initial)?;
    let witness_raw = serialize_witness(stack)?;
    let witness_ms = t0.elapsed().as_millis() as u64;

    let t1 = Instant::now();
    let circuit = CircuitInput { name: String::new(), bytecode: artifact.acir_raw, verification_key: vk };
    let mut api = api()?;
    let resp = api.circuit_prove(circuit, &witness_raw, settings_evm()).map_err(fail("circuit_prove"))?;
    let prove_ms = t1.elapsed().as_millis() as u64;

    Ok(ProveResult {
        proof: resp.proof.concat(),
        public_inputs: resp.public_inputs,
        vk_hash: resp.vk.hash,
        witness_ms,
        prove_ms,
        peak_rss_bytes: peak_rss_bytes(),
    })
}

/// Compute the keccak/evm verification key on device (slow, ~1.4 GB on desktop).
/// Only for checking that the bundled desktop VK matches this bb build.
#[uniffi::export]
pub fn compute_vk(circuit_json_path: String) -> Result<Vec<u8>, ProverError> {
    let artifact = load_artifact(&circuit_json_path)?;
    let mut api = api()?;
    let circuit = CircuitInputNoVK { name: String::new(), bytecode: artifact.acir_raw };
    let resp = api.circuit_compute_vk(circuit, settings_evm()).map_err(fail("circuit_compute_vk"))?;
    Ok(resp.bytes)
}

/// Verify with the same settings as `bb verify -t evm`.
#[uniffi::export]
pub fn verify_pid_sdjwt(vk_path: String, proof: Vec<u8>, public_inputs: Vec<Vec<u8>>) -> Result<bool, ProverError> {
    let vk = std::fs::read(&vk_path).map_err(fail("read vk"))?;
    let fields: Vec<Vec<u8>> = proof.chunks(32).map(|c| c.to_vec()).collect();
    let mut api = api()?;
    let resp = api
        .circuit_verify(&vk, public_inputs, fields, settings_evm())
        .map_err(fail("circuit_verify"))?;
    Ok(resp.verified)
}

/// Peak resident set size of this process in bytes (VmHWM on Linux/Android,
/// ru_maxrss on macOS). 0 when unavailable.
#[uniffi::export]
pub fn peak_rss_bytes() -> u64 {
    #[cfg(any(target_os = "linux", target_os = "android"))]
    {
        if let Ok(s) = std::fs::read_to_string("/proc/self/status") {
            for line in s.lines() {
                if let Some(rest) = line.strip_prefix("VmHWM:") {
                    let kb: u64 = rest.trim().trim_end_matches("kB").trim().parse().unwrap_or(0);
                    return kb * 1024;
                }
            }
        }
        0
    }
    #[cfg(target_os = "macos")]
    {
        let mut ru: libc::rusage = unsafe { std::mem::zeroed() };
        if unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut ru) } == 0 {
            return ru.ru_maxrss as u64;
        }
        0
    }
    #[cfg(not(any(target_os = "linux", target_os = "android", target_os = "macos")))]
    {
        0
    }
}

extern "C" {
    static mut slow_low_memory: bool;
}

fn configure_low_memory(enabled: bool) {
    // Barretenberg global (polynomials/backing_memory.cpp): file backed
    // polynomial storage, roughly half the RAM for about twice the time.
    std::env::set_var("BB_SLOW_LOW_MEMORY", if enabled { "1" } else { "0" });
    unsafe {
        slow_low_memory = enabled;
    }
}

#[uniffi::export]
pub fn prover_version() -> String {
    format!(
        "nachweis_prover {} (noir 1.0.0-beta.21, barretenberg-rs 5.0.0-nightly.20260324)",
        env!("CARGO_PKG_VERSION")
    )
}
