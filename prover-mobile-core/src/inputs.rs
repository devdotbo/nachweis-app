//! Derives the pid-sdjwt circuit inputs from an SD-JWT presentation.
//!
//! Port of `circuits/tools/gen-prover.ts`; the two must produce the same
//! Prover.toml for the same input (tested in `tests/gen_prover_parity.rs`).
//! All offsets are byte offsets into the raw (base64url-decoded) JSON of the
//! issuer payload and the KB-JWT payload.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64URL;
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::CoreError;

// Max lengths from circuits/pid-sdjwt/src/constants.nr. Any change there is a
// circuit change (new artifact, new VK) and must be mirrored here.
pub const HEADER_B64_MAX: usize = 2048;
pub const PAYLOAD_MAX_LEN: usize = 1024;
pub const TAIL_MAX: usize = 512;
pub const KB_PAYLOAD_MAX: usize = 320;
pub const SALT_MAX_LEN: usize = 32;
pub const MAX_AGE_ENTRIES: usize = 8;

const KB_HEADER_B64: &str = "eyJhbGciOiJFUzI1NiIsInR5cCI6ImtiK2p3dCJ9";
const EXPECTED_AUD: &str = "https://self-issued.me/v2";
const P256_N_HEX: &str = "FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551";

/// What the app hands the core: the decrypted presentation plus what the
/// bridge session knows (issuer key, bound address, challenge).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProverInput {
    /// `issuer_jwt~disc1~...~discN~kb_jwt`
    pub presentation: String,
    /// SEC1 uncompressed issuer key, 65 bytes, hex (with or without 0x).
    pub issuer_key_sec1_hex: String,
    /// 20-byte EVM address, hex.
    pub bound_address_hex: String,
    /// 32-byte challenge, hex.
    pub challenge_hex: String,
}

/// Fixed-size and bounded circuit inputs, in the ABI order of `fn main`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CircuitInputs {
    pub issuer_header_b64: Vec<u8>,
    pub payload: Vec<u8>,
    pub issuer_sig_b64: [u8; 86],
    pub issuer_sig: [u8; 64],
    pub disclosures_tail: Vec<u8>,
    pub kb_payload: Vec<u8>,
    pub kb_signature: [u8; 64],
    pub issuer_pub_x: [u8; 32],
    pub issuer_pub_y: [u8; 32],
    pub age_salt: Vec<u8>,
    pub age_sd_offset: u32,
    pub age_digest_index: u32,
    pub vct_offset: u32,
    pub cnf_offset: u32,
    pub x_offset: u32,
    pub y_offset: u32,
    pub exp_offset: u32,
    pub kb_aud_offset: u32,
    pub kb_nonce_offset: u32,
    pub kb_sd_hash_offset: u32,
    pub challenge: [u8; 32],
    pub subject: [u8; 20],
    /// Expected public outputs, for display and for checking the proof.
    pub expected: ExpectedOutputs,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExpectedOutputs {
    pub issuer_key_hash_hex: String,
    pub over18: u8,
    pub expiry: u64,
    pub nonce_hex: String,
    pub subject_hex: String,
}

fn err(m: impl Into<String>) -> CoreError {
    CoreError::Input(m.into())
}

fn sha256(b: &[u8]) -> [u8; 32] {
    Sha256::digest(b).into()
}

fn from_b64url(s: &str) -> Result<Vec<u8>, CoreError> {
    B64URL.decode(s).map_err(|e| err(format!("base64url: {e}")))
}

fn strip0x(s: &str) -> &str {
    s.strip_prefix("0x").unwrap_or(s)
}

fn hex_fixed<const N: usize>(label: &str, s: &str) -> Result<[u8; N], CoreError> {
    let v = hex::decode(strip0x(s)).map_err(|e| err(format!("{label}: {e}")))?;
    v.try_into().map_err(|_| err(format!("{label} must be {N} bytes")))
}

/// Byte index of `needle` in `hay` starting at `from`, requiring exactly one
/// occurrence in the whole haystack (the circuit assumes uniqueness).
fn unique_index(hay: &[u8], needle: &[u8], label: &str) -> Result<usize, CoreError> {
    let first = find(hay, needle, 0).ok_or_else(|| err(format!("{label} not found")))?;
    if find(hay, needle, first + 1).is_some() {
        return Err(err(format!("{label} occurs more than once; circuit assumes one")));
    }
    Ok(first)
}

fn find(hay: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    if needle.is_empty() || hay.len() < needle.len() {
        return None;
    }
    (from..=hay.len() - needle.len()).find(|&i| &hay[i..i + needle.len()] == needle)
}

/// The ECDSA blackbox in Noir/Barretenberg only accepts low-s signatures. The
/// circuit gets the low-s form and checks it against the base64url signature
/// that stays in the sd_hash preimage (same r, s or n - s).
fn low_s(sig: &[u8; 64]) -> [u8; 64] {
    let n = BigUint::parse_bytes(P256_N_HEX.as_bytes(), 16).expect("P-256 order");
    let s = BigUint::from_bytes_be(&sig[32..]);
    let ns = if s > &n / 2u8 { &n - &s } else { s };
    let mut out = [0u8; 64];
    out[..32].copy_from_slice(&sig[..32]);
    let sb = ns.to_bytes_be();
    out[64 - sb.len()..].copy_from_slice(&sb);
    out
}

pub fn derive(input: &ProverInput) -> Result<CircuitInputs, CoreError> {
    let parts: Vec<&str> = input.presentation.trim().split('~').collect();
    if parts.len() < 2 {
        return Err(err("presentation has no KB-JWT"));
    }
    let issuer_jwt = parts[0];
    let kb_jwt = parts[parts.len() - 1];
    let disclosures = &parts[1..parts.len() - 1];

    let jwt_parts: Vec<&str> = issuer_jwt.split('.').collect();
    if jwt_parts.len() != 3 {
        return Err(err("issuer JWT is not header.payload.signature"));
    }
    let (header_b64, payload_b64, sig_b64) = (jwt_parts[0], jwt_parts[1], jwt_parts[2]);
    let payload_raw = from_b64url(payload_b64)?;
    let payload_obj: Value =
        serde_json::from_slice(&payload_raw).map_err(|e| err(format!("issuer payload JSON: {e}")))?;
    // The circuit re-encodes the raw payload; the round trip must be exact.
    if B64URL.encode(&payload_raw) != payload_b64 {
        return Err(err("payload base64url round trip differs"));
    }
    if sig_b64.len() != 86 {
        return Err(err(format!("issuer signature base64url length {}, expected 86", sig_b64.len())));
    }

    // --- issuer payload offsets ---
    let vct_offset = unique_index(&payload_raw, b"\"vct\":\"urn:eudi:pid:de:1\"", "vct fragment")?;
    let age_sd_fragment: &[u8] = b"\"age_equal_or_over\":{\"_sd\":[";
    let age_sd_offset = unique_index(&payload_raw, age_sd_fragment, "age_equal_or_over._sd fragment")?;
    let cnf_fragment: &[u8] = b"\"cnf\":{\"jwk\":{";
    let cnf_offset = unique_index(&payload_raw, cnf_fragment, "cnf fragment")?;
    let x_offset = find(&payload_raw, b"\"x\":\"", cnf_offset).ok_or_else(|| err("cnf.jwk x not found"))?;
    let y_offset = find(&payload_raw, b"\"y\":\"", cnf_offset).ok_or_else(|| err("cnf.jwk y not found"))?;
    let exp_offset = unique_index(&payload_raw, b"\"exp\":", "exp fragment")?;

    // --- age disclosure ---
    let mut age_disc: Option<(&str, String)> = None;
    for d in disclosures {
        let raw = from_b64url(d)?;
        if let Ok(Value::Array(arr)) = serde_json::from_slice::<Value>(&raw) {
            if arr.len() == 3 && arr[1] == "18" && arr[2] == Value::Bool(true) {
                if let Some(salt) = arr[0].as_str() {
                    age_disc = Some((d, salt.to_string()));
                    break;
                }
            }
        }
    }
    let (age_disc_b64, age_salt) = age_disc.ok_or_else(|| err("no presented disclosure [\"salt\",\"18\",true]"))?;
    // The circuit rebuilds the disclosure as ["<salt>","18",true] byte for byte.
    if from_b64url(age_disc_b64)? != format!("[\"{age_salt}\",\"18\",true]").into_bytes() {
        return Err(err("age disclosure is not in the canonical form the circuit rebuilds"));
    }
    let age_digest = B64URL.encode(sha256(age_disc_b64.as_bytes()));
    let age_array = payload_obj
        .pointer("/age_equal_or_over/_sd")
        .and_then(Value::as_array)
        .ok_or_else(|| err("age_equal_or_over._sd missing"))?;
    let age_digest_index = age_array
        .iter()
        .position(|v| v == &Value::String(age_digest.clone()))
        .ok_or_else(|| err("age disclosure digest not in age_equal_or_over._sd"))?;
    if age_digest_index >= MAX_AGE_ENTRIES {
        return Err(err("age digest index exceeds MAX_AGE_ENTRIES"));
    }
    // Check the fixed 46-byte stride layout the circuit assumes.
    let entries_base = age_sd_offset + age_sd_fragment.len();
    for j in 0..=age_digest_index {
        let s = entries_base + 46 * j;
        if payload_raw.get(s) != Some(&b'"') || payload_raw.get(s + 44) != Some(&b'"') {
            return Err(err(format!("age _sd entry {j} not 43 chars quoted")));
        }
        if j < age_digest_index && payload_raw.get(s + 45) != Some(&b',') {
            return Err(err(format!("age _sd entry {j} not followed by ,")));
        }
    }
    let ds = entries_base + 46 * age_digest_index + 1;
    if payload_raw.get(ds..ds + 43) != Some(age_digest.as_bytes()) {
        return Err(err("age digest stride check failed"));
    }

    // --- KB-JWT ---
    let kb_parts: Vec<&str> = kb_jwt.split('.').collect();
    if kb_parts.len() != 3 {
        return Err(err("KB-JWT is not header.payload.signature"));
    }
    if kb_parts[0] != KB_HEADER_B64 {
        return Err(err("KB-JWT header is not {alg:ES256,typ:kb+jwt}"));
    }
    let kb_payload_raw = from_b64url(kb_parts[1])?;
    if B64URL.encode(&kb_payload_raw) != kb_parts[1] {
        return Err(err("KB payload base64url round trip differs"));
    }
    let kb_obj: Value =
        serde_json::from_slice(&kb_payload_raw).map_err(|e| err(format!("KB payload JSON: {e}")))?;
    let kb_aud_offset = unique_index(&kb_payload_raw, format!("\"aud\":\"{EXPECTED_AUD}\"").as_bytes(), "aud fragment")?;
    let kb_nonce_offset = unique_index(&kb_payload_raw, b"\"nonce\":\"", "nonce fragment")?;
    let kb_sd_hash_offset = unique_index(&kb_payload_raw, b"\"sd_hash\":\"", "sd_hash fragment")?;

    let tail = format!("~{}~", disclosures.join("~"));
    let sd_hash = B64URL.encode(sha256(format!("{issuer_jwt}{tail}").as_bytes()));
    if kb_obj.get("sd_hash").and_then(Value::as_str) != Some(sd_hash.as_str()) {
        return Err(err("sd_hash in KB-JWT does not match the presentation"));
    }

    // --- keys, subject, challenge ---
    let sec1 = hex::decode(strip0x(&input.issuer_key_sec1_hex)).map_err(|e| err(format!("issuer key hex: {e}")))?;
    if sec1.len() != 65 || sec1[0] != 4 {
        return Err(err("issuer key must be SEC1 uncompressed (65 bytes)"));
    }
    let issuer_pub_x: [u8; 32] = sec1[1..33].try_into().unwrap();
    let issuer_pub_y: [u8; 32] = sec1[33..65].try_into().unwrap();
    let subject: [u8; 20] = hex_fixed("subject", &input.bound_address_hex)?;
    let challenge: [u8; 32] = hex_fixed("challenge", &input.challenge_hex)?;
    let nonce_hex = hex::encode(sha256(&[&subject[..], &challenge[..]].concat()));
    if kb_obj.get("nonce").and_then(Value::as_str) != Some(nonce_hex.as_str()) {
        return Err(err("KB-JWT nonce != hex(sha256(subject||challenge))"));
    }

    let issuer_sig_raw: [u8; 64] = from_b64url(sig_b64)?
        .try_into()
        .map_err(|_| err("issuer signature must decode to 64 bytes"))?;
    let kb_sig_raw: [u8; 64] = from_b64url(kb_parts[2])?
        .try_into()
        .map_err(|_| err("KB signature must decode to 64 bytes"))?;

    let bounded = |name: &str, b: &[u8], max: usize| -> Result<Vec<u8>, CoreError> {
        if b.len() > max {
            return Err(err(format!("{name}: {} bytes exceeds max {max}", b.len())));
        }
        Ok(b.to_vec())
    };
    let expiry = payload_obj.get("exp").and_then(Value::as_u64).ok_or_else(|| err("issuer exp missing"))?;

    Ok(CircuitInputs {
        issuer_header_b64: bounded("issuer_header_b64", header_b64.as_bytes(), HEADER_B64_MAX)?,
        payload: bounded("payload", &payload_raw, PAYLOAD_MAX_LEN)?,
        issuer_sig_b64: sig_b64.as_bytes().try_into().unwrap(),
        issuer_sig: low_s(&issuer_sig_raw),
        disclosures_tail: bounded("disclosures_tail", tail.as_bytes(), TAIL_MAX)?,
        kb_payload: bounded("kb_payload", &kb_payload_raw, KB_PAYLOAD_MAX)?,
        kb_signature: low_s(&kb_sig_raw),
        issuer_pub_x,
        issuer_pub_y,
        age_salt: bounded("age_salt", age_salt.as_bytes(), SALT_MAX_LEN)?,
        age_sd_offset: age_sd_offset as u32,
        age_digest_index: age_digest_index as u32,
        vct_offset: vct_offset as u32,
        cnf_offset: cnf_offset as u32,
        x_offset: x_offset as u32,
        y_offset: y_offset as u32,
        exp_offset: exp_offset as u32,
        kb_aud_offset: kb_aud_offset as u32,
        kb_nonce_offset: kb_nonce_offset as u32,
        kb_sd_hash_offset: kb_sd_hash_offset as u32,
        challenge,
        subject,
        expected: ExpectedOutputs {
            issuer_key_hash_hex: format!("0x{}", hex::encode(sha256(&sec1))),
            over18: 1,
            expiry,
            nonce_hex: format!("0x{nonce_hex}"),
            subject_hex: format!("0x{}", hex::encode(subject)),
        },
    })
}

fn padded(b: &[u8], max: usize) -> Vec<u8> {
    let mut v = b.to_vec();
    v.resize(max, 0);
    v
}

fn list(b: &[u8]) -> String {
    let parts: Vec<String> = b.iter().map(|x| x.to_string()).collect();
    format!("[{}]", parts.join(", "))
}

impl CircuitInputs {
    /// Prover.toml in exactly the form `gen-prover.ts` writes (minus its
    /// first comment line, which names the input path).
    pub fn to_prover_toml(&self) -> String {
        let bounded = |name: &str, b: &[u8], max: usize| {
            format!("{name}.storage = {}\n{name}.len = {}\n", list(&padded(b, max)), b.len())
        };
        let mut t = String::new();
        t += &bounded("issuer_header_b64", &self.issuer_header_b64, HEADER_B64_MAX);
        t += &bounded("payload", &self.payload, PAYLOAD_MAX_LEN);
        t += &format!("issuer_sig_b64 = {}\n", list(&self.issuer_sig_b64));
        t += &format!("issuer_sig = {}\n", list(&self.issuer_sig));
        t += &bounded("disclosures_tail", &self.disclosures_tail, TAIL_MAX);
        t += &bounded("kb_payload", &self.kb_payload, KB_PAYLOAD_MAX);
        t += &format!("kb_signature = {}\n", list(&self.kb_signature));
        t += &format!("issuer_pub_x = {}\n", list(&self.issuer_pub_x));
        t += &format!("issuer_pub_y = {}\n", list(&self.issuer_pub_y));
        t += &bounded("age_salt", &self.age_salt, SALT_MAX_LEN);
        t += &format!("age_sd_offset = {}\n", self.age_sd_offset);
        t += &format!("age_digest_index = {}\n", self.age_digest_index);
        t += &format!("vct_offset = {}\n", self.vct_offset);
        t += &format!("cnf_offset = {}\n", self.cnf_offset);
        t += &format!("x_offset = {}\n", self.x_offset);
        t += &format!("y_offset = {}\n", self.y_offset);
        t += &format!("exp_offset = {}\n", self.exp_offset);
        t += &format!("kb_aud_offset = {}\n", self.kb_aud_offset);
        t += &format!("kb_nonce_offset = {}\n", self.kb_nonce_offset);
        t += &format!("kb_sd_hash_offset = {}\n", self.kb_sd_hash_offset);
        t += &format!("challenge = {}\n", list(&self.challenge));
        t += &format!("subject = {}\n", list(&self.subject));
        t
    }

    /// The witness vector in ABI order, flattened the way `noirc_abi` encodes
    /// `fn main` parameters: a BoundedVec is `storage[MAX]` then `len`, arrays
    /// are element by element, scalars are one field. One decimal string per
    /// field element; entry i becomes ACIR witness index i, as noir-rs does. The circuit ABI in the artifact is the reference for the
    /// order; `witness_len_matches_abi` in lib.rs checks the count against it.
    pub fn to_flat_witness(&self) -> Vec<String> {
        let mut w: Vec<String> = Vec::with_capacity(4300);
        let push_bytes = |w: &mut Vec<String>, b: &[u8]| w.extend(b.iter().map(|x| x.to_string()));
        let push_bounded = |w: &mut Vec<String>, b: &[u8], max: usize| {
            push_bytes(w, &padded(b, max));
            w.push(b.len().to_string());
        };
        push_bounded(&mut w, &self.issuer_header_b64, HEADER_B64_MAX);
        push_bounded(&mut w, &self.payload, PAYLOAD_MAX_LEN);
        push_bytes(&mut w, &self.issuer_sig_b64);
        push_bytes(&mut w, &self.issuer_sig);
        push_bounded(&mut w, &self.disclosures_tail, TAIL_MAX);
        push_bounded(&mut w, &self.kb_payload, KB_PAYLOAD_MAX);
        push_bytes(&mut w, &self.kb_signature);
        push_bytes(&mut w, &self.issuer_pub_x);
        push_bytes(&mut w, &self.issuer_pub_y);
        push_bounded(&mut w, &self.age_salt, SALT_MAX_LEN);
        for v in [
            self.age_sd_offset,
            self.age_digest_index,
            self.vct_offset,
            self.cnf_offset,
            self.x_offset,
            self.y_offset,
            self.exp_offset,
            self.kb_aud_offset,
            self.kb_nonce_offset,
            self.kb_sd_hash_offset,
        ] {
            w.push(v.to_string());
        }
        push_bytes(&mut w, &self.challenge);
        push_bytes(&mut w, &self.subject);
        w
    }

    /// The 86 public inputs (subject 20, issuer_key_hash 32, over18, expiry,
    /// nonce 32) as 32-byte big-endian field elements, in the order the
    /// Solidity verifier expects them. Recomputed from the inputs, not read
    /// back from the proof.
    pub fn expected_public_inputs(&self) -> Vec<[u8; 32]> {
        let mut out = Vec::with_capacity(86);
        let fe = |v: u64| {
            let mut b = [0u8; 32];
            b[24..].copy_from_slice(&v.to_be_bytes());
            b
        };
        out.extend(self.subject.iter().map(|&b| fe(b as u64)));
        let ikh = hex::decode(strip0x(&self.expected.issuer_key_hash_hex)).unwrap();
        out.extend(ikh.iter().map(|&b| fe(b as u64)));
        out.push(fe(self.expected.over18 as u64));
        out.push(fe(self.expected.expiry));
        let nonce = hex::decode(strip0x(&self.expected.nonce_hex)).unwrap();
        out.extend(nonce.iter().map(|&b| fe(b as u64)));
        out
    }
}
