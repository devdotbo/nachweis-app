//! Proof generation: mock (fixture), execute (no proof), compressed, groth16.
use crate::config::Config;
use anyhow::{anyhow, Context, Result};
use nachweis_pid_lib::GuestInput;
use serde::Deserialize;
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    Elf, HashableKey, ProvingKey, SP1Stdin,
};
use std::path::Path;
use std::str::FromStr;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProofMode {
    /// Public values from the native run, proof bytes and vkey from calldata-groth16.json.
    /// Only a MockProofVerifier accepts this; the pipeline runs in seconds.
    Mock,
    /// Execute the guest (cycle count, public values), no proof.
    Execute,
    /// STARK compressed proof, verified locally, not submittable on chain.
    Compressed,
    /// Groth16 wrap, on-chain proof bytes (selector + proof).
    Groth16,
}

impl FromStr for ProofMode {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self> {
        match s.to_ascii_lowercase().as_str() {
            "mock" => Ok(Self::Mock),
            "execute" => Ok(Self::Execute),
            "compressed" => Ok(Self::Compressed),
            "groth16" => Ok(Self::Groth16),
            other => Err(anyhow!("PROOF_MODE must be mock|execute|compressed|groth16, got {other}")),
        }
    }
}

impl ProofMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Mock => "mock",
            Self::Execute => "execute",
            Self::Compressed => "compressed",
            Self::Groth16 => "groth16",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ProofOutput {
    pub system: String,
    pub public_values: Vec<u8>,
    /// On-chain proof bytes (Groth16: 4-byte selector + proof). None for execute and compressed.
    pub proof_bytes: Option<Vec<u8>>,
    pub vkey: String,
    pub cycles: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalldataFixture {
    pub system: String,
    pub vkey: String,
    pub public_values: String,
    pub proof: String,
}

pub fn load_calldata_fixture(dir: &Path) -> Result<CalldataFixture> {
    let p = dir.join("calldata-groth16.json");
    let s = std::fs::read_to_string(&p).with_context(|| format!("read {}", p.display()))?;
    serde_json::from_str(&s).with_context(|| format!("parse {}", p.display()))
}

pub fn decode_hex(s: &str) -> Result<Vec<u8>> {
    hex::decode(s.trim().trim_start_matches("0x")).context("hex")
}

fn load_elf(cfg: &Config) -> Result<Elf> {
    for p in cfg.elf_candidates() {
        if p.is_file() {
            let bytes = std::fs::read(&p).with_context(|| format!("read ELF {}", p.display()))?;
            tracing::info!(path = %p.display(), bytes = bytes.len(), "loaded guest ELF");
            return Ok(Elf::Dynamic(Arc::from(bytes.into_boxed_slice())));
        }
    }
    Err(anyhow!(
        "guest ELF not found; set PROVER_ELF or build prover-sp1 (cd prover-sp1/program && cargo prove build). Tried: {:?}",
        cfg.elf_candidates()
    ))
}

/// Generate the proof for `input`. `native_pv` is the ABI-encoded public values from the native
/// run; every mode checks that the guest agrees with it.
pub fn prove(cfg: &Config, input: &GuestInput, native_pv: &[u8]) -> Result<ProofOutput> {
    match cfg.proof_mode {
        ProofMode::Mock => {
            let fx = load_calldata_fixture(&cfg.prover_artifacts)?;
            let fixture_pv = decode_hex(&fx.public_values)?;
            if fixture_pv != native_pv {
                tracing::warn!(
                    "mock mode: fixture public values differ from this session; the proof bytes do not correspond to these public values (only a MockProofVerifier accepts them)"
                );
            }
            Ok(ProofOutput {
                system: format!("mock-{}", fx.system),
                public_values: native_pv.to_vec(),
                proof_bytes: Some(decode_hex(&fx.proof)?),
                vkey: fx.vkey,
                cycles: None,
            })
        }
        ProofMode::Execute => {
            let elf = load_elf(cfg)?;
            let mut stdin = SP1Stdin::new();
            stdin.write(input);
            let client = ProverClient::from_env();
            let (output, report) = client.execute(elf.clone(), stdin).run().map_err(|e| anyhow!("execute: {e}"))?;
            let pv = output.as_slice().to_vec();
            if pv != native_pv {
                return Err(anyhow!("guest public values differ from the native run"));
            }
            let pk = client.setup(elf).map_err(|e| anyhow!("setup: {e}"))?;
            Ok(ProofOutput {
                system: "execute".into(),
                public_values: pv,
                proof_bytes: None,
                vkey: pk.verifying_key().bytes32().to_string(),
                cycles: Some(report.total_instruction_count()),
            })
        }
        ProofMode::Compressed | ProofMode::Groth16 => {
            let elf = load_elf(cfg)?;
            let mut stdin = SP1Stdin::new();
            stdin.write(input);
            let client = ProverClient::from_env();
            let pk = client.setup(elf).map_err(|e| anyhow!("setup: {e}"))?;
            let t0 = std::time::Instant::now();
            let proof = match cfg.proof_mode {
                ProofMode::Compressed => client.prove(&pk, stdin).compressed().run(),
                _ => client.prove(&pk, stdin).groth16().run(),
            }
            .map_err(|e| anyhow!("prove: {e}"))?;
            tracing::info!(mode = cfg.proof_mode.as_str(), secs = t0.elapsed().as_secs_f64(), "proved");
            client
                .verify(&proof, pk.verifying_key(), None)
                .map_err(|e| anyhow!("local verification failed: {e}"))?;
            let pv = proof.public_values.as_slice().to_vec();
            if pv != native_pv {
                return Err(anyhow!("proof public values differ from the native run"));
            }
            let proof_bytes = match cfg.proof_mode {
                ProofMode::Groth16 => Some(proof.bytes()),
                _ => None,
            };
            Ok(ProofOutput {
                system: cfg.proof_mode.as_str().into(),
                public_values: pv,
                proof_bytes,
                vkey: pk.verifying_key().bytes32().to_string(),
                cycles: None,
            })
        }
    }
}
