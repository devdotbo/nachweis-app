//! Witness execution (acvm at the circuit's Noir tag) and UltraHonk proving
//! (barretenberg-rs at the desktop bb version). Same function shapes as
//! zkmopro/noir-rs main, so a later switch back to noir-rs is a rename.

use std::io::Read;
use std::time::Instant;

use acvm::acir::{
    circuit::Program,
    native_types::{Witness, WitnessMap, WitnessStack},
    FieldElement,
};
use barretenberg_rs::{
    backends::FfiBackend,
    generated_types::{CircuitInput, CircuitInputNoVK, ProofSystemSettings},
    BarretenbergApi,
};
use base64::Engine;
use bn254_blackbox_solver::Bn254BlackBoxSolver;
use flate2::read::GzDecoder;
use nargo::foreign_calls::default::DefaultForeignCallBuilder;
use nargo::ops::execute_program;

use crate::CoreError;

pub const FIELD_ELEMENT_SIZE: usize = 32;

/// bn254 G2 point of the Aztec transcript (crs.aztec.network g2.dat), 128 bytes.
/// Same constant as noir-rs `srs/mod.rs`; identical to ~/.bb-crs/bn254_g2.dat.
const G2: [u8; 128] = [
    1, 24, 196, 213, 184, 55, 188, 194, 188, 137, 181, 179, 152, 181, 151, 78, 159, 89, 68, 7, 59,
    50, 7, 139, 126, 35, 31, 236, 147, 136, 131, 176, 38, 14, 1, 178, 81, 246, 241, 199, 231, 255,
    78, 88, 7, 145, 222, 232, 234, 81, 216, 122, 53, 142, 3, 139, 78, 254, 48, 250, 192, 147, 131,
    193, 34, 254, 189, 163, 192, 192, 99, 42, 86, 71, 91, 66, 20, 229, 97, 94, 17, 230, 221, 63,
    150, 230, 206, 162, 133, 74, 135, 212, 218, 204, 94, 85, 4, 252, 99, 105, 247, 17, 15, 227,
    210, 81, 86, 193, 187, 154, 114, 133, 156, 242, 160, 70, 65, 249, 155, 164, 238, 65, 60, 128,
    218, 106, 95, 228,
];

fn perr(m: impl Into<String>) -> CoreError {
    CoreError::Prover(m.into())
}

fn api() -> Result<BarretenbergApi<FfiBackend>, CoreError> {
    let backend = FfiBackend::new().map_err(|e| perr(format!("FfiBackend: {e}")))?;
    Ok(BarretenbergApi::new(backend))
}

/// `-t evm` in bb: keccak transcript, ZK on, no IPA accumulation.
pub fn settings(on_chain: bool) -> ProofSystemSettings {
    ProofSystemSettings {
        ipa_accumulation: false,
        oracle_hash_type: if on_chain { "keccak" } else { "poseidon2" }.to_string(),
        disable_zk: false,
        optimized_solidity_verifier: false,
    }
}

/// The `bytecode` field of the nargo artifact (base64 of gzip of ACIR).
pub fn bytecode_from_artifact(circuit_json: &str) -> Result<String, CoreError> {
    let v: serde_json::Value = serde_json::from_str(circuit_json).map_err(|e| perr(format!("artifact json: {e}")))?;
    v["bytecode"].as_str().map(str::to_string).ok_or_else(|| perr("artifact has no bytecode"))
}

fn program(bytecode: &str) -> Result<Program<FieldElement>, CoreError> {
    let buf = base64::engine::general_purpose::STANDARD.decode(bytecode).map_err(|e| perr(format!("bytecode base64: {e}")))?;
    Program::deserialize_program(&buf).map_err(|e| perr(format!("deserialize program: {e}")))
}

/// Uncompressed ACIR buffer as bb's C API wants it.
fn acir_uncompressed(bytecode: &str) -> Result<Vec<u8>, CoreError> {
    let p = program(bytecode)?;
    let reserialized = Program::serialize_program(&p);
    let mut d = GzDecoder::new(reserialized.as_slice());
    let mut out = Vec::new();
    d.read_to_end(&mut out).map_err(|e| perr(format!("gunzip acir: {e}")))?;
    Ok(out)
}

pub fn witness_map(values: &[String]) -> Result<WitnessMap<FieldElement>, CoreError> {
    let mut m = WitnessMap::new();
    for (i, s) in values.iter().enumerate() {
        let f = FieldElement::try_from_str(s).ok_or_else(|| perr(format!("witness {i}: cannot parse {s:?}")))?;
        m.insert(Witness(i as u32), f);
    }
    Ok(m)
}

pub fn execute(bytecode: &str, initial: WitnessMap<FieldElement>) -> Result<WitnessStack<FieldElement>, CoreError> {
    let p = program(bytecode)?;
    let solver = Bn254BlackBoxSolver::default();
    let mut fc = DefaultForeignCallBuilder::default().build();
    execute_program(&p, initial, &solver, &mut fc).map_err(|e| perr(format!("execute: {e}")))
}

fn serialize_witness(stack: WitnessStack<FieldElement>) -> Result<Vec<u8>, CoreError> {
    let compressed = stack.serialize().map_err(|e| perr(format!("serialize witness: {e}")))?;
    let mut d = GzDecoder::new(compressed.as_slice());
    let mut out = Vec::new();
    d.read_to_end(&mut out).map_err(|e| perr(format!("gunzip witness: {e}")))?;
    Ok(out)
}

pub fn dyadic_size(bytecode: &str) -> Result<u32, CoreError> {
    let acir = acir_uncompressed(bytecode)?;
    let circuit = CircuitInput { name: String::new(), bytecode: acir, verification_key: vec![] };
    let info = api()?.circuit_stats(circuit, false, settings(false)).map_err(|e| perr(format!("circuit_stats: {e}")))?;
    Ok(info.num_gates_dyadic)
}

/// Load `num_points` G1 points from a bb-format `g1.dat` (64 bytes per point,
/// no header; `~/.bb-crs/bn254_g1.dat` or crs.aztec.network/g1.dat) and hand
/// them to bb. UltraHonk needs dyadic_size + 1 points.
pub fn setup_srs(srs_path: &str, num_points: u32) -> Result<(), CoreError> {
    let need = num_points as usize * 64;
    let mut f = std::fs::File::open(srs_path).map_err(|e| perr(format!("srs {srs_path}: {e}")))?;
    let mut g1 = vec![0u8; need];
    f.read_exact(&mut g1).map_err(|e| perr(format!("srs {srs_path}: need {need} bytes: {e}")))?;
    api()?.srs_init_srs(&g1, num_points, &G2).map_err(|e| perr(format!("srs_init: {e}")))?;
    Ok(())
}

pub fn setup_srs_for(bytecode: &str, srs_path: &str) -> Result<u32, CoreError> {
    let n = dyadic_size(bytecode)? + 1;
    setup_srs(srs_path, n)?;
    Ok(n)
}

pub struct Proof {
    pub proof: Vec<u8>,
    pub public_inputs: Vec<Vec<u8>>,
    pub execute_ms: u64,
    pub prove_ms: u64,
}

fn set_low_memory(on: bool) {
    std::env::set_var("BB_SLOW_LOW_MEMORY", if on { "1" } else { "0" });
}

pub fn compute_vk(bytecode: &str, on_chain: bool) -> Result<Vec<u8>, CoreError> {
    let acir = acir_uncompressed(bytecode)?;
    let r = api()?
        .circuit_compute_vk(CircuitInputNoVK { name: String::new(), bytecode: acir }, settings(on_chain))
        .map_err(|e| perr(format!("compute_vk: {e}")))?;
    Ok(r.bytes)
}

/// Solve the witness, then prove. `vk` is the verification key for the same
/// settings (the desktop `bb write_vk -t evm` output for on_chain). The proof
/// bytes are exactly what `bb prove` writes to `proof`; public inputs are
/// returned separately (what bb writes to `public_inputs`).
pub fn prove(bytecode: &str, initial: WitnessMap<FieldElement>, vk: Vec<u8>, on_chain: bool, low_memory: bool) -> Result<Proof, CoreError> {
    set_low_memory(low_memory);
    let t0 = Instant::now();
    let solved = execute(bytecode, initial)?;
    let witness = serialize_witness(solved)?;
    let execute_ms = t0.elapsed().as_millis() as u64;
    let acir = acir_uncompressed(bytecode)?;
    let t1 = Instant::now();
    let r = api()?
        .circuit_prove(CircuitInput { name: String::new(), bytecode: acir, verification_key: vk }, &witness, settings(on_chain))
        .map_err(|e| perr(format!("circuit_prove: {e}")))?;
    Ok(Proof {
        proof: r.proof.concat(),
        public_inputs: r.public_inputs,
        execute_ms,
        prove_ms: t1.elapsed().as_millis() as u64,
    })
}

pub fn verify(proof: &[u8], public_inputs: Vec<Vec<u8>>, vk: &[u8], on_chain: bool) -> Result<bool, CoreError> {
    let fields: Vec<Vec<u8>> = proof.chunks(FIELD_ELEMENT_SIZE).map(<[u8]>::to_vec).collect();
    let r = api()?
        .circuit_verify(vk, public_inputs, fields, settings(on_chain))
        .map_err(|e| perr(format!("circuit_verify: {e}")))?;
    Ok(r.verified)
}
