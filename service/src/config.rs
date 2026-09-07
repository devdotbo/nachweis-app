//! Configuration from environment variables. See README.md for the full list.
use crate::prover::ProofMode;
use alloy::primitives::{keccak256, Address, B256};
use anyhow::{anyhow, Context, Result};
use std::net::SocketAddr;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    /// Listen address (BIND, default 127.0.0.1:8787).
    pub bind: SocketAddr,
    /// Ethereum JSON-RPC endpoint (RPC_URL). Attest endpoints are disabled without it.
    pub rpc_url: Option<String>,
    /// Operator key that signs attest and revoke transactions (OPERATOR_PRIVATE_KEY).
    pub operator_private_key: Option<String>,
    /// AttestationRegistry address (REGISTRY).
    pub registry: Option<Address>,
    /// Policy id (POLICY_ID): 0x-prefixed 32-byte hex, or any string which is keccak256-hashed.
    pub policy_id: B256,
    /// verifier-service base URL (VERIFIER_URL). Unset selects local mode.
    pub verifier_url: Option<String>,
    /// PROOF_MODE=mock|execute|compressed|groth16 (default mock).
    pub proof_mode: ProofMode,
    /// Directory with vkey.txt, calldata-groth16.json and optionally the guest ELF (PROVER_ARTIFACTS).
    pub prover_artifacts: PathBuf,
    /// Explicit guest ELF path (PROVER_ELF). Falls back to PROVER_ARTIFACTS/nachweis-pid-program
    /// and then to the prover-sp1 build output.
    pub prover_elf: Option<PathBuf>,
    /// vct the statement expects (EXPECTED_VCT, default urn:eudi:pid:de:1).
    pub expected_vct: String,
    /// KB-JWT audience the statement expects (EXPECTED_AUD, default https://self-issued.me/v2).
    pub expected_aud: String,
    /// Issuer P-256 key, SEC1 uncompressed hex (ISSUER_KEY_SEC1_HEX). When unset the key is
    /// taken from the x5c leaf certificate in the issuer JWT header.
    pub issuer_key_sec1: Option<Vec<u8>>,
}

fn env_opt(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|s| !s.trim().is_empty())
}

pub fn parse_policy_id(s: &str) -> Result<B256> {
    if let Some(h) = s.strip_prefix("0x") {
        let bytes = hex::decode(h).context("POLICY_ID hex")?;
        if bytes.len() != 32 {
            return Err(anyhow!("POLICY_ID must be 32 bytes, got {}", bytes.len()));
        }
        Ok(B256::from_slice(&bytes))
    } else {
        Ok(keccak256(s.as_bytes()))
    }
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let bind = env_opt("BIND").unwrap_or_else(|| "127.0.0.1:8787".into()).parse().context("BIND")?;
        let registry = match env_opt("REGISTRY") {
            Some(a) => Some(a.parse::<Address>().context("REGISTRY")?),
            None => None,
        };
        let policy_id = parse_policy_id(&env_opt("POLICY_ID").unwrap_or_else(|| "nachweis-demo-policy".into()))?;
        let proof_mode = env_opt("PROOF_MODE").unwrap_or_else(|| "mock".into()).parse()?;
        let prover_artifacts = env_opt("PROVER_ARTIFACTS")
            .map(PathBuf::from)
            .unwrap_or_else(|| manifest_dir.join("../prover-sp1/fixtures"));
        let issuer_key_sec1 = match env_opt("ISSUER_KEY_SEC1_HEX") {
            Some(h) => Some(hex::decode(h.trim_start_matches("0x")).context("ISSUER_KEY_SEC1_HEX")?),
            None => None,
        };
        Ok(Self {
            bind,
            rpc_url: env_opt("RPC_URL"),
            operator_private_key: env_opt("OPERATOR_PRIVATE_KEY"),
            registry,
            policy_id,
            verifier_url: env_opt("VERIFIER_URL").map(|u| u.trim_end_matches('/').to_string()),
            proof_mode,
            prover_artifacts,
            prover_elf: env_opt("PROVER_ELF").map(PathBuf::from),
            expected_vct: env_opt("EXPECTED_VCT").unwrap_or_else(|| "urn:eudi:pid:de:1".into()),
            expected_aud: env_opt("EXPECTED_AUD").unwrap_or_else(|| "https://self-issued.me/v2".into()),
            issuer_key_sec1,
        })
    }

    /// Candidate ELF locations, first existing wins.
    pub fn elf_candidates(&self) -> Vec<PathBuf> {
        let mut v = Vec::new();
        if let Some(p) = &self.prover_elf {
            v.push(p.clone());
        }
        v.push(self.prover_artifacts.join("nachweis-pid-program"));
        v.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../prover-sp1/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/nachweis-pid-program"),
        );
        v
    }
}
