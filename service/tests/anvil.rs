//! End-to-end against a local anvil: deploy AttestationRegistry + MockProofVerifier from the forge
//! artifacts, run the mock-proof pipeline through the HTTP API, attest, check isEligible, revoke.
//!
//! Skips (passes with a message) when `anvil` is not on PATH or the contracts are not built and
//! `forge` is unavailable. Never touches a network other than the anvil it starts.
use alloy::primitives::{keccak256, Address, U256};
use alloy::signers::{local::PrivateKeySigner, Signer};
use alloy::sol_types::SolValue;
use nachweis_bridge::chain::{address_proof_message, creation_code_from_artifact, creation_code_linked, status_ref, Chain};
use nachweis_bridge::prover::ProofMode;
use nachweis_bridge::{router, AppState, Config};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::Duration;

const ANVIL_KEY0: &str = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

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
    if artifact("AttestationRegistry").is_file() && artifact("MockProofVerifier").is_file() {
        return true;
    }
    let Some(forge) = find_bin("forge") else { return false };
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
    };
    let fresh_cfg = Config { kb_jwt_window_secs: Some(600), ..cfg.clone() };
    let strict_cfg = Config { require_address_proof: true, ..cfg.clone() };
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
    assert!(chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
    let d = chain.decision_of(subject, policy_id).await.unwrap();
    assert_eq!(d.statusRef, status_ref(sid.parse().unwrap()));
    assert_eq!(d.bits, U256::from(3));
    let st: serde_json::Value = http.get(format!("{base}/sessions/{sid}")).send().await.unwrap().json().await.unwrap();
    assert_eq!(st["state"], "attested");
    assert_eq!(st["address_verified"], false);
    assert!(st["detail"].as_str().unwrap().starts_with("attested in 0x"));
    assert!(st.get("presentation").is_none());

    // 4. revoke closes the decision; the proof path cannot reopen it.
    let revoked: serde_json::Value = http
        .post(format!("{base}/revoke"))
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
    let again = http.post(format!("{base}/sessions/{sid}/attest")).send().await.unwrap();
    assert_eq!(again.status(), 409, "attested session must not re-attest");

    // 5. operator fallback reopens after revoke (bits override: identity only, so 0x3 stays
    //    ineligible while 0x1 is eligible), then revoke again.
    let op: serde_json::Value = http
        .post(format!("{base}/sessions/{sid}/attest-operator"))
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
    assert_eq!(op["attested"]["bits"], "0x1");
    assert!(chain.is_eligible(subject, policy_id, U256::from(1)).await.unwrap());
    assert!(!chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
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

    // --- bridge: local mode, no proof mode involved; the Noir path needs no prover artifacts ---
    let cfg = Config {
        bind: "127.0.0.1:0".parse().unwrap(),
        rpc_url: Some(rpc.clone()),
        operator_private_key: Some(ANVIL_KEY0.into()),
        registry: Some(registry),
        noir_verifier: Some(noir),
        policy_id,
        verifier_url: None,
        proof_mode: ProofMode::Mock,
        prover_artifacts: repo_root().join("prover-sp1/fixtures"),
        prover_elf: None,
        expected_vct: input.expected_vct.clone(),
        expected_aud: input.expected_aud.clone(),
        issuer_key_sec1: None,
        require_address_proof: false,
        cors_origins: None,
        kb_jwt_window_secs: None,
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
    assert!(chain.is_eligible(subject, policy_id, U256::from(3)).await.unwrap());
    let d = chain.decision_of(subject, policy_id).await.unwrap();
    assert_eq!(d.statusRef, status_ref(sid.parse().unwrap()));
    assert_eq!(d.expiry, pv.expiry);
    let st: serde_json::Value = http.get(format!("{base}/sessions/{sid}")).send().await.unwrap().json().await.unwrap();
    assert_eq!(st["state"], "attested");
    assert_eq!(st["proof_system"], "noir-ultrahonk");
    assert_eq!(st["public_values"]["over18"], 1);
    assert!(st.get("presentation").is_none());

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
