//! Shared verification logic for the Nachweis PID proof.
//!
//! The same code runs natively on the host (parser cross-check against the
//! recorded ERICA fixture) and inside the SP1 guest (the proved statement).
//! It mirrors what verifier-core's `verify::verify_pid_presentation_at` checks,
//! minus wall-clock freshness and minus the x5c-to-anchor chain (the issuer key
//! is a private input whose SHA-256 is committed; the contract pins that hash).
//!
//! Expiry split: the committed `expiry` is the issuer credential's `exp` only,
//! so the on-chain decision lives as long as the credential. KB-JWT freshness
//! (`exp`, `iat`) is a property of the presentation, not of the credential, and
//! is checked by the host against its wall clock with [`check_kb_freshness`];
//! the guest has no clock and commits nothing about it.
extern crate alloc;

use alloc::string::String;
use alloc::vec::Vec;
use alloy_sol_types::sol;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use p256::ecdsa::signature::Verifier;
use p256::ecdsa::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

sol! {
    /// Public values, ABI encoded, as the registry contract decodes them.
    /// No claim text, no names, no key material: only hashes, one bit, the
    /// bound address, an expiry and the nonce commitment.
    struct PublicValuesStruct {
        bytes32 issuerKeyHash;   // sha256(issuer public key, SEC1 uncompressed 65 bytes)
        bytes32 vctHash;         // sha256(vct string)
        uint8   over18;          // 1 if age_equal_or_over.18 disclosed and true, else 0
        address subject;         // the Ethereum address the nonce commits to
        uint64  expiry;          // issuer credential exp; 0 if absent (KB-JWT exp is host-checked, not committed)
        bytes32 nonce;           // sha256(subject(20) || challenge); KB-JWT nonce = lowercase hex(nonce), no 0x
    }
}

/// Private guest input (serialized with bincode by `SP1Stdin::write`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuestInput {
    /// Compact SD-JWT presentation: `issuerJwt~disc1~...~discN~kbJwt`.
    pub presentation: String,
    /// Issuer P-256 public key, SEC1 uncompressed (65 bytes).
    pub issuer_key_sec1: Vec<u8>,
    pub expected_vct: String,
    pub expected_aud: String,
    pub bound_address: [u8; 20],
    /// Server-chosen challenge; nonce = sha256(address || challenge).
    pub challenge: [u8; 32],
}

#[derive(Debug, Clone)]
pub struct Verified {
    pub over18: bool,
    /// Issuer credential `exp` (the committed expiry); 0 if absent.
    pub expiry: u64,
    /// KB-JWT `exp`, parsed but not committed; the host checks it with `check_kb_freshness`.
    pub kb_exp: Option<u64>,
    /// KB-JWT `iat`, parsed but not committed.
    pub kb_iat: Option<u64>,
    pub kb_nonce: String,
}

/// Host-side KB-JWT freshness check (the guest has no clock). Accepts a KB-JWT whose `exp` lies
/// in `(now, now + window]` and whose `iat` lies in `[now - window, now + window]`; both claims
/// are required. `window` is in seconds (the bridge default is 600). Never called in the guest.
pub fn check_kb_freshness(v: &Verified, now: u64, window: u64) -> Result<(), String> {
    let exp = v.kb_exp.ok_or_else(|| String::from("KB-JWT has no exp"))?;
    let iat = v.kb_iat.ok_or_else(|| String::from("KB-JWT has no iat"))?;
    if exp <= now {
        return Err(alloc::format!("KB-JWT expired: exp {exp} <= now {now}"));
    }
    if exp > now.saturating_add(window) {
        return Err(alloc::format!("KB-JWT exp {exp} is more than {window} s ahead of now {now}"));
    }
    if iat.saturating_add(window) < now {
        return Err(alloc::format!("KB-JWT iat {iat} is more than {window} s before now {now}"));
    }
    if iat > now.saturating_add(window) {
        return Err(alloc::format!("KB-JWT iat {iat} is more than {window} s ahead of now {now}"));
    }
    Ok(())
}

fn b64d(s: &str) -> Vec<u8> {
    URL_SAFE_NO_PAD.decode(s).expect("base64url")
}

fn b64e(b: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(b)
}

/// Verify a compact JWS (ES256, raw r||s signature) with `key`; return the payload bytes.
fn verify_jws(jws: &str, key: &VerifyingKey) -> (Value, Vec<u8>) {
    let mut it = jws.split('.');
    let h = it.next().expect("jws header");
    let p = it.next().expect("jws payload");
    let s = it.next().expect("jws signature");
    assert!(it.next().is_none(), "jws has more than three parts");
    let header: Value = serde_json::from_slice(&b64d(h)).expect("header json");
    assert_eq!(header["alg"].as_str(), Some("ES256"), "alg must be ES256");
    let sig_bytes = b64d(s);
    let sig = Signature::from_slice(&sig_bytes).expect("signature length");
    let signing_input = jws.as_bytes();
    let signing_input = &signing_input[..h.len() + 1 + p.len()];
    key.verify(signing_input, &sig).expect("ES256 signature invalid");
    (header, b64d(p))
}

/// SD-JWT disclosure digest: base64url(sha256(ascii disclosure)).
fn disclosure_digest(disc_b64: &str) -> String {
    b64e(&Sha256::digest(disc_b64.as_bytes()))
}

/// Collect every `_sd` digest string found anywhere in `v`.
fn collect_sd(v: &Value, out: &mut Vec<String>) {
    match v {
        Value::Object(m) => {
            for (k, x) in m {
                if k == "_sd" {
                    if let Some(arr) = x.as_array() {
                        for d in arr {
                            if let Some(s) = d.as_str() {
                                out.push(String::from(s));
                            }
                        }
                    }
                } else {
                    collect_sd(x, out);
                }
            }
        }
        Value::Array(a) => a.iter().for_each(|x| collect_sd(x, out)),
        _ => {}
    }
}

/// Verify the presentation and return the facts the guest commits.
///
/// Checks: issuer JWT ES256 under `issuer_key`; `vct`; every presented
/// disclosure hashes into a signed `_sd` array (top level or nested via an
/// already-accepted disclosure); `age_equal_or_over.18` found via the nested
/// object's `_sd`; KB-JWT ES256 under `cnf.jwk`; `typ kb+jwt`; `aud`;
/// `sd_hash` over `issuerJwt~disc...~`.
pub fn verify_presentation(
    presentation: &str,
    issuer_key_sec1: &[u8],
    expected_vct: &str,
    expected_aud: &str,
) -> Verified {
    let parts: Vec<&str> = presentation.split('~').collect();
    assert!(parts.len() >= 2, "presentation needs issuer JWT and KB-JWT");
    let issuer_jwt = parts[0];
    let kb_jwt = parts[parts.len() - 1];
    assert!(!kb_jwt.is_empty(), "KB-JWT missing");
    let disclosures = &parts[1..parts.len() - 1];

    // 1. Issuer signature.
    let issuer_key = VerifyingKey::from_sec1_bytes(issuer_key_sec1).expect("issuer key");
    let (_hdr, payload) = verify_jws(issuer_jwt, &issuer_key);
    let claims: Value = serde_json::from_slice(&payload).expect("issuer payload json");

    // 2. vct.
    assert_eq!(claims["vct"].as_str(), Some(expected_vct), "vct mismatch");
    assert_eq!(claims["_sd_alg"].as_str().unwrap_or("sha-256"), "sha-256");

    // 3. Disclosures: digest -> (name, value); each must be anchored in a signed _sd.
    let mut sd_set: Vec<String> = Vec::new();
    collect_sd(&claims, &mut sd_set);
    let decoded: Vec<(String, String, Value)> = disclosures
        .iter()
        .map(|d| {
            let arr: Value = serde_json::from_slice(&b64d(d)).expect("disclosure json");
            let arr = arr.as_array().expect("disclosure array");
            assert_eq!(arr.len(), 3, "only object-property disclosures supported");
            let name = String::from(arr[1].as_str().expect("disclosure name"));
            (disclosure_digest(d), name, arr[2].clone())
        })
        .collect();
    let mut accepted = alloc::vec![false; decoded.len()];
    // Iterate to a fixed point so recursively disclosed objects can anchor children.
    loop {
        let mut changed = false;
        for (i, (dig, _, val)) in decoded.iter().enumerate() {
            if !accepted[i] && sd_set.iter().any(|s| s == dig) {
                accepted[i] = true;
                collect_sd(val, &mut sd_set);
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    assert!(accepted.iter().all(|a| *a), "a disclosure is not anchored in a signed _sd");

    // 4. age_equal_or_over.18: the object is either plain in the payload or itself disclosed.
    let age_obj: Option<Value> = if claims["age_equal_or_over"].is_object() {
        Some(claims["age_equal_or_over"].clone())
    } else {
        decoded
            .iter()
            .find(|(_, n, v)| n == "age_equal_or_over" && v.is_object())
            .map(|(_, _, v)| v.clone())
    };
    let over18 = match age_obj {
        Some(obj) => {
            let age_sd: Vec<&str> = obj["_sd"]
                .as_array()
                .map(|a| a.iter().filter_map(|x| x.as_str()).collect())
                .unwrap_or_default();
            decoded
                .iter()
                .find(|(dig, n, _)| n == "18" && age_sd.iter().any(|s| s == dig))
                .map(|(_, _, v)| v.as_bool() == Some(true))
                .unwrap_or(false)
        }
        None => false,
    };

    // 5. Holder key from cnf.jwk.
    let jwk = &claims["cnf"]["jwk"];
    assert_eq!(jwk["kty"].as_str(), Some("EC"));
    assert_eq!(jwk["crv"].as_str(), Some("P-256"));
    let mut sec1 = alloc::vec![0x04u8];
    sec1.extend_from_slice(&b64d(jwk["x"].as_str().expect("cnf x")));
    sec1.extend_from_slice(&b64d(jwk["y"].as_str().expect("cnf y")));
    assert_eq!(sec1.len(), 65, "cnf.jwk coordinates");
    let holder_key = VerifyingKey::from_sec1_bytes(&sec1).expect("holder key");

    // 6. KB-JWT.
    let (kb_hdr, kb_payload) = verify_jws(kb_jwt, &holder_key);
    assert_eq!(kb_hdr["typ"].as_str(), Some("kb+jwt"), "KB-JWT typ");
    let kb: Value = serde_json::from_slice(&kb_payload).expect("kb payload json");
    assert_eq!(kb["aud"].as_str(), Some(expected_aud), "KB-JWT aud");
    let sd_part_len = presentation.len() - kb_jwt.len();
    let sd_hash = b64e(&Sha256::digest(&presentation.as_bytes()[..sd_part_len]));
    assert_eq!(kb["sd_hash"].as_str(), Some(sd_hash.as_str()), "sd_hash mismatch");
    let kb_nonce = String::from(kb["nonce"].as_str().expect("KB-JWT nonce"));

    // 7. Expiry: the issuer credential's exp (0 if absent). The KB-JWT exp/iat are only
    //    parsed here; the host checks them against its clock (check_kb_freshness).
    let expiry = claims["exp"].as_u64().unwrap_or(0);
    let kb_exp = kb["exp"].as_u64();
    let kb_iat = kb["iat"].as_u64();

    Verified { over18, expiry, kb_exp, kb_iat, kb_nonce }
}

/// Nonce commitment: sha256(address(20 bytes) || challenge bytes). The KB-JWT nonce string is
/// its lowercase hex without 0x (64 chars), matching the verifier relay and the front end.
pub fn nonce_commitment(address: &[u8; 20], challenge: &[u8; 32]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(address);
    h.update(challenge);
    h.finalize().into()
}

pub fn nonce_string(address: &[u8; 20], challenge: &[u8; 32]) -> String {
    hex_lower(&nonce_commitment(address, challenge))
}

fn hex_lower(b: &[u8]) -> String {
    const H: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(b.len() * 2);
    for x in b {
        s.push(H[(x >> 4) as usize] as char);
        s.push(H[(x & 15) as usize] as char);
    }
    s
}

/// The full guest statement: verify, bind the nonce to the address, build public values.
pub fn prove_statement(input: &GuestInput) -> PublicValuesStruct {
    prove_statement_with_facts(input).0
}

/// Same as `prove_statement`, additionally returning the verified facts (KB-JWT exp/iat) the host
/// needs for `check_kb_freshness`.
pub fn prove_statement_with_facts(input: &GuestInput) -> (PublicValuesStruct, Verified) {
    let v = verify_presentation(
        &input.presentation,
        &input.issuer_key_sec1,
        &input.expected_vct,
        &input.expected_aud,
    );
    let nonce = nonce_commitment(&input.bound_address, &input.challenge);
    assert_eq!(v.kb_nonce, hex_lower(&nonce), "KB-JWT nonce is not bound to the address");
    let pv = PublicValuesStruct {
        issuerKeyHash: <[u8; 32]>::from(Sha256::digest(&input.issuer_key_sec1)).into(),
        vctHash: <[u8; 32]>::from(Sha256::digest(input.expected_vct.as_bytes())).into(),
        over18: v.over18 as u8,
        subject: alloy_sol_types::private::Address::from(input.bound_address),
        expiry: v.expiry,
        nonce: nonce.into(),
    };
    (pv, v)
}
