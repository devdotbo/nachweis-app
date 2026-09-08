//! End-to-end against a local anvil: deploy AttestationRegistry + MockProofVerifier from the forge
//! artifacts, run the mock-proof pipeline through the HTTP API, attest (evidence), approve (issuer), check isEligible, revoke.
//!
//! Skips (passes with a message) when `anvil` is not on PATH or the contracts are not built and
//! `forge` is unavailable. Never touches a network other than the anvil it starts.
use alloy::primitives::{keccak256, Address, U256};
use alloy::providers::Provider;
use alloy::signers::{local::PrivateKeySigner, Signer};
use alloy::sol_types::SolValue;
use nachweis_bridge::chain::{address_proof_message, creation_code_from_artifact, creation_code_linked, decision, decision_bits, status_ref, Chain};
use nachweis_bridge::prover::ProofMode;
use nachweis_bridge::{router, AppState, Config};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::Duration;

const ANVIL_KEY0: &str = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ISSUER_TOKEN: &str = "test-issuer-token";

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn find_bin(name: &str) -> Option<PathBuf> {
    let mut paths: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    if let Some(home) = std::env::var_os("HOME") {
        paths.push(PathBuf::from(home).join(".foundry/bin"));
    }
    paths.into_iter().map(|p| p.join(name)).find(|p| p.is_file())
}

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}

struct AnvilGuard(Child);
impl Drop for AnvilGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn artifact(name: &str) -> PathBuf {
    repo_root().join(format!("contracts/out/{name}.sol/{name}.json"))
}

fn ensure_artifacts() -> bool {
    // Always rebuild when forge is available: the build is incremental and a stale
    // contracts/out (e.g. after the Noir verifier was regenerated) makes the
    // NoirPidVerifier dry run fail with 422 instead of a clear error.
    let Some(forge) = find_bin("forge") else {
        return artifact("AttestationRegistry").is_file() && artifact("MockProofVerifier").is_file();
    };
    let status = Command::new(forge)
        .arg("build")
        .current_dir(repo_root().join("contracts"))
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .status()
        .expect("run forge build");
    status.success() && artifact("AttestationRegistry").is_file()
}

async fn wait_rpc(url: &str) {
    let http = reqwest::Client::new();
    for _ in 0..100 {
        let r = http
            .post(url)
            .json(&serde_json::json!({"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}))
            .send()
            .await;
        if r.map(|r| r.status().is_success()).unwrap_or(false) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("anvil did not answer on {url}");
}

#[derive(serde::Deserialize)]
struct InputFile {
    presentation: String,
    issuer_key_sec1_hex: String,
    expected_vct: String,
    expected_aud: String,
    bound_address_hex: String,
    challenge_hex: String,
}

#[tokio::test(flavor = "multi_thread")]
async fn mock_pipeline_attests_and_revokes_on_anvil() {
    let Some(anvil) = find_bin("anvil") else {
        eprintln!("SKIP: anvil not found on PATH");
        return;
    };
    if !ensure_artifacts() {
        eprintln!("SKIP: contracts/out artifacts missing and forge unavailable");
        return;
    }

    // --- anvil ---
    let port = free_port();
    let rpc = format!("http://127.0.0.1:{port}");
    let child = Command::new(anvil)
        .args(["--port", &port.to_string(), "--silent"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn anvil");
    let _guard = AnvilGuard(child);
    wait_rpc(&rpc).await;

    // --- deploy and configure ---
    let policy_id = keccak256(b"nachweis.pid.over18.v1");
    assert_eq!(format!("{policy_id}"), "0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f");
    let mut chain = Chain::connect(&rpc, ANVIL_KEY0, Address::ZERO).await.unwrap();
    let owner = chain.operator;
    let reg_code = creation_code_from_artifact(&std::fs::read_to_string(artifact("AttestationRegistry")).unwrap()).unwrap();
    let mock_code = creation_code_from_artifact(&std::fs::read_to_string(artifact("MockProofVerifier")).unwrap()).unwrap();
    let registry = chain.deploy(&reg_code, &owner.abi_encode()).await.unwrap();
    let mock = chain.deploy(&mock_code, &true.abi_encode()).await.unwrap();
    chain.registry = registry;
    chain.set_verifier(policy_id, mock).await.unwrap();
    chain.set_operator(policy_id, owner, true).await.unwrap();

    // --- bridge ---
    let fixtures = repo_root().join("prover-sp1/fixtures");
    let input: InputFile = serde_json::from_str(&std::fs::read_to_string(fixtures.join("input.json")).unwrap()).unwrap();
    let calldata: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(fixtures.join("calldata-groth16.json")).unwrap()).unwrap();
    let subject: Address = input.bound_address_hex.parse().unwrap();
    let cfg = Config {
        bind: "127.0.0.1:0".parse().unwrap(),
        rpc_url: Some(rpc.clone()),
        operator_private_key: Some(ANVIL_KEY0.into()),
        registry: Some(registry),
        noir_verifier: None,
        policy_id,
        verifier_url: None,
        verifier_result_token: None,
        proof_mode: ProofMode::Mock,
        prover_artifacts: fixtures.clone(),
        prover_elf: None,
        expected_vct: input.expected_vct.clone(),
        expected_aud: input.expected_aud.clone(),
        issuer_key_sec1: Some(hex::decode(&input.issuer_key_sec1_hex).unwrap()),
        // The fixture address has no known key, so the pipeline instance runs without the address proof.
        require_address_proof: false,
        cors_origins: None,
        // The stored fixture's KB-JWT expired five minutes after minting (exp = iat + 300, as the
        // sandbox wallet does); the freshness check is exercised separately below.
        kb_jwt_window_secs: None,
        handoff_verifier_url: None,
        handoff_bridge_url: None,
        issuer_token: Some(ISSUER_TOKEN.into()),
    };
    let fresh_cfg = Config { kb_jwt_window_secs: Some(600), ..cfg.clone() };
    let strict_cfg = Config { require_address_proof: true, ..cfg.clone() };
    let notoken_cfg = Config { issuer_token: None, ..cfg.clone() };
    let state = Arc::new(AppState::new(cfg, Some(chain.clone())));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, router(state)).await.unwrap() });
    let http = reqwest::Client::new();

    // 0. Address proof on a strict instance: wrong signer 401, right signer sets address_verified.
    let strict = Arc::new(AppState::new(strict_cfg, Some(chain.clone())));
    let strict_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let strict_base = format!("http://{}", strict_listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(strict_listener, router(strict)).await.unwrap() });
    let holder = PrivateKeySigner::random();
    let created: serde_json::Value = http
        .post(format!("{strict_base}/sessions"))
        .json(&serde_json::json!({ "bound_address": holder.address() }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let strict_id: uuid::Uuid = created["session_id"].as_str().unwrap().parse().unwrap();
    assert_eq!(created["address_proof_message"], format!("nachweis:session:{strict_id}"));
    let wrong = PrivateKeySigner::random().sign_message(address_proof_message(strict_id).as_bytes()).await.unwrap();
    let r = http
        .post(format!("{strict_base}/sessions/{strict_id}/address-proof"))
        .json(&serde_json::json!({ "signature": format!("0x{}", hex::encode(wrong.as_bytes())) }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401);
    let right = holder.sign_message(address_proof_message(strict_id).as_bytes()).await.unwrap();
    let r: serde_json::Value = http
        .post(format!("{strict_base}/sessions/{strict_id}/address-proof"))
        .json(&serde_json::json!({ "signature": format!("0x{}", hex::encode(right.as_bytes())) }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(r["address_verified"], true);
    let s: serde_json::Value = http.get(format!("{strict_base}/sessions/{strict_id}")).send().await.unwrap().json().await.unwrap();
    assert_eq!(s["address_verified"], true);
    assert_eq!(s["state"], "created");
    assert_eq!(s["detail"], "waiting for the presentation");
    // Two-device handoff: available while created, carries the same challenge and nonce, the
    // bridge URL from the request Host, and the compact nachweis:// URI.
    let h: serde_json::Value = http.get(format!("{strict_base}/sessions/{strict_id}/handoff")).send().await.unwrap().error_for_status().unwrap().json().await.unwrap();
    assert_eq!(h["session_id"], created["session_id"]);
    assert_eq!(h["challenge_hex"], created["challenge_hex"]);
    assert_eq!(h["nonce"], created["nonce"]);
    assert_eq!(h["bound_address"].as_str().unwrap().to_lowercase(), format!("{:#x}", holder.address()));
    assert_eq!(h["bridge_url"], strict_base);
    assert_eq!(h["address_verified"], true);
    assert!(h["uri"].as_str().unwrap().starts_with(&format!("nachweis://handoff?v=1&s={strict_id}&a=")));
    let unknown = http.get(format!("{strict_base}/sessions/{}/handoff", uuid::Uuid::new_v4())).send().await.unwrap();
    assert_eq!(unknown.status(), 404);
    assert_eq!(http.get(format!("{strict_base}/sessions/{}", uuid::Uuid::new_v4())).send().await.unwrap().status(), 404);

    // 1. session with the fixture's address and challenge: nonce must match the fixture KB-JWT.
    let created: serde_json::Value = http
        .post(format!("{base}/sessions"))
        .json(&serde_json::json!({ "bound_address": subject, "challenge_hex": input.challenge_hex }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let sid = created["session_id"].as_str().unwrap().to_string();
    let challenge: [u8; 32] = hex::decode(&input.challenge_hex).unwrap().try_into().unwrap();
    assert_eq!(created["nonce"].as_str().unwrap(), nachweis_pid_lib::nonce_string(&subject.0 .0, &challenge));
    assert_eq!(created["mode"], "local");

    // 2. presentation: native statement, then mock proof.
    let presented: serde_json::Value = http
        .post(format!("{base}/sessions/{sid}/presentation"))
        .json(&serde_json::json!({ "sd_jwt_presentation": input.presentation }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(presented["status"], "proved", "{presented}");
    let st: serde_json::Value = http.get(format!("{base}/sessions/{sid}")).send().await.unwrap().json().await.unwrap();
    assert_eq!(st["detail"], "proof ready (mock-groth16)");
    assert_eq!(presented["public_values_hex"], calldata["publicValues"]);
    assert_eq!(presented["proof_hex"], calldata["proof"]);
    assert_eq!(presented["vkey"], calldata["vkey"]);
    assert_eq!(presented["public_values"]["over18"], 1);
    assert_eq!(presented["public_values"]["subject"].as_str().unwrap().to_lowercase(), format!("{subject:?}"));

    // A wrong presentation fails fast with the statement's error, on a fresh session.
    let bad_session: serde_json::Value = http
        .post(format!("{base}/sessions"))
        .json(&serde_json::json!({ "bound_address": subject }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let bad_id = bad_session["session_id"].as_str().unwrap();
    let r = http
        .post(format!("{base}/sessions/{bad_id}/presentation"))
        .json(&serde_json::json!({ "sd_jwt_presentation": input.presentation }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 422, "fresh challenge must not match the fixture nonce");
    let err: serde_json::Value = r.json().await.unwrap();
    assert!(err["error"].as_str().unwrap().contains("nonce"), "{err}");
    let st: serde_json::Value = http.get(format!("{base}/sessions/{bad_id}")).send().await.unwrap().json().await.unwrap();
    assert_eq!(st["state"], "failed");

    // With the default freshness window the stored fixture's KB-JWT (exp = iat + 300 at minting)
    // is rejected before proving, on an instance that is otherwise identical.
    let fresh = Arc::new(AppState::new(fresh_cfg, Some(chain.clone())));
    let fresh_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let fresh_base = format!("http://{}", fresh_listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(fresh_listener, router(fresh)).await.unwrap() });
    let stale_session: serde_json::Value = http
        .post(format!("{fresh_base}/sessions"))
        .json(&serde_json::json!({ "bound_address": subject, "challenge_hex": input.challenge_hex }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let stale_id = stale_session["session_id"].as_str().unwrap();
    let r = http
        .post(format!("{fresh_base}/sessions/{stale_id}/presentation"))
        .json(&serde_json::json!({ "sd_jwt_presentation": input.presentation }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 422, "stale KB-JWT must be rejected with the default window");
    let err: serde_json::Value = r.json().await.unwrap();
    assert!(err["error"].as_str().unwrap().contains("KB-JWT expired"), "{err}");

    // 3. attest with proof.
    assert!(!chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
    let attested: serde_json::Value = http
        .post(format!("{base}/sessions/{sid}/attest"))
        .json(&serde_json::json!({ "tier": 1 }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(attested["status"], "attested", "{attested}");
    assert!(attested["tx_hash"].as_str().unwrap().starts_with("0x"));
    assert_eq!(attested["attested"]["subject"].as_str().unwrap().to_lowercase(), format!("{subject:?}"));
    assert_eq!(attested["attested"]["bits"], "0x3");
    assert_eq!(attested["attested"]["expiry"], calldata["decoded"]["expiry"]);
    // Evidence only: the decision is stored but the subject is not eligible until the issuer approves.
    assert!(!chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
    assert!(!chain.approved(subject, policy_id).await.unwrap());
    let d = chain.decision_of(subject, policy_id).await.unwrap();
    assert_eq!(d.statusRef, status_ref(sid.parse().unwrap()));
    assert_eq!(d.bits, U256::from(3));
    let st: serde_json::Value = http.get(format!("{base}/sessions/{sid}")).send().await.unwrap().json().await.unwrap();
    assert_eq!(st["state"], "attested");
    assert_eq!(st["approved"], false);
    assert_eq!(st["address_verified"], false);
    assert!(st["detail"].as_str().unwrap().starts_with("attested in 0x"));
    assert!(st["detail"].as_str().unwrap().ends_with("awaiting issuer approval"));
    assert!(st.get("presentation").is_none());

    // 3b. The issuer routes need the bearer token: no token 401, wrong token 401, no configured token 503.
    let r = http.post(format!("{base}/sessions/{sid}/approve")).send().await.unwrap();
    assert_eq!(r.status(), 401, "approve without the issuer token");
    let r = http.post(format!("{base}/sessions/{sid}/approve")).bearer_auth("wrong").send().await.unwrap();
    assert_eq!(r.status(), 401, "approve with a wrong issuer token");
    let r = http.post(format!("{base}/sessions/{sid}/attest-operator")).send().await.unwrap();
    assert_eq!(r.status(), 401, "attest-operator without the issuer token");
    let r = http.post(format!("{base}/revoke")).json(&serde_json::json!({ "subject": subject })).send().await.unwrap();
    assert_eq!(r.status(), 401, "revoke without the issuer token");
    assert!(!chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
    {
        let notoken = Arc::new(AppState::new(notoken_cfg, Some(chain.clone())));
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let nb = format!("http://{}", l.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(l, router(notoken)).await.unwrap() });
        let r = http.post(format!("{nb}/sessions/{sid}/approve")).bearer_auth(ISSUER_TOKEN).send().await.unwrap();
        assert_eq!(r.status(), 503, "issuer routes are disabled without BRIDGE_ISSUER_TOKEN");
        let h: serde_json::Value = http.get(format!("{nb}/health")).send().await.unwrap().json().await.unwrap();
        assert_eq!(h["issuer_routes"], "disabled");
    }

    // 3c. Issuer approval opens the doors.
    let approved: serde_json::Value = http
        .post(format!("{base}/sessions/{sid}/approve"))
        .bearer_auth(ISSUER_TOKEN)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(approved["status"], "approved", "{approved}");
    assert_eq!(approved["approved"], true);
    assert!(approved["tx_hash"].as_str().unwrap().starts_with("0x"));
    assert!(chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
    assert!(chain.approved(subject, policy_id).await.unwrap());
    let cs = chain.status_of(subject, policy_id).await.unwrap();
    assert!(cs.has_decision && cs.approved && !cs.revoked);
    let st: serde_json::Value = http.get(format!("{base}/sessions/{sid}")).send().await.unwrap().json().await.unwrap();
    assert_eq!(st["state"], "approved");
    assert_eq!(st["approved"], true);
    assert!(st["detail"].as_str().unwrap().starts_with("approved by the issuer in 0x"));
    let r = http.post(format!("{base}/sessions/{sid}/approve")).bearer_auth(ISSUER_TOKEN).send().await.unwrap();
    assert_eq!(r.status(), 409, "an approved session has nothing left to approve");

    // 4. revoke closes the decision; the proof path cannot reopen it; the session reads revoked.
    let revoked: serde_json::Value = http
        .post(format!("{base}/revoke"))
        .bearer_auth(ISSUER_TOKEN)
        .json(&serde_json::json!({ "subject": subject }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(revoked["status"], "revoked");
    assert!(!chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
    assert!(!chain.approved(subject, policy_id).await.unwrap());
    let st: serde_json::Value = http.get(format!("{base}/sessions/{sid}")).send().await.unwrap().json().await.unwrap();
    assert_eq!(st["state"], "revoked");
    assert_eq!(st["approved"], false);
    let again = http.post(format!("{base}/sessions/{sid}/attest")).send().await.unwrap();
    assert_eq!(again.status(), 409, "attested session must not re-attest");

    // 4b. Re-approval by the issuer reopens the revoked record; revoke by session closes it again.
    let re: serde_json::Value = http
        .post(format!("{base}/sessions/{sid}/approve"))
        .bearer_auth(ISSUER_TOKEN)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(re["status"], "approved", "{re}");
    assert!(chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
    assert!(!chain.decision_of(subject, policy_id).await.unwrap().revoked);
    let rv: serde_json::Value = http
        .post(format!("{base}/sessions/{sid}/revoke"))
        .bearer_auth(ISSUER_TOKEN)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(rv["status"], "revoked", "{rv}");
    assert!(!chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
    let st: serde_json::Value = http.get(format!("{base}/sessions/{sid}")).send().await.unwrap().json().await.unwrap();
    assert_eq!(st["state"], "revoked");

    // 5. operator fallback reopens after revoke and approves in one step (bits override: identity
    //    only, so 0x3 stays ineligible while 0x1 is eligible), then revoke again.
    let op: serde_json::Value = http
        .post(format!("{base}/sessions/{sid}/attest-operator"))
        .bearer_auth(ISSUER_TOKEN)
        .json(&serde_json::json!({ "bits": "0x1", "tier": 2 }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(op["path"], "operator");
    assert_eq!(op["status"], "approved");
    assert_eq!(op["attested"]["bits"], "0x1");
    assert!(chain.is_eligible(subject, policy_id, U256::from(1)).await.unwrap());
    assert!(!chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
    let st: serde_json::Value = http.get(format!("{base}/sessions/{sid}")).send().await.unwrap().json().await.unwrap();
    assert_eq!(st["state"], "approved");
    chain.revoke(subject, policy_id).await.unwrap();
    assert!(!chain.is_eligible(subject, policy_id, U256::from(1)).await.unwrap());
}


/// The client-side path: a Noir UltraHonk proof made elsewhere (here: the committed bb fixture of
/// the realistic PID vector, contracts/test/fixtures/noir) is posted to `POST /sessions/:id/noir-proof`;
/// the bridge binds it to the session, dry-runs NoirPidVerifier.verify, sends attestWithProof
/// through the real HonkVerifier and reaches `attested`. No presentation ever reaches the bridge.
#[tokio::test(flavor = "multi_thread")]
async fn noir_proof_attests_through_noir_pid_verifier_on_anvil() {
    let Some(anvil) = find_bin("anvil") else {
        eprintln!("SKIP: anvil not found on PATH");
        return;
    };
    if !ensure_artifacts() {
        eprintln!("SKIP: contracts/out artifacts missing and forge unavailable");
        return;
    }
    let honk_artifact = repo_root().join("contracts/out/PidSdJwtUltraHonkVerifier.sol/HonkVerifier.json");
    if !honk_artifact.is_file() || !artifact("NoirPidVerifier").is_file() {
        eprintln!("SKIP: HonkVerifier / NoirPidVerifier artifacts missing (run forge build in contracts/)");
        return;
    }

    // --- fixture: proof, 86 public inputs, and the vector's address + challenge (same as the SP1 fixture) ---
    let fixtures = repo_root().join("contracts/test/fixtures/noir");
    let proof = std::fs::read(fixtures.join("proof.bin")).unwrap();
    let raw_inputs = std::fs::read(fixtures.join("public_inputs.bin")).unwrap();
    let words: Vec<alloy::primitives::B256> = raw_inputs.chunks(32).map(alloy::primitives::B256::from_slice).collect();
    assert_eq!(words.len(), 86);
    let pv = nachweis_bridge::noir::decode_public_inputs(&words).unwrap();
    let input: InputFile =
        serde_json::from_str(&std::fs::read_to_string(repo_root().join("prover-sp1/fixtures/realistic-input.json")).unwrap()).unwrap();
    let subject: Address = input.bound_address_hex.parse().unwrap();
    assert_eq!(pv.subject, subject);
    let proof_hex = format!("0x{}", hex::encode(&proof));
    let inputs_hex: Vec<String> = words.iter().map(|w| format!("{w}")).collect();

    // --- anvil ---
    let port = free_port();
    let rpc = format!("http://127.0.0.1:{port}");
    let child = Command::new(anvil)
        .args(["--port", &port.to_string(), "--silent"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn anvil");
    let _guard = AnvilGuard(child);
    wait_rpc(&rpc).await;

    // --- deploy registry, HonkVerifier (optimizer_runs 1 artifact, under EIP-170), NoirPidVerifier pinned to the fixture issuer ---
    let policy_id = keccak256(b"nachweis.pid.over18.v1");
    let mut chain = Chain::connect(&rpc, ANVIL_KEY0, Address::ZERO).await.unwrap();
    let owner = chain.operator;
    let reg_code = creation_code_from_artifact(&std::fs::read_to_string(artifact("AttestationRegistry")).unwrap()).unwrap();
    // The generated verifier links one external library (ZKTranscriptLib); forge does this at deploy time.
    let transcript_artifact = repo_root().join("contracts/out/PidSdJwtUltraHonkVerifier.sol/ZKTranscriptLib.json");
    let transcript_code = creation_code_from_artifact(&std::fs::read_to_string(&transcript_artifact).unwrap()).unwrap();
    let noir_code = creation_code_from_artifact(&std::fs::read_to_string(artifact("NoirPidVerifier")).unwrap()).unwrap();
    let registry = chain.deploy(&reg_code, &owner.abi_encode()).await.unwrap();
    let transcript = chain.deploy(&transcript_code, &[]).await.unwrap();
    let honk_code = creation_code_linked(&std::fs::read_to_string(&honk_artifact).unwrap(), &[("ZKTranscriptLib", transcript)]).unwrap();
    let honk = chain.deploy(&honk_code, &[]).await.unwrap();
    let noir = chain.deploy(&noir_code, &(honk, pv.issuer_key_hash, policy_id).abi_encode_params()).await.unwrap();
    chain.registry = registry;
    chain.set_verifier(policy_id, noir).await.unwrap();
    chain.set_operator(policy_id, owner, true).await.unwrap();

    // --- bridge: local mode, no proof mode involved; the Noir path needs no prover artifacts ---
    let cfg = Config {
        bind: "127.0.0.1:0".parse().unwrap(),
        rpc_url: Some(rpc.clone()),
        operator_private_key: Some(ANVIL_KEY0.into()),
        registry: Some(registry),
        noir_verifier: Some(noir),
        policy_id,
        verifier_url: None,
        verifier_result_token: None,
        proof_mode: ProofMode::Mock,
        prover_artifacts: repo_root().join("prover-sp1/fixtures"),
        prover_elf: None,
        expected_vct: input.expected_vct.clone(),
        expected_aud: input.expected_aud.clone(),
        issuer_key_sec1: None,
        require_address_proof: false,
        cors_origins: None,
        kb_jwt_window_secs: None,
        handoff_verifier_url: None,
        handoff_bridge_url: None,
        issuer_token: Some(ISSUER_TOKEN.into()),
    };
    let strict_cfg = Config { require_address_proof: true, ..cfg.clone() };
    let state = Arc::new(AppState::new(cfg, Some(chain.clone())));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, router(state)).await.unwrap() });
    let http = reqwest::Client::new();
    let health: serde_json::Value = http.get(format!("{base}/health")).send().await.unwrap().json().await.unwrap();
    assert_eq!(health["noir_verifier"].as_str().unwrap().to_lowercase(), format!("{noir:?}"));

    // 1. A session with a fresh challenge: the proof's nonce does not match, 422 before any tx.
    let other: serde_json::Value = http
        .post(format!("{base}/sessions"))
        .json(&serde_json::json!({ "bound_address": subject }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other_id = other["session_id"].as_str().unwrap();
    let r = http
        .post(format!("{base}/sessions/{other_id}/noir-proof"))
        .json(&serde_json::json!({ "proof_hex": proof_hex, "public_inputs_hex": inputs_hex }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 422);
    let err: serde_json::Value = r.json().await.unwrap();
    assert!(err["error"].as_str().unwrap().contains("nonce"), "{err}");

    // 2. The session that matches the vector: address + challenge give the fixture nonce.
    let created: serde_json::Value = http
        .post(format!("{base}/sessions"))
        .json(&serde_json::json!({ "bound_address": subject, "challenge_hex": input.challenge_hex }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let sid = created["session_id"].as_str().unwrap().to_string();
    assert_eq!(created["nonce"].as_str().unwrap(), format!("{}", pv.nonce).trim_start_matches("0x"));

    // 2a. Malformed inputs are 400, a flipped proof byte is a 422 from the verifier dry run, no tx.
    let r = http
        .post(format!("{base}/sessions/{sid}/noir-proof"))
        .json(&serde_json::json!({ "proof_hex": proof_hex, "public_inputs_hex": inputs_hex[..85] }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    let mut tampered = proof.clone();
    tampered[100] ^= 1;
    let r = http
        .post(format!("{base}/sessions/{sid}/noir-proof"))
        .json(&serde_json::json!({ "proof_hex": format!("0x{}", hex::encode(&tampered)), "public_inputs_hex": inputs_hex }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 422, "tampered proof must fail the dry run");
    let err: serde_json::Value = r.json().await.unwrap();
    assert!(err["error"].as_str().unwrap().contains("NoirPidVerifier.verify"), "{err}");
    assert!(!chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());

    // 2b. The real proof: dry run passes, attestWithProof runs the HonkVerifier on chain.
    let attested: serde_json::Value = http
        .post(format!("{base}/sessions/{sid}/noir-proof"))
        .json(&serde_json::json!({ "proof_hex": proof_hex, "public_inputs_hex": inputs_hex, "tier": 1 }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(attested["status"], "attested", "{attested}");
    assert_eq!(attested["path"], "noir");
    assert_eq!(attested["attested"]["bits"], "0x3");
    assert_eq!(attested["attested"]["expiry"], pv.expiry);
    assert_eq!(attested["call"]["honk_public_inputs"], 86);
    // Evidence only until the issuer approves.
    assert!(!chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
    let d = chain.decision_of(subject, policy_id).await.unwrap();
    assert_eq!(d.statusRef, status_ref(sid.parse().unwrap()));
    assert_eq!(d.expiry, pv.expiry);
    let st: serde_json::Value = http.get(format!("{base}/sessions/{sid}")).send().await.unwrap().json().await.unwrap();
    assert_eq!(st["state"], "attested");
    assert_eq!(st["approved"], false);
    assert_eq!(st["proof_system"], "noir-ultrahonk");
    assert_eq!(st["public_values"]["over18"], 1);
    assert!(st.get("presentation").is_none());
    let approved: serde_json::Value = http
        .post(format!("{base}/sessions/{sid}/approve"))
        .bearer_auth(ISSUER_TOKEN)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(approved["status"], "approved", "{approved}");
    assert!(chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
    let st: serde_json::Value = http.get(format!("{base}/sessions/{sid}")).send().await.unwrap().json().await.unwrap();
    assert_eq!(st["state"], "approved");
    assert_eq!(st["approved"], true);

    // 3. Same proof again: the registry consumes the nonce once (NonceConsumed), the session is done anyway.
    let r = http
        .post(format!("{base}/sessions/{sid}/noir-proof"))
        .json(&serde_json::json!({ "proof_hex": proof_hex, "public_inputs_hex": inputs_hex }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 409, "attested session must not accept another proof");

    // 4. With the address proof required, the endpoint refuses until the bound address has signed.
    let strict = Arc::new(AppState::new(strict_cfg, Some(chain.clone())));
    let strict_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let strict_base = format!("http://{}", strict_listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(strict_listener, router(strict)).await.unwrap() });
    let created: serde_json::Value = http
        .post(format!("{strict_base}/sessions"))
        .json(&serde_json::json!({ "bound_address": subject, "challenge_hex": input.challenge_hex }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let strict_id = created["session_id"].as_str().unwrap();
    let r = http
        .post(format!("{strict_base}/sessions/{strict_id}/noir-proof"))
        .json(&serde_json::json!({ "proof_hex": proof_hex, "public_inputs_hex": inputs_hex }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 409);
    let err: serde_json::Value = r.json().await.unwrap();
    assert!(err["error"].as_str().unwrap().contains("address proof required"), "{err}");
}

/// A send that reverts must not leave the operator's nonce ahead of the chain. With alloy's cached
/// nonce manager (the `ProviderBuilder::new()` default) the nonce is incremented while the transaction
/// is prepared, so a revert at gas estimation (here `approve` on a subject without a decision,
/// `NoDecision`) leaves the cache one ahead; the next transaction is then queued with a nonce gap and
/// its receipt never arrives (WP24, 2026-09-08: chain nonce 14, revoke queued at 15). The bridge uses
/// the simple nonce manager, which asks the chain before every send, so both sends below land.
#[tokio::test(flavor = "multi_thread")]
async fn reverted_send_does_not_block_the_next_transaction_on_anvil() {
    let Some(anvil) = find_bin("anvil") else {
        eprintln!("SKIP: anvil not found on PATH");
        return;
    };
    if !ensure_artifacts() {
        eprintln!("SKIP: contracts/out artifacts missing and forge unavailable");
        return;
    }
    let port = free_port();
    let rpc = format!("http://127.0.0.1:{port}");
    let child = Command::new(anvil)
        .args(["--port", &port.to_string(), "--silent"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn anvil");
    let _guard = AnvilGuard(child);
    wait_rpc(&rpc).await;

    let policy_id = keccak256(b"nachweis.pid.over18.v1");
    let mut chain = Chain::connect(&rpc, ANVIL_KEY0, Address::ZERO).await.unwrap();
    let owner = chain.operator;
    let reg_code = creation_code_from_artifact(&std::fs::read_to_string(artifact("AttestationRegistry")).unwrap()).unwrap();
    chain.registry = chain.deploy(&reg_code, &owner.abi_encode()).await.unwrap();
    chain.set_operator(policy_id, owner, true).await.unwrap();
    let nonce_before = chain.provider.get_transaction_count(owner).await.unwrap();

    // 1. a send that reverts at gas estimation: the typed error comes back, nothing is mined.
    let subject = Address::from([0x11; 20]);
    let err = chain.approve(subject, policy_id).await.unwrap_err();
    assert!(format!("{err:#}").contains("NoDecision"), "{err:#}");
    assert_eq!(chain.provider.get_transaction_count(owner).await.unwrap(), nonce_before);

    // 2. the next two sends must land within a few seconds (attest, then revoke, as in the WP24 run).
    let expiry = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() + 3600;
    let dec = decision(policy_id, decision_bits(true), 1, expiry, uuid::Uuid::new_v4());
    let (_, ev) = tokio::time::timeout(Duration::from_secs(10), chain.attest_by_operator(subject, dec))
        .await
        .expect("attestByOperator receipt within 10 s after a reverted send")
        .unwrap();
    assert_eq!(ev.subject, subject);
    tokio::time::timeout(Duration::from_secs(10), chain.revoke(subject, policy_id))
        .await
        .expect("revoke receipt within 10 s")
        .unwrap();
    assert_eq!(chain.provider.get_transaction_count(owner).await.unwrap(), nonce_before + 2);
    assert!(chain.status_of(subject, policy_id).await.unwrap().revoked);
}
