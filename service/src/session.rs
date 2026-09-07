//! Session state machine and in-memory store.
//!
//! created -> presented -> verified -> proving -> proved -> attested
//! Any step may move to failed (with error text). A failed session is terminal.
use alloy::primitives::{Address, B256};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Created,
    Presented,
    Verified,
    Proving,
    Proved,
    Attested,
    Failed,
}

/// Public values decoded for display; mirrors nachweis_pid_lib::PublicValuesStruct.
#[derive(Debug, Clone, Serialize)]
pub struct DecodedPublicValues {
    pub issuer_key_hash: String,
    pub vct_hash: String,
    pub over18: u8,
    pub subject: Address,
    pub expiry: u64,
    pub nonce: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AttestedEvent {
    pub subject: Address,
    pub policy_id: B256,
    pub bits: String,
    pub tier: u8,
    pub expiry: u64,
    pub status_ref: B256,
    pub attester: Address,
}

#[derive(Debug, Clone)]
pub struct Session {
    pub id: Uuid,
    pub bound_address: Address,
    pub challenge: [u8; 32],
    pub nonce: [u8; 32],
    /// Lowercase hex of `nonce`, no 0x: the OpenID4VP request nonce.
    pub nonce_hex: String,
    pub verifier_session: Option<String>,
    pub openid4vp_uri: Option<String>,
    pub request_uri: Option<String>,
    pub state: State,
    pub error: Option<String>,
    /// The bound address signed "nachweis:session:<id>" (EIP-191).
    pub address_verified: bool,
    /// The presentation as handed to the bridge (server mode). Never serialized.
    pub presentation: Option<String>,
    pub public_values: Option<Vec<u8>>,
    pub decoded: Option<DecodedPublicValues>,
    pub proof_system: Option<String>,
    pub proof_bytes: Option<Vec<u8>>,
    pub vkey: Option<String>,
    pub cycles: Option<u64>,
    pub tx_hash: Option<B256>,
    pub attested: Option<AttestedEvent>,
    pub created_at: u64,
    pub updated_at: u64,
}

fn now() -> u64 {
    SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

impl Session {
    /// `id` is the verifier session id in verifier mode so the front end polls one id everywhere.
    pub fn new(id: Uuid, bound_address: Address, challenge: [u8; 32]) -> Self {
        let nonce = nachweis_pid_lib::nonce_commitment(&bound_address.0 .0, &challenge);
        let t = now();
        Self {
            id,
            bound_address,
            challenge,
            nonce,
            nonce_hex: hex::encode(nonce),
            verifier_session: None,
            openid4vp_uri: None,
            request_uri: None,
            state: State::Created,
            error: None,
            address_verified: false,
            presentation: None,
            public_values: None,
            decoded: None,
            proof_system: None,
            proof_bytes: None,
            vkey: None,
            cycles: None,
            tx_hash: None,
            attested: None,
            created_at: t,
            updated_at: t,
        }
    }

    pub fn set_state(&mut self, s: State) {
        self.state = s;
        self.updated_at = now();
    }

    pub fn fail(&mut self, err: impl Into<String>) {
        self.error = Some(err.into());
        self.set_state(State::Failed);
    }

    /// One human-readable line for the front end.
    pub fn detail(&self) -> String {
        match self.state {
            State::Created => {
                if self.verifier_session.is_some() { "waiting for the wallet".into() } else { "waiting for the presentation".into() }
            }
            State::Presented => "checking the presentation".into(),
            State::Verified => match &self.decoded {
                Some(d) => format!("statement verified, over18={}", d.over18 == 1),
                None => "statement verified".into(),
            },
            State::Proving => "generating proof".into(),
            State::Proved => match (&self.proof_system, self.cycles) {
                (Some(s), Some(c)) => format!("proof ready ({s}, {}k cycles)", c / 1000),
                (Some(s), None) => format!("proof ready ({s})"),
                _ => "proof ready".into(),
            },
            State::Attested => match self.tx_hash {
                Some(h) => format!("attested in {h}"),
                None => "attested".into(),
            },
            State::Failed => self.error.clone().unwrap_or_else(|| "failed".into()),
        }
    }

    /// JSON view. The presentation and the raw challenge never leave the process here;
    /// the challenge is returned once, by POST /sessions.
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "session_id": self.id,
            "state": self.state,
            "detail": self.detail(),
            "error": self.error,
            "address_verified": self.address_verified,
            "bound_address": self.bound_address,
            "nonce": self.nonce_hex,
            "verifier_session": self.verifier_session,
            "openid4vp_uri": self.openid4vp_uri,
            "request_uri": self.request_uri,
            "public_values_hex": self.public_values.as_ref().map(|b| format!("0x{}", hex::encode(b))),
            "public_values": self.decoded,
            "proof_system": self.proof_system,
            "proof_hex": self.proof_bytes.as_ref().map(|b| format!("0x{}", hex::encode(b))),
            "vkey": self.vkey,
            "cycles": self.cycles,
            "tx_hash": self.tx_hash,
            "attested": self.attested,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        })
    }
}

pub type Store = Arc<Mutex<HashMap<Uuid, Session>>>;

pub fn new_store() -> Store {
    Arc::new(Mutex::new(HashMap::new()))
}
