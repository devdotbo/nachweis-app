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
    /// NoirPidVerifier address (NOIR_VERIFIER). When set, a client-side Noir proof is checked with an
    /// eth_call to `verify` before attestWithProof is sent, so a bad proof answers 422 instead of 502.
    pub noir_verifier: Option<Address>,
    /// Policy id (POLICY_ID): 0x-prefixed 32-byte hex, or any string which is keccak256-hashed.
    pub policy_id: B256,
    /// verifier-service base URL (VERIFIER_URL). Unset selects local mode.
    pub verifier_url: Option<String>,
    /// Shared secret the verifier expects on `GET /result/:id` as `X-Result-Token`
    /// (VERIFIER_RESULT_TOKEN; the verifier's RESULT_TOKEN). Required in verifier mode, because the
    /// verifier serves the raw presentation only behind its token.
    pub verifier_result_token: Option<String>,
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
    /// Require an EIP-191 signature from the bound address before attest (REQUIRE_ADDRESS_PROOF, default true).
    pub require_address_proof: bool,
    /// Allowed CORS origins (CORS_ORIGINS, comma separated). Unset or "*" allows any origin.
    pub cors_origins: Option<Vec<String>>,
    /// Issuer P-256 key, SEC1 uncompressed hex (ISSUER_KEY_SEC1_HEX). When unset the key is
    /// taken from the x5c leaf certificate in the issuer JWT header.
    pub issuer_key_sec1: Option<Vec<u8>>,
    /// KB-JWT freshness window in seconds (KB_JWT_WINDOW_SECS, default 600): the KB-JWT `exp`
    /// must lie within the window ahead of now and `iat` must not be older than the window.
    /// `None` (env value 0) disables the check; only for stored fixtures whose KB-JWT is stale.
    pub kb_jwt_window_secs: Option<u64>,
    /// Verifier (blind relay) base URL the phone prover should call, as advertised by
    /// `GET /sessions/:id/handoff` (HANDOFF_VERIFIER_URL; falls back to VERIFIER_URL).
    pub handoff_verifier_url: Option<String>,
    /// This bridge's base URL as reachable from the phone (HANDOFF_BRIDGE_URL; falls back to the
    /// scheme and Host of the request that fetched the handoff).
    pub handoff_bridge_url: Option<String>,
    /// Bearer token for the issuer's privileged routes: attest-operator, approve, revoke
    /// (BRIDGE_ISSUER_TOKEN). Unset: those routes answer 503 and a warning is logged at startup.
    pub issuer_token: Option<String>,
}

/// Default KB-JWT freshness window (10 minutes): sandbox wallets mint KB-JWTs with exp = iat + 300.
pub const DEFAULT_KB_JWT_WINDOW_SECS: u64 = 600;

/// Default policy: keccak256("nachweis.pid.over18.v1") = 0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f.
pub const DEFAULT_POLICY: &str = "nachweis.pid.over18.v1";

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
        let noir_verifier = match env_opt("NOIR_VERIFIER") {
            Some(a) => Some(a.parse::<Address>().context("NOIR_VERIFIER")?),
            None => None,
        };
        let policy_id = parse_policy_id(&env_opt("POLICY_ID").unwrap_or_else(|| DEFAULT_POLICY.into()))?;
        let proof_mode = env_opt("PROOF_MODE").unwrap_or_else(|| "mock".into()).parse()?;
        let prover_artifacts = env_opt("PROVER_ARTIFACTS")
            .map(PathBuf::from)
            .unwrap_or_else(|| manifest_dir.join("../prover-sp1/fixtures"));
        let issuer_key_sec1 = match env_opt("ISSUER_KEY_SEC1_HEX") {
            Some(h) => Some(hex::decode(h.trim_start_matches("0x")).context("ISSUER_KEY_SEC1_HEX")?),
            None => None,
        };
        let require_address_proof = match env_opt("REQUIRE_ADDRESS_PROOF").as_deref() {
            None => true,
            Some(v) => !matches!(v.to_ascii_lowercase().as_str(), "0" | "false" | "no" | "off"),
        };
        let kb_jwt_window_secs = match env_opt("KB_JWT_WINDOW_SECS") {
            None => Some(DEFAULT_KB_JWT_WINDOW_SECS),
            Some(v) => match v.trim().parse::<u64>().context("KB_JWT_WINDOW_SECS")? {
                0 => None,
                n => Some(n),
            },
        };
        let cors_origins = env_opt("CORS_ORIGINS")
            .filter(|v| v.trim() != "*")
            .map(|v| v.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect());
        Ok(Self {
            bind,
            rpc_url: env_opt("RPC_URL"),
            operator_private_key: env_opt("OPERATOR_PRIVATE_KEY"),
            registry,
            noir_verifier,
            policy_id,
            verifier_url: env_opt("VERIFIER_URL").map(|u| u.trim_end_matches('/').to_string()),
            verifier_result_token: env_opt("VERIFIER_RESULT_TOKEN"),
            proof_mode,
            prover_artifacts,
            prover_elf: env_opt("PROVER_ELF").map(PathBuf::from),
            expected_vct: env_opt("EXPECTED_VCT").unwrap_or_else(|| "urn:eudi:pid:de:1".into()),
            expected_aud: env_opt("EXPECTED_AUD").unwrap_or_else(|| "https://self-issued.me/v2".into()),
            require_address_proof,
            cors_origins,
            issuer_key_sec1,
            kb_jwt_window_secs,
            handoff_verifier_url: env_opt("HANDOFF_VERIFIER_URL").map(|u| u.trim_end_matches('/').to_string()),
            handoff_bridge_url: env_opt("HANDOFF_BRIDGE_URL").map(|u| u.trim_end_matches('/').to_string()),
            issuer_token: env_opt("BRIDGE_ISSUER_TOKEN").map(|t| t.trim().to_string()),
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
