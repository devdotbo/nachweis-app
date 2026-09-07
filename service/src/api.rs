//! HTTP surface and the presentation -> proof -> attestation pipeline.
use crate::chain::{self, Chain};
use crate::config::Config;
use crate::prover;
use crate::session::{new_store, Session, State, Store};
use crate::statement;
use crate::verifier::VerifierClient;
use alloy::primitives::{Address, U256};
use axum::extract::{Path, State as AxState};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use rand::RngCore;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use uuid::Uuid;

pub struct AppState {
    pub cfg: Config,
    pub sessions: Store,
    pub chain: Option<Chain>,
    pub verifier: Option<VerifierClient>,
}

impl AppState {
    pub fn new(cfg: Config, chain: Option<Chain>) -> Self {
        let verifier = cfg.verifier_url.as_deref().map(VerifierClient::new);
        Self { cfg, sessions: new_store(), chain, verifier }
    }
}

pub type Shared = Arc<AppState>;

pub struct AppError(StatusCode, String);

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

fn bad(m: impl Into<String>) -> AppError {
    AppError(StatusCode::BAD_REQUEST, m.into())
}
fn not_found(m: impl Into<String>) -> AppError {
    AppError(StatusCode::NOT_FOUND, m.into())
}
fn unauthorized(m: impl Into<String>) -> AppError {
    AppError(StatusCode::UNAUTHORIZED, m.into())
}
fn conflict(m: impl Into<String>) -> AppError {
    AppError(StatusCode::CONFLICT, m.into())
}
fn unavailable(m: impl Into<String>) -> AppError {
    AppError(StatusCode::SERVICE_UNAVAILABLE, m.into())
}
fn internal(e: impl std::fmt::Display) -> AppError {
    AppError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}

pub fn router(state: Shared) -> Router {
    let cors = match &state.cfg.cors_origins {
        None => CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any),
        Some(list) => {
            let origins: Vec<_> = list.iter().filter_map(|o| o.parse().ok()).collect();
            CorsLayer::new().allow_origin(AllowOrigin::list(origins)).allow_methods(Any).allow_headers(Any)
        }
    };
    Router::new()
        .route("/health", get(health))
        .route("/sessions", post(create_session))
        .route("/sessions/:id", get(get_session))
        .route("/sessions/:id/presentation", post(post_presentation))
        .route("/sessions/:id/address-proof", post(address_proof))
        .route("/sessions/:id/attest", post(attest))
        .route("/sessions/:id/attest-operator", post(attest_operator))
        .route("/revoke", post(revoke))
        .with_state(state)
        .layer(cors)
}

async fn health(AxState(st): AxState<Shared>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "proof_mode": st.cfg.proof_mode.as_str(),
        "mode": if st.verifier.is_some() { "verifier" } else { "local" },
        "chain": st.chain.as_ref().map(|c| json!({ "registry": c.registry, "operator": c.operator })),
        "policy_id": st.cfg.policy_id,
        "require_address_proof": st.cfg.require_address_proof,
    }))
}

#[derive(Deserialize)]
pub struct CreateSession {
    pub bound_address: Address,
    #[serde(default)]
    pub challenge_hex: Option<String>,
}

fn parse_session_id(id: &str) -> Result<Uuid, AppError> {
    id.parse().map_err(|_| bad("invalid session id"))
}

fn with_session<T>(st: &AppState, id: Uuid, f: impl FnOnce(&mut Session) -> T) -> Result<T, AppError> {
    let mut map = st.sessions.lock().map_err(|_| internal("session store poisoned"))?;
    let s = map.get_mut(&id).ok_or_else(|| not_found("session not found"))?;
    Ok(f(s))
}

async fn create_session(AxState(st): AxState<Shared>, Json(req): Json<CreateSession>) -> Result<Json<Value>, AppError> {
    let mut challenge = [0u8; 32];
    match &req.challenge_hex {
        Some(h) => {
            let b = hex::decode(h.trim_start_matches("0x")).map_err(|e| bad(format!("challenge_hex: {e}")))?;
            if b.len() != 32 {
                return Err(bad(format!("challenge_hex must be 32 bytes, got {}", b.len())));
            }
            challenge.copy_from_slice(&b);
        }
        None => rand::thread_rng().fill_bytes(&mut challenge),
    }
    let nonce_hex = nachweis_pid_lib::nonce_string(&req.bound_address.0 .0, &challenge);
    // Verifier mode: the verifier's session id becomes the bridge session id, so the app polls one id.
    let (id, created) = match &st.verifier {
        Some(v) => {
            let created = v.create_request(&nonce_hex).await.map_err(|e| AppError(StatusCode::BAD_GATEWAY, e.to_string()))?;
            let id: Uuid = created
                .session
                .parse()
                .map_err(|_| AppError(StatusCode::BAD_GATEWAY, format!("verifier session id is not a UUID: {}", created.session)))?;
            (id, Some(created))
        }
        None => (Uuid::new_v4(), None),
    };
    let mut session = Session::new(id, req.bound_address, challenge);
    if let Some(created) = created {
        session.verifier_session = Some(created.session.clone());
        session.openid4vp_uri = Some(created.authorization_request.clone());
        session.request_uri = created.request_uri.clone();
        spawn_poller(st.clone(), id, created.session);
    }

    let id = session.id;
    let out = json!({
        "session_id": id,
        "nonce": session.nonce_hex,
        "challenge_hex": hex::encode(challenge),
        "bound_address": session.bound_address,
        "openid4vp_uri": session.openid4vp_uri,
        "request_uri": session.request_uri,
        "mode": if st.verifier.is_some() { "verifier" } else { "local" },
        "address_proof_message": chain::address_proof_message(id),
    });
    st.sessions.lock().map_err(|_| internal("session store poisoned"))?.insert(id, session);
    Ok(Json(out))
}

/// Verifier mode: poll the verifier until the presentation is available, then run the pipeline.
fn spawn_poller(st: Shared, id: Uuid, verifier_session: String) {
    tokio::spawn(async move {
        let Some(v) = st.verifier.clone() else { return };
        let deadline = tokio::time::Instant::now() + Duration::from_secs(600);
        loop {
            if tokio::time::Instant::now() > deadline {
                let _ = with_session(&st, id, |s| s.fail("timed out waiting for the wallet"));
                return;
            }
            // Stop when the session was fed locally in the meantime.
            let state = with_session(&st, id, |s| s.state).unwrap_or(State::Failed);
            if state != State::Created {
                return;
            }
            match v.fetch_result(&verifier_session).await {
                Ok(Some(presentation)) => {
                    let _ = run_pipeline(st.clone(), id, presentation).await;
                    return;
                }
                Ok(None) => {}
                Err(e) => {
                    let _ = with_session(&st, id, |s| s.fail(e.to_string()));
                    return;
                }
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    });
}

async fn get_session(AxState(st): AxState<Shared>, Path(id): Path<String>) -> Result<Json<Value>, AppError> {
    let id = parse_session_id(&id)?;
    with_session(&st, id, |s| Json(s.to_json()))
}

#[derive(Deserialize)]
pub struct AddressProof {
    pub signature: String,
}

/// The bound address proves control of its key: EIP-191 signature over "nachweis:session:<id>".
async fn address_proof(
    AxState(st): AxState<Shared>,
    Path(id): Path<String>,
    Json(req): Json<AddressProof>,
) -> Result<Json<Value>, AppError> {
    let id = parse_session_id(&id)?;
    let bound = with_session(&st, id, |s| s.bound_address)?;
    let signer = chain::recover_address_proof(id, &req.signature).map_err(|e| bad(e.to_string()))?;
    if signer != bound {
        return Err(unauthorized(format!("signature recovers to {signer}, session is bound to {bound}")));
    }
    with_session(&st, id, |s| s.address_verified = true)?;
    Ok(Json(json!({ "session_id": id, "address_verified": true, "signer": signer })))
}

fn require_address_proof(st: &AppState, session: &Session) -> Result<(), AppError> {
    if st.cfg.require_address_proof && !session.address_verified {
        return Err(conflict(format!(
            "address proof required: POST /sessions/{}/address-proof with an EIP-191 signature over \"{}\" by {}",
            session.id,
            chain::address_proof_message(session.id),
            session.bound_address
        )));
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct PostPresentation {
    pub sd_jwt_presentation: String,
}

async fn post_presentation(
    AxState(st): AxState<Shared>,
    Path(id): Path<String>,
    Json(req): Json<PostPresentation>,
) -> Result<Json<Value>, AppError> {
    let id = parse_session_id(&id)?;
    let state = with_session(&st, id, |s| s.state)?;
    if state != State::Created {
        return Err(conflict(format!("session is {:?}, expected created", state).to_lowercase()));
    }
    run_pipeline(st.clone(), id, req.sd_jwt_presentation).await?;
    with_session(&st, id, |s| {
        Json(json!({
            "session_id": s.id,
            "status": s.state,
            "error": s.error,
            "public_values_hex": s.public_values.as_ref().map(|b| format!("0x{}", hex::encode(b))),
            "public_values": s.decoded,
            "proof_hex": s.proof_bytes.as_ref().map(|b| format!("0x{}", hex::encode(b))),
            "proof_system": s.proof_system,
            "vkey": s.vkey,
            "cycles": s.cycles,
        }))
    })
}

/// presented -> verified (native statement) -> proving -> proved, or failed.
async fn run_pipeline(st: Shared, id: Uuid, presentation: String) -> Result<(), AppError> {
    let (session, cfg) = with_session(&st, id, |s| {
        s.presentation = Some(presentation.clone());
        s.set_state(State::Presented);
        (s.clone(), st.cfg.clone())
    })?;

    // 1. Native run: fast fail with the statement's own error text.
    let input = match statement::build_input(&cfg, &session, &presentation) {
        Ok(i) => i,
        Err(e) => {
            with_session(&st, id, |s| s.fail(e.to_string()))?;
            return Err(AppError(StatusCode::UNPROCESSABLE_ENTITY, e.to_string()));
        }
    };
    let native = {
        let input = input.clone();
        tokio::task::spawn_blocking(move || statement::run_native(&input)).await.map_err(internal)?
    };
    let (_pv, pv_bytes) = match native {
        Ok(x) => x,
        Err(e) => {
            with_session(&st, id, |s| s.fail(e.to_string()))?;
            return Err(AppError(StatusCode::UNPROCESSABLE_ENTITY, e.to_string()));
        }
    };
    let decoded = statement::decode_public_values(&pv_bytes).map_err(internal)?;
    with_session(&st, id, |s| {
        s.public_values = Some(pv_bytes.clone());
        s.decoded = Some(decoded);
        s.set_state(State::Verified);
        s.set_state(State::Proving);
    })?;

    // 2. Proof.
    let out = {
        let cfg = cfg.clone();
        let pv = pv_bytes.clone();
        tokio::task::spawn_blocking(move || prover::prove(&cfg, &input, &pv)).await.map_err(internal)?
    };
    match out {
        Ok(p) => with_session(&st, id, |s| {
            s.public_values = Some(p.public_values);
            s.proof_bytes = p.proof_bytes;
            s.proof_system = Some(p.system);
            s.vkey = Some(p.vkey);
            s.cycles = p.cycles;
            s.set_state(State::Proved);
        })?,
        Err(e) => {
            with_session(&st, id, |s| s.fail(e.to_string()))?;
            return Err(internal(e));
        }
    }
    Ok(())
}

#[derive(Deserialize, Default)]
pub struct AttestBody {
    #[serde(default)]
    pub tier: Option<u8>,
    /// attest-operator only: override the predicate bits (default: the proof-path bits).
    #[serde(default)]
    pub bits: Option<String>,
}

fn chain_of(st: &AppState) -> Result<&Chain, AppError> {
    st.chain.as_ref().ok_or_else(|| unavailable("chain client not configured (RPC_URL, OPERATOR_PRIVATE_KEY, REGISTRY)"))
}

async fn attest(
    AxState(st): AxState<Shared>,
    Path(id): Path<String>,
    body: Option<Json<AttestBody>>,
) -> Result<Json<Value>, AppError> {
    let id = parse_session_id(&id)?;
    let body = body.map(|b| b.0).unwrap_or_default();
    let ch = chain_of(&st)?;
    let session = with_session(&st, id, |s| s.clone())?;
    if session.state != State::Proved {
        return Err(conflict(format!("session is {:?}, expected proved", session.state).to_lowercase()));
    }
    require_address_proof(&st, &session)?;
    let pv = session.public_values.clone().ok_or_else(|| internal("no public values"))?;
    let proof = session
        .proof_bytes
        .clone()
        .ok_or_else(|| conflict(format!("no on-chain proof for proof mode {}", session.proof_system.clone().unwrap_or_default())))?;
    let d = session.decoded.clone().ok_or_else(|| internal("no decoded public values"))?;
    if d.subject != session.bound_address {
        return Err(internal("public values subject differs from the session address"));
    }
    let bits = chain::decision_bits(d.over18 == 1);
    let decision = chain::decision(st.cfg.policy_id, bits, body.tier.unwrap_or(1), d.expiry, id);
    let inputs = chain::public_inputs(session.bound_address, st.cfg.policy_id, bits, d.expiry);
    let proof_arg = chain::encode_proof_arg(&pv, &proof);
    let calldata_summary = json!({
        "subject": session.bound_address,
        "decision": { "policyId": decision.policyId, "bits": format!("0x{:x}", decision.bits), "tier": decision.tier,
                      "expiry": decision.expiry, "statusRef": decision.statusRef, "revoked": false },
        "proof_len": proof_arg.len(),
        "publicInputs": inputs,
    });
    let (tx, ev) = ch
        .attest_with_proof(session.bound_address, decision, proof_arg, inputs)
        .await
        .map_err(|e| {
            let _ = with_session(&st, id, |s| s.error = Some(e.to_string()));
            AppError(StatusCode::BAD_GATEWAY, e.to_string())
        })?;
    with_session(&st, id, |s| {
        s.tx_hash = Some(tx);
        s.attested = Some(ev.clone());
        s.error = None;
        s.set_state(State::Attested);
    })?;
    Ok(Json(json!({ "session_id": id, "status": "attested", "tx_hash": tx, "attested": ev, "call": calldata_summary })))
}

async fn attest_operator(
    AxState(st): AxState<Shared>,
    Path(id): Path<String>,
    body: Option<Json<AttestBody>>,
) -> Result<Json<Value>, AppError> {
    let id = parse_session_id(&id)?;
    let body = body.map(|b| b.0).unwrap_or_default();
    let ch = chain_of(&st)?;
    let session = with_session(&st, id, |s| s.clone())?;
    if !matches!(session.state, State::Verified | State::Proving | State::Proved | State::Attested) {
        return Err(conflict(format!("session is {:?}, the statement must have verified natively first", session.state).to_lowercase()));
    }
    require_address_proof(&st, &session)?;
    let d = session.decoded.clone().ok_or_else(|| internal("no decoded public values"))?;
    let bits = match &body.bits {
        Some(b) => U256::from_str_radix(b.trim_start_matches("0x"), 16).map_err(|e| bad(format!("bits: {e}")))?,
        None => chain::decision_bits(d.over18 == 1),
    };
    let decision = chain::decision(st.cfg.policy_id, bits, body.tier.unwrap_or(1), d.expiry, id);
    let (tx, ev) = ch
        .attest_by_operator(session.bound_address, decision)
        .await
        .map_err(|e| AppError(StatusCode::BAD_GATEWAY, e.to_string()))?;
    with_session(&st, id, |s| {
        s.tx_hash = Some(tx);
        s.attested = Some(ev.clone());
        s.error = None;
        s.set_state(State::Attested);
    })?;
    Ok(Json(json!({ "session_id": id, "status": "attested", "path": "operator", "tx_hash": tx, "attested": ev })))
}

#[derive(Deserialize)]
pub struct RevokeBody {
    pub subject: Address,
}

async fn revoke(AxState(st): AxState<Shared>, Json(req): Json<RevokeBody>) -> Result<Json<Value>, AppError> {
    let ch = chain_of(&st)?;
    let tx = ch.revoke(req.subject, st.cfg.policy_id).await.map_err(|e| AppError(StatusCode::BAD_GATEWAY, e.to_string()))?;
    Ok(Json(json!({ "status": "revoked", "subject": req.subject, "policy_id": st.cfg.policy_id, "tx_hash": tx })))
}
