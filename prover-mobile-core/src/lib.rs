//! prover-mobile-core: the shared Rust core of the Nachweis on-phone provers
//! (iOS and Android). See README.md for the API and TOOLCHAIN.md for versions.

pub mod inputs;
#[cfg(feature = "noir")]
pub mod noir;

pub use inputs::{derive, derive_with_bounds, issuer_key_from_x5c, AgeShape, Bounds, CircuitInputs, ExpectedOutputs, ProverInput, PINNED_AUD};

#[derive(Debug, thiserror::Error)]
#[cfg_attr(feature = "uniffi", derive(uniffi::Error))]
pub enum CoreError {
    #[error("InputError: {0}")]
    Input(String),
    #[error("ProverError: {0}")]
    Prover(String),
}

// Initializes the shared UniFFI scaffolding and defines mopro's `MoproError`.
mopro_ffi::app!();

/// Number of flattened field elements `fn main` takes, computed from the
/// artifact ABI. Used to check `CircuitInputs::to_flat_witness` against the
/// artifact that is actually bundled.
pub fn abi_witness_len(circuit_json: &str) -> Result<usize, CoreError> {
    let v: serde_json::Value =
        serde_json::from_str(circuit_json).map_err(|e| CoreError::Input(format!("circuit json: {e}")))?;
    fn count(t: &serde_json::Value) -> usize {
        match t["kind"].as_str() {
            Some("array") => t["length"].as_u64().unwrap_or(0) as usize * count(&t["type"]),
            Some("struct") => t["fields"].as_array().map(|f| f.iter().map(|x| count(&x["type"])).sum()).unwrap_or(0),
            Some("tuple") => t["fields"].as_array().map(|f| f.iter().map(count).sum()).unwrap_or(0),
            Some("string") => t["length"].as_u64().unwrap_or(0) as usize,
            _ => 1,
        }
    }
    Ok(v["abi"]["parameters"]
        .as_array()
        .map(|p| p.iter().map(|x| count(&x["type"])).sum())
        .unwrap_or(0))
}

// ---- UniFFI surface (Swift / Kotlin) ------------------------------------------

/// Derived inputs as the app needs them: the Prover.toml text (for debugging
/// and the parity test), the flat witness values and the expected public
/// outputs.
#[cfg_attr(feature = "uniffi", derive(uniffi::Record))]
pub struct DerivedInputs {
    pub prover_toml: String,
    pub witness: Vec<String>,
    pub issuer_key_hash_hex: String,
    pub over18: u8,
    pub expiry: u64,
    pub nonce_hex: String,
    pub subject_hex: String,
    /// The issuer key actually used (SEC1 hex), for display when it came from x5c.
    pub issuer_key_sec1_hex: String,
    /// 86 public inputs, 32-byte big-endian each, hex without 0x.
    pub public_inputs_hex: Vec<String>,
}

/// Prover.toml text for the presentation, as `circuits/tools/gen-prover.ts`
/// writes it (issuer key from the x5c leaf, aud = the pinned client_id,
/// bounds = the WP13 circuit). The minimal entry point agreed with the
/// Android side; `derive_inputs` below returns the witness as well.
#[cfg_attr(feature = "uniffi", uniffi::export)]
pub fn derive_prover_inputs(presentation: String, bound_address: String, challenge_hex: String) -> Result<String, CoreError> {
    let ci = derive(&ProverInput {
        presentation,
        issuer_key_sec1_hex: String::new(),
        bound_address_hex: bound_address,
        challenge_hex,
        expected_aud: None,
    })?;
    Ok(ci.to_prover_toml())
}

/// `circuit_json_path`: the bundled artifact; its ABI gives the BoundedVec
/// capacities and the witness order. `issuer_key_sec1_hex` empty: from the
/// x5c leaf. `expected_aud` empty: `PINNED_AUD`.
#[cfg_attr(feature = "uniffi", uniffi::export)]
pub fn derive_inputs(
    circuit_json_path: String,
    presentation: String,
    issuer_key_sec1_hex: String,
    bound_address_hex: String,
    challenge_hex: String,
    expected_aud: String,
) -> Result<DerivedInputs, CoreError> {
    let json = std::fs::read_to_string(&circuit_json_path).map_err(|e| CoreError::Input(format!("{circuit_json_path}: {e}")))?;
    let artifact: serde_json::Value = serde_json::from_str(&json).map_err(|e| CoreError::Input(format!("circuit json: {e}")))?;
    drop(json);
    let bounds = Bounds::from_abi(&artifact["abi"])?;
    let input = ProverInput {
        presentation,
        issuer_key_sec1_hex,
        bound_address_hex,
        challenge_hex,
        expected_aud: if expected_aud.is_empty() { None } else { Some(expected_aud) },
    };
    let ci = derive_with_bounds(&input, bounds)?;
    Ok(DerivedInputs {
        prover_toml: ci.to_prover_toml(),
        witness: ci.to_flat_witness(&artifact["abi"])?,
        issuer_key_hash_hex: ci.expected.issuer_key_hash_hex.clone(),
        over18: ci.expected.over18,
        expiry: ci.expected.expiry,
        nonce_hex: ci.expected.nonce_hex.clone(),
        subject_hex: ci.expected.subject_hex.clone(),
        issuer_key_sec1_hex: format!("04{}{}", hex::encode(ci.issuer_pub_x), hex::encode(ci.issuer_pub_y)),
        public_inputs_hex: ci.expected_public_inputs().iter().map(hex::encode).collect(),
    })
}

// ---- proving (feature noir) ------------------------------------------------------

#[cfg_attr(feature = "uniffi", derive(uniffi::Record))]
pub struct ProofResult {
    /// The proof exactly as `bb prove` writes it (10,304 bytes for pid-sdjwt).
    pub proof: Vec<u8>,
    /// 86 x 32 bytes, in verifier order; concatenated it is bb's `public_inputs` file.
    pub public_inputs: Vec<Vec<u8>>,
    pub execute_ms: u64,
    pub prove_ms: u64,
    /// Peak resident set size of the process after proving, bytes (0 if unknown).
    pub peak_rss_bytes: u64,
}

#[cfg(feature = "noir")]
fn peak_rss() -> u64 {
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    unsafe {
        let mut ru: libc::rusage = std::mem::zeroed();
        if libc::getrusage(libc::RUSAGE_SELF, &mut ru) == 0 {
            return ru.ru_maxrss as u64; // bytes on Darwin
        }
    }
    #[cfg(target_os = "android")]
    unsafe {
        let mut ru: libc::rusage = std::mem::zeroed();
        if libc::getrusage(libc::RUSAGE_SELF, &mut ru) == 0 {
            return ru.ru_maxrss as u64 * 1024; // kilobytes on Linux
        }
    }
    0
}

/// Dyadic circuit size (2^20 for pid-sdjwt); the SRS needs this + 1 points.
#[cfg(feature = "noir")]
#[cfg_attr(feature = "uniffi", uniffi::export)]
pub fn circuit_dyadic_size(circuit_json_path: String) -> Result<u32, CoreError> {
    let json = std::fs::read_to_string(&circuit_json_path).map_err(|e| CoreError::Prover(format!("{circuit_json_path}: {e}")))?;
    noir::dyadic_size(&noir::bytecode_from_artifact(&json)?)
}

/// Load the SRS once per process (idempotent, cheap to repeat).
#[cfg(feature = "noir")]
#[cfg_attr(feature = "uniffi", uniffi::export)]
pub fn setup_srs(circuit_json_path: String, srs_path: String) -> Result<u32, CoreError> {
    let json = std::fs::read_to_string(&circuit_json_path).map_err(|e| CoreError::Prover(format!("{circuit_json_path}: {e}")))?;
    noir::setup_srs_for(&noir::bytecode_from_artifact(&json)?, &srs_path)
}

/// Compute the verification key on device (about 1.4 GB on the desktop; the
/// apps bundle the desktop VK instead and use this only to cross-check).
#[cfg(feature = "noir")]
#[cfg_attr(feature = "uniffi", uniffi::export)]
pub fn compute_verification_key(circuit_json_path: String, srs_path: String, on_chain: bool) -> Result<Vec<u8>, CoreError> {
    let json = std::fs::read_to_string(&circuit_json_path).map_err(|e| CoreError::Prover(format!("{circuit_json_path}: {e}")))?;
    let bc = noir::bytecode_from_artifact(&json)?;
    noir::setup_srs_for(&bc, &srs_path)?;
    noir::compute_vk(&bc, on_chain)
}

/// Solve and prove. `witness` is `DerivedInputs.witness`; `vk` the bundled
/// keccak VK (`on_chain = true`, byte-compatible with `bb prove -t evm`).
#[cfg(feature = "noir")]
#[cfg_attr(feature = "uniffi", uniffi::export)]
pub fn prove(
    circuit_json_path: String,
    srs_path: String,
    vk: Vec<u8>,
    witness: Vec<String>,
    on_chain: bool,
    low_memory: bool,
) -> Result<ProofResult, CoreError> {
    let json = std::fs::read_to_string(&circuit_json_path).map_err(|e| CoreError::Prover(format!("{circuit_json_path}: {e}")))?;
    let bc = noir::bytecode_from_artifact(&json)?;
    drop(json);
    noir::setup_srs_for(&bc, &srs_path)?;
    let wm = noir::witness_map(&witness)?;
    let p = noir::prove(&bc, wm, vk, on_chain, low_memory)?;
    Ok(ProofResult {
        proof: p.proof,
        public_inputs: p.public_inputs,
        execute_ms: p.execute_ms,
        prove_ms: p.prove_ms,
        peak_rss_bytes: peak_rss(),
    })
}

#[cfg(feature = "noir")]
#[cfg_attr(feature = "uniffi", uniffi::export)]
pub fn verify(proof: Vec<u8>, public_inputs: Vec<Vec<u8>>, vk: Vec<u8>, on_chain: bool) -> Result<bool, CoreError> {
    noir::verify(&proof, public_inputs, &vk, on_chain)
}
