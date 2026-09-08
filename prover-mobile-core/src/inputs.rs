//! Derives the pid-sdjwt circuit inputs from an SD-JWT presentation.
//!
//! Port of `circuits/tools/gen-prover.ts` (WP13 circuit: three age shapes,
//! KB header as input, pinned aud); the two must produce the same Prover.toml
//! for the same input (`tests/gen_prover_parity.rs`). All offsets are byte
//! offsets into the raw (base64url-decoded) JSON of the issuer payload, the
//! KB-JWT header and payload, and (shapes B, C) the raw age object disclosure.
//! The age shapes are described in circuits/pid-sdjwt/REALISM.md, section 3.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64URL;
use num_bigint::BigUint;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::CoreError;

/// BoundedVec capacities of the circuit's `fn main`, read from the artifact
/// ABI (`Bounds::from_artifact`) so a revised circuit needs no code change
/// here. The defaults are the WP13 pid-sdjwt values (constants.nr,
/// 2026-09-07) and serve the tests.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Bounds {
    pub header_b64_max: usize,
    pub payload_max_len: usize,
    pub tail_max: usize,
    pub kb_header_max: usize,
    pub kb_payload_max: usize,
    pub salt_max_len: usize,
    pub age_obj_disc_max: usize,
}

impl Default for Bounds {
    fn default() -> Self {
        Bounds {
            header_b64_max: 2304,
            payload_max_len: 2304,
            tail_max: 768,
            kb_header_max: 128,
            kb_payload_max: 384,
            salt_max_len: 32,
            age_obj_disc_max: 512,
        }
    }
}

impl Bounds {
    /// Capacity of each BoundedVec parameter from the nargo artifact JSON.
    pub fn from_artifact(circuit_json: &str) -> Result<Bounds, CoreError> {
        let v: Value = serde_json::from_str(circuit_json).map_err(|e| err(format!("circuit json: {e}")))?;
        Self::from_abi(&v["abi"])
    }

    pub fn from_abi(abi: &Value) -> Result<Bounds, CoreError> {
        let cap = |name: &str| -> Result<usize, CoreError> {
            let p = abi["parameters"]
                .as_array()
                .and_then(|a| a.iter().find(|p| p["name"] == name))
                .ok_or_else(|| err(format!("artifact ABI has no parameter {name}")))?;
            let fields = p["type"]["fields"].as_array().ok_or_else(|| err(format!("{name} is not a BoundedVec struct")))?;
            let storage = fields.iter().find(|f| f["name"] == "storage").ok_or_else(|| err(format!("{name} has no storage field")))?;
            storage["type"]["length"].as_u64().map(|n| n as usize).ok_or_else(|| err(format!("{name}.storage has no length")))
        };
        Ok(Bounds {
            header_b64_max: cap("issuer_header_b64")?,
            payload_max_len: cap("payload")?,
            tail_max: cap("disclosures_tail")?,
            kb_header_max: cap("kb_header")?,
            kb_payload_max: cap("kb_payload")?,
            salt_max_len: cap("age_salt")?,
            age_obj_disc_max: cap("age_obj_disclosure")?,
        })
    }
}

/// Circuit constants that are checks, not ABI shapes (constants.nr): the
/// cnf.jwk x/y must lie within this many bytes after `"cnf":{"jwk":{`, and
/// alg/typ of the issuer header must share one 96-byte window (128 base64url
/// chars) of the decoded header that starts at a 4-aligned base64url offset.
pub const CNF_WINDOW: usize = 128;
pub const HEADER_WINDOW_B64: usize = 128;
pub const HEADER_WINDOW_RAW: usize = 96;

/// The `aud` the circuit pins (AUD_FRAGMENT in constants.nr): the registered
/// client_id of the verifier. Passed explicitly so a re-registration is a
/// parameter, not a rebuild of this crate.
pub const PINNED_AUD: &str = "x509_hash:VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI";
const P256_N_HEX: &str = "FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551";

/// What the app hands the core: the decrypted presentation plus what the
/// bridge session knows (bound address, challenge) and the pinned aud.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProverInput {
    /// `issuer_jwt~disc1~...~discN~kb_jwt`
    pub presentation: String,
    /// SEC1 uncompressed issuer key, 65 bytes, hex (with or without 0x).
    /// Empty: taken from the issuer JWT header's `x5c` leaf, as the bridge
    /// and the companion do for a real credential.
    #[serde(default)]
    pub issuer_key_sec1_hex: String,
    /// 20-byte EVM address, hex.
    pub bound_address_hex: String,
    /// 32-byte challenge, hex.
    pub challenge_hex: String,
    /// KB-JWT `aud` the circuit pins; `None` means `PINNED_AUD`.
    #[serde(default)]
    pub expected_aud: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgeShape {
    /// `age_equal_or_over: {_sd: [...]}` nested in the issuer payload.
    A,
    /// The age object itself is a disclosure with an `_sd` array.
    B,
    /// The age object is a disclosure with plain values (`"18": true`).
    C,
}

/// Fixed-size and bounded circuit inputs, in the ABI order of `fn main`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CircuitInputs {
    pub issuer_header_b64: Vec<u8>,
    pub hdr_window_b64_start: u32,
    pub hdr_alg_offset: u32,
    pub hdr_typ_offset: u32,
    pub payload: Vec<u8>,
    pub issuer_sig_b64: [u8; 86],
    pub issuer_sig: [u8; 64],
    pub disclosures_tail: Vec<u8>,
    pub kb_header: Vec<u8>,
    pub kb_alg_offset: u32,
    pub kb_typ_offset: u32,
    pub kb_payload: Vec<u8>,
    pub kb_signature: [u8; 64],
    pub issuer_pub_x: [u8; 32],
    pub issuer_pub_y: [u8; 32],
    pub age_salt: Vec<u8>,
    pub age_obj_disclosed: u32,
    pub age_leaf_disclosed: u32,
    pub age_obj_disclosure: Vec<u8>,
    pub sd_offset: u32,
    pub age_obj_digest_offset: u32,
    pub age_sd_offset: u32,
    pub age_target_offset: u32,
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
    pub shape: AgeShape,
    /// Expected public outputs, for display and for checking the proof.
    pub expected: ExpectedOutputs,
    pub bounds: Bounds,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InputValue {
    Bytes(Vec<u8>),
    Bounded(Vec<u8>),
    Scalar(u64),
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

fn find(hay: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    if needle.is_empty() || hay.len() < needle.len() || from > hay.len() - needle.len() {
        return None;
    }
    (from..=hay.len() - needle.len()).find(|&i| &hay[i..i + needle.len()] == needle)
}

fn rfind(hay: &[u8], needle: &[u8], before: usize) -> Option<usize> {
    if needle.is_empty() || hay.len() < needle.len() {
        return None;
    }
    let last = before.min(hay.len() - needle.len());
    (0..=last).rev().find(|&i| &hay[i..i + needle.len()] == needle)
}

/// Byte index of `needle` in `hay`, requiring exactly one occurrence (the
/// circuit assumes uniqueness).
fn unique_index(hay: &[u8], needle: &[u8], label: &str) -> Result<usize, CoreError> {
    let first = find(hay, needle, 0).ok_or_else(|| err(format!("{label} not found")))?;
    if find(hay, needle, first + 1).is_some() {
        return Err(err(format!("{label} occurs more than once; circuit assumes one")));
    }
    Ok(first)
}

/// Finds `needle` inside the array/object that opens right after
/// `anchor_end`, before any `]` or `}` (the circuit checks the same: no
/// closer between the container start and the target).
fn target_inside(hay: &[u8], anchor_end: usize, needle: &[u8], label: &str) -> Result<usize, CoreError> {
    let t = find(hay, needle, anchor_end).ok_or_else(|| err(format!("{label}: target not found")))?;
    if hay[anchor_end..t].iter().any(|&b| b == b']' || b == b'}') {
        return Err(err(format!("{label}: container closes before the target")));
    }
    Ok(t)
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

/// P-256 SubjectPublicKeyInfo of the first `x5c` certificate in a JWT header:
/// the SEC1 uncompressed point (65 bytes). Minimal DER walk, same as
/// companion/src/der.ts `publicKeyFromCertificate`.
pub fn issuer_key_from_x5c(header_b64: &str) -> Result<Vec<u8>, CoreError> {
    let header: Value = serde_json::from_slice(&from_b64url(header_b64)?).map_err(|e| err(format!("issuer header JSON: {e}")))?;
    let leaf = header["x5c"].as_array().and_then(|a| a.first()).and_then(Value::as_str).ok_or_else(|| err("issuer header has no x5c"))?;
    let der = base64::engine::general_purpose::STANDARD.decode(leaf).map_err(|e| err(format!("x5c base64: {e}")))?;
    struct Tlv { tag: u8, start: usize, end: usize }
    fn read(buf: &[u8], off: usize) -> Result<Tlv, CoreError> {
        let tag = *buf.get(off).ok_or_else(|| err("DER: truncated"))?;
        let mut len = *buf.get(off + 1).ok_or_else(|| err("DER: truncated"))? as usize;
        let mut p = off + 2;
        if len & 0x80 != 0 {
            let n = len & 0x7f;
            if n == 0 || n > 4 { return Err(err("DER: unsupported length form")); }
            len = 0;
            for _ in 0..n { len = (len << 8) | *buf.get(p).ok_or_else(|| err("DER: truncated"))? as usize; p += 1; }
        }
        if p + len > buf.len() { return Err(err("DER: element runs past the end")); }
        Ok(Tlv { tag, start: p, end: p + len })
    }
    fn children(buf: &[u8], t: &Tlv) -> Result<Vec<Tlv>, CoreError> {
        let mut out = Vec::new();
        let mut p = t.start;
        while p < t.end { let c = read(buf, p)?; p = c.end; out.push(c); }
        Ok(out)
    }
    let cert = read(&der, 0)?;
    if cert.tag != 0x30 { return Err(err("DER: certificate is not a SEQUENCE")); }
    let tbs = read(&der, cert.start)?;
    if tbs.tag != 0x30 { return Err(err("DER: tbsCertificate is not a SEQUENCE")); }
    let fields = children(&der, &tbs)?;
    let i = if fields.first().map(|f| f.tag) == Some(0xa0) { 1 } else { 0 };
    let spki = fields.get(i + 5).filter(|f| f.tag == 0x30).ok_or_else(|| err("DER: subjectPublicKeyInfo not found"))?;
    let parts = children(&der, spki)?;
    let (alg, bits) = (parts.first().ok_or_else(|| err("DER: spki"))?, parts.get(1).ok_or_else(|| err("DER: spki"))?);
    if bits.tag != 0x03 { return Err(err("DER: subjectPublicKey is not a BIT STRING")); }
    let alg_children = children(&der, alg)?;
    let curve = alg_children.get(1).map(|c| &der[c.start..c.end]).unwrap_or(&[]);
    if curve != [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07] { return Err(err(format!("x5c leaf key is not P-256 (curve OID {})", hex::encode(curve)))); }
    let key = &der[bits.start + 1..bits.end];
    if key.len() != 65 || key[0] != 4 { return Err(err(format!("x5c leaf key is not an uncompressed point ({} bytes)", key.len()))); }
    Ok(key.to_vec())
}

struct Disclosure {
    raw: Vec<u8>,
    arr: Vec<Value>,
    digest: String,
}

pub fn derive(input: &ProverInput) -> Result<CircuitInputs, CoreError> {
    derive_with_bounds(input, Bounds::default())
}

pub fn derive_with_bounds(input: &ProverInput, bounds: Bounds) -> Result<CircuitInputs, CoreError> {
    let expected_aud = input.expected_aud.as_deref().filter(|a| !a.is_empty()).unwrap_or(PINNED_AUD);
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
    if header_b64.len() < HEADER_WINDOW_B64 {
        return Err(err(format!("issuer header shorter than {HEADER_WINDOW_B64} base64url chars")));
    }

    // --- issuer header: alg and typ inside one 96-byte window of the decoded header ---
    // Same choice as gen-prover.ts: the largest 4-aligned base64url start whose window begins
    // at or before the first fragment, clamped to the header end (key order is free).
    let header_raw = from_b64url(header_b64)?;
    let hdr_alg_abs = find(&header_raw, b"\"alg\":\"ES256\"", 0).ok_or_else(|| err("issuer header: \"alg\":\"ES256\" not found"))?;
    let hdr_typ_abs = find(&header_raw, b"\"typ\":\"dc+sd-jwt\"", 0)
        .or_else(|| find(&header_raw, b"\"typ\":\"vc+sd-jwt\"", 0))
        .ok_or_else(|| err("issuer header: \"typ\":\"dc+sd-jwt\" (or vc+sd-jwt) not found"))?;
    let hdr_lo = hdr_alg_abs.min(hdr_typ_abs);
    let hdr_hi = (hdr_alg_abs + 13).max(hdr_typ_abs + 17);
    let hdr_max_start = (header_b64.len() - HEADER_WINDOW_B64) / 4 * 4;
    let hdr_window_b64_start = (hdr_lo / 3 * 4).min(hdr_max_start);
    let hdr_window_raw = hdr_window_b64_start / 4 * 3;
    if hdr_hi > hdr_window_raw + HEADER_WINDOW_RAW {
        return Err(err(format!(
            "issuer header: \"alg\" (byte {hdr_alg_abs}) and \"typ\" (byte {hdr_typ_abs}) do not share one {HEADER_WINDOW_RAW}-byte window"
        )));
    }
    let hdr_alg_offset = hdr_alg_abs - hdr_window_raw;
    let hdr_typ_offset = hdr_typ_abs - hdr_window_raw;

    // --- issuer payload offsets ---
    let vct_offset = unique_index(&payload_raw, b"\"vct\":\"urn:eudi:pid:de:1\"", "vct fragment")?;
    let cnf_fragment: &[u8] = b"\"cnf\":{\"jwk\":{";
    let cnf_offset = unique_index(&payload_raw, cnf_fragment, "cnf fragment")?;
    let x_offset = find(&payload_raw, b"\"x\":\"", cnf_offset).ok_or_else(|| err("cnf.jwk x not found"))?;
    let y_offset = find(&payload_raw, b"\"y\":\"", cnf_offset).ok_or_else(|| err("cnf.jwk y not found"))?;
    if x_offset >= cnf_offset + CNF_WINDOW || y_offset >= cnf_offset + CNF_WINDOW {
        return Err(err(format!("cnf.jwk x/y further than {CNF_WINDOW} bytes after cnf")));
    }
    let exp_offset = unique_index(&payload_raw, b"\"exp\":", "exp fragment")?;
    {
        let after = &payload_raw[exp_offset + 6..];
        let ok = after.len() >= 11 && after[..10].iter().all(u8::is_ascii_digit) && (after[10] == b',' || after[10] == b'}');
        if !ok {
            return Err(err("issuer exp is not a 10 digit number"));
        }
    }

    // --- age shape and witness ---
    let mut decoded: Vec<Disclosure> = Vec::with_capacity(disclosures.len());
    for d in disclosures {
        let raw = from_b64url(d)?;
        let arr = match serde_json::from_slice::<Value>(&raw) {
            Ok(Value::Array(a)) if a.len() == 3 => a,
            _ => return Err(err("only object-property disclosures are supported")),
        };
        decoded.push(Disclosure { raw, arr, digest: B64URL.encode(sha256(d.as_bytes())) });
    }
    let leaf = decoded.iter().find(|d| d.arr[1] == "18" && d.arr[2] == Value::Bool(true));
    let obj = decoded.iter().find(|d| d.arr[1] == "age_equal_or_over" && d.arr[2].is_object());
    let age_in_payload = payload_obj.get("age_equal_or_over").map(Value::is_object).unwrap_or(false);
    let shape = if age_in_payload && payload_obj["age_equal_or_over"]["_sd"].is_array() {
        AgeShape::A
    } else if obj.map(|o| o.arr[2]["_sd"].is_array()).unwrap_or(false) {
        AgeShape::B
    } else if obj.map(|o| o.arr[2]["18"] == Value::Bool(true)).unwrap_or(false) {
        AgeShape::C
    } else {
        return Err(err("no age_equal_or_over.18: neither nested _sd in the payload (A), nor a disclosed age object with _sd (B) or with plain values (C)"));
    };
    if matches!(shape, AgeShape::A | AgeShape::B) && leaf.is_none() {
        return Err(err("no presented disclosure [\"salt\",\"18\",true]"));
    }
    let mut age_salt = String::new();
    if let Some(l) = leaf {
        age_salt = l.arr[0].as_str().map(str::to_string).unwrap_or_else(|| l.arr[0].to_string());
        // The circuit rebuilds the disclosure as ["<salt>","18",true] byte for byte.
        if l.raw != format!("[\"{age_salt}\",\"18\",true]").into_bytes() {
            return Err(err("age disclosure is not in the canonical form the circuit rebuilds"));
        }
        if age_salt.len() > bounds.salt_max_len {
            return Err(err("age salt exceeds SALT_MAX_LEN"));
        }
    }
    let leaf_digest_quoted: Vec<u8> = leaf.map(|l| format!("\"{}\"", l.digest).into_bytes()).unwrap_or_default();

    let mut age_obj_disclosed = 0u32;
    let age_leaf_disclosed = if leaf.is_some() { 1u32 } else { 0 };
    let mut age_obj_raw: Vec<u8> = Vec::new();
    let mut sd_offset = 0usize;
    let mut age_obj_digest_offset = 0usize;
    let age_sd_offset;
    let age_target_offset;
    match shape {
        AgeShape::A => {
            let frag: &[u8] = b"\"age_equal_or_over\":{\"_sd\":[";
            age_sd_offset = unique_index(&payload_raw, frag, "age_equal_or_over._sd fragment")?;
            age_target_offset = target_inside(&payload_raw, age_sd_offset + frag.len(), &leaf_digest_quoted, "age_equal_or_over._sd")?;
        }
        AgeShape::B | AgeShape::C => {
            let o = obj.expect("shape B/C has an object disclosure");
            age_obj_disclosed = 1;
            age_obj_raw = o.raw.clone();
            if age_obj_raw.len() > bounds.age_obj_disc_max {
                return Err(err(format!("age object disclosure {} bytes exceeds AGE_OBJ_DISC_MAX {}", age_obj_raw.len(), bounds.age_obj_disc_max)));
            }
            // anchor the object disclosure digest in the payload's "_sd" array that contains it
            let obj_digest_quoted = format!("\"{}\"", o.digest).into_bytes();
            age_obj_digest_offset = find(&payload_raw, &obj_digest_quoted, 0).ok_or_else(|| err("age object disclosure digest not in the issuer payload"))?;
            let sd_idx = rfind(&payload_raw, b"\"_sd\":[", age_obj_digest_offset).ok_or_else(|| err("no \"_sd\":[ before the age object digest"))?;
            sd_offset = sd_idx;
            target_inside(&payload_raw, sd_idx + 7, &obj_digest_quoted, "top-level _sd")?;
            let disc = &age_obj_raw;
            if shape == AgeShape::B {
                let frag: &[u8] = b"\"age_equal_or_over\",{\"_sd\":[";
                age_sd_offset = unique_index(disc, frag, "age_equal_or_over fragment in the disclosure")?;
                age_target_offset = target_inside(disc, age_sd_offset + frag.len(), &leaf_digest_quoted, "disclosed age object _sd")?;
            } else {
                let frag: &[u8] = b"\"age_equal_or_over\",{";
                age_sd_offset = unique_index(disc, frag, "age_equal_or_over fragment in the disclosure")?;
                age_target_offset = target_inside(disc, age_sd_offset + frag.len(), b"\"18\":true", "disclosed age object")?;
                if !matches!(disc.get(age_target_offset + 9), Some(b',') | Some(b'}')) {
                    return Err(err("\"18\":true not terminated by , or }"));
                }
            }
            // ["<salt>", must precede the claim name
            let ok = disc.starts_with(b"[\"")
                && age_sd_offset >= 2
                && disc[age_sd_offset - 2] == b'"'
                && disc[age_sd_offset - 1] == b','
                && !disc[2..age_sd_offset - 2].contains(&b'"');
            if !ok {
                return Err(err("age object disclosure is not [\"<salt>\",\"age_equal_or_over\",{..."));
            }
        }
    }

    // --- KB-JWT ---
    let kb_parts: Vec<&str> = kb_jwt.split('.').collect();
    if kb_parts.len() != 3 {
        return Err(err("KB-JWT is not header.payload.signature"));
    }
    let kb_header_raw = from_b64url(kb_parts[0])?;
    if B64URL.encode(&kb_header_raw) != kb_parts[0] {
        return Err(err("KB header base64url round trip differs"));
    }
    let kb_alg_offset = find(&kb_header_raw, b"\"alg\":\"ES256\"", 0);
    let kb_typ_offset = find(&kb_header_raw, b"\"typ\":\"kb+jwt\"", 0);
    let (Some(kb_alg_offset), Some(kb_typ_offset)) = (kb_alg_offset, kb_typ_offset) else {
        return Err(err("KB-JWT header lacks alg ES256 or typ kb+jwt"));
    };
    let kb_payload_raw = from_b64url(kb_parts[1])?;
    if B64URL.encode(&kb_payload_raw) != kb_parts[1] {
        return Err(err("KB payload base64url round trip differs"));
    }
    let kb_obj: Value =
        serde_json::from_slice(&kb_payload_raw).map_err(|e| err(format!("KB payload JSON: {e}")))?;
    let kb_aud_offset = unique_index(&kb_payload_raw, format!("\"aud\":\"{expected_aud}\"").as_bytes(), "aud fragment")?;
    let kb_nonce_offset = unique_index(&kb_payload_raw, b"\"nonce\":\"", "nonce fragment")?;
    let kb_sd_hash_offset = unique_index(&kb_payload_raw, b"\"sd_hash\":\"", "sd_hash fragment")?;

    let tail = format!("~{}~", disclosures.join("~"));
    let sd_hash = B64URL.encode(sha256(format!("{issuer_jwt}{tail}").as_bytes()));
    if kb_obj.get("sd_hash").and_then(Value::as_str) != Some(sd_hash.as_str()) {
        return Err(err("sd_hash in KB-JWT does not match the presentation"));
    }

    // --- keys, subject, challenge ---
    let sec1 = if input.issuer_key_sec1_hex.trim().is_empty() {
        issuer_key_from_x5c(header_b64)?
    } else {
        hex::decode(strip0x(input.issuer_key_sec1_hex.trim())).map_err(|e| err(format!("issuer key hex: {e}")))?
    };
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
        issuer_header_b64: bounded("issuer_header_b64", header_b64.as_bytes(), bounds.header_b64_max)?,
        hdr_window_b64_start: hdr_window_b64_start as u32,
        hdr_alg_offset: hdr_alg_offset as u32,
        hdr_typ_offset: hdr_typ_offset as u32,
        payload: bounded("payload", &payload_raw, bounds.payload_max_len)?,
        issuer_sig_b64: sig_b64.as_bytes().try_into().unwrap(),
        issuer_sig: low_s(&issuer_sig_raw),
        disclosures_tail: bounded("disclosures_tail", tail.as_bytes(), bounds.tail_max)?,
        kb_header: bounded("kb_header", &kb_header_raw, bounds.kb_header_max)?,
        kb_alg_offset: kb_alg_offset as u32,
        kb_typ_offset: kb_typ_offset as u32,
        kb_payload: bounded("kb_payload", &kb_payload_raw, bounds.kb_payload_max)?,
        kb_signature: low_s(&kb_sig_raw),
        issuer_pub_x,
        issuer_pub_y,
        age_salt: bounded("age_salt", age_salt.as_bytes(), bounds.salt_max_len)?,
        age_obj_disclosed,
        age_leaf_disclosed,
        age_obj_disclosure: bounded("age_obj_disclosure", &age_obj_raw, bounds.age_obj_disc_max)?,
        sd_offset: sd_offset as u32,
        age_obj_digest_offset: age_obj_digest_offset as u32,
        age_sd_offset: age_sd_offset as u32,
        age_target_offset: age_target_offset as u32,
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
        shape,
        expected: ExpectedOutputs {
            issuer_key_hash_hex: format!("0x{}", hex::encode(sha256(&sec1))),
            over18: 1,
            expiry,
            nonce_hex: format!("0x{nonce_hex}"),
            subject_hex: format!("0x{}", hex::encode(subject)),
        },
        bounds,
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
        let shape = match self.shape { AgeShape::A => "A", AgeShape::B => "B", AgeShape::C => "C" };
        let mut t = format!("# age shape {shape}\n");
        t += &bounded("issuer_header_b64", &self.issuer_header_b64, self.bounds.header_b64_max);
        t += &format!("hdr_window_b64_start = {}\n", self.hdr_window_b64_start);
        t += &format!("hdr_alg_offset = {}\n", self.hdr_alg_offset);
        t += &format!("hdr_typ_offset = {}\n", self.hdr_typ_offset);
        t += &bounded("payload", &self.payload, self.bounds.payload_max_len);
        t += &format!("issuer_sig_b64 = {}\n", list(&self.issuer_sig_b64));
        t += &format!("issuer_sig = {}\n", list(&self.issuer_sig));
        t += &bounded("disclosures_tail", &self.disclosures_tail, self.bounds.tail_max);
        t += &bounded("kb_header", &self.kb_header, self.bounds.kb_header_max);
        t += &format!("kb_alg_offset = {}\n", self.kb_alg_offset);
        t += &format!("kb_typ_offset = {}\n", self.kb_typ_offset);
        t += &bounded("kb_payload", &self.kb_payload, self.bounds.kb_payload_max);
        t += &format!("kb_signature = {}\n", list(&self.kb_signature));
        t += &format!("issuer_pub_x = {}\n", list(&self.issuer_pub_x));
        t += &format!("issuer_pub_y = {}\n", list(&self.issuer_pub_y));
        t += &bounded("age_salt", &self.age_salt, self.bounds.salt_max_len);
        t += &format!("age_obj_disclosed = {}\n", self.age_obj_disclosed);
        t += &format!("age_leaf_disclosed = {}\n", self.age_leaf_disclosed);
        t += &bounded("age_obj_disclosure", &self.age_obj_disclosure, self.bounds.age_obj_disc_max);
        for (name, v) in [
            ("sd_offset", self.sd_offset),
            ("age_obj_digest_offset", self.age_obj_digest_offset),
            ("age_sd_offset", self.age_sd_offset),
            ("age_target_offset", self.age_target_offset),
            ("vct_offset", self.vct_offset),
            ("cnf_offset", self.cnf_offset),
            ("x_offset", self.x_offset),
            ("y_offset", self.y_offset),
            ("exp_offset", self.exp_offset),
            ("kb_aud_offset", self.kb_aud_offset),
            ("kb_nonce_offset", self.kb_nonce_offset),
            ("kb_sd_hash_offset", self.kb_sd_hash_offset),
        ] {
            t += &format!("{name} = {v}\n");
        }
        t += &format!("challenge = {}\n", list(&self.challenge));
        t += &format!("subject = {}\n", list(&self.subject));
        t
    }

    /// Every `fn main` parameter by name: fixed arrays and scalars as-is,
    /// BoundedVecs as bytes (capacity comes from the artifact ABI).
    pub fn values(&self) -> Vec<(&'static str, InputValue)> {
        use InputValue::*;
        vec![
            ("issuer_header_b64", Bounded(self.issuer_header_b64.clone())),
            ("hdr_window_b64_start", Scalar(self.hdr_window_b64_start as u64)),
            ("hdr_alg_offset", Scalar(self.hdr_alg_offset as u64)),
            ("hdr_typ_offset", Scalar(self.hdr_typ_offset as u64)),
            ("payload", Bounded(self.payload.clone())),
            ("issuer_sig_b64", Bytes(self.issuer_sig_b64.to_vec())),
            ("issuer_sig", Bytes(self.issuer_sig.to_vec())),
            ("disclosures_tail", Bounded(self.disclosures_tail.clone())),
            ("kb_header", Bounded(self.kb_header.clone())),
            ("kb_alg_offset", Scalar(self.kb_alg_offset as u64)),
            ("kb_typ_offset", Scalar(self.kb_typ_offset as u64)),
            ("kb_payload", Bounded(self.kb_payload.clone())),
            ("kb_signature", Bytes(self.kb_signature.to_vec())),
            ("issuer_pub_x", Bytes(self.issuer_pub_x.to_vec())),
            ("issuer_pub_y", Bytes(self.issuer_pub_y.to_vec())),
            ("age_salt", Bounded(self.age_salt.clone())),
            ("age_obj_disclosed", Scalar(self.age_obj_disclosed as u64)),
            ("age_leaf_disclosed", Scalar(self.age_leaf_disclosed as u64)),
            ("age_obj_disclosure", Bounded(self.age_obj_disclosure.clone())),
            ("sd_offset", Scalar(self.sd_offset as u64)),
            ("age_obj_digest_offset", Scalar(self.age_obj_digest_offset as u64)),
            ("age_sd_offset", Scalar(self.age_sd_offset as u64)),
            ("age_target_offset", Scalar(self.age_target_offset as u64)),
            ("vct_offset", Scalar(self.vct_offset as u64)),
            ("cnf_offset", Scalar(self.cnf_offset as u64)),
            ("x_offset", Scalar(self.x_offset as u64)),
            ("y_offset", Scalar(self.y_offset as u64)),
            ("exp_offset", Scalar(self.exp_offset as u64)),
            ("kb_aud_offset", Scalar(self.kb_aud_offset as u64)),
            ("kb_nonce_offset", Scalar(self.kb_nonce_offset as u64)),
            ("kb_sd_hash_offset", Scalar(self.kb_sd_hash_offset as u64)),
            ("challenge", Bytes(self.challenge.to_vec())),
            ("subject", Bytes(self.subject.to_vec())),
        ]
    }

    /// The witness vector flattened the way `noirc_abi` encodes `fn main`
    /// parameters, driven by the artifact ABI: parameters in ABI order, a
    /// BoundedVec as `storage[capacity]` then `len`, arrays element by
    /// element, scalars as one field. One decimal string per field element;
    /// entry i becomes ACIR witness index i (as noir-rs does). Fails when the
    /// artifact names a parameter this derivation does not produce or a
    /// fixed array length differs, so a revised circuit fails loudly.
    pub fn to_flat_witness(&self, abi: &Value) -> Result<Vec<String>, CoreError> {
        let values = self.values();
        let params = abi["parameters"].as_array().ok_or_else(|| err("artifact ABI has no parameters"))?;
        let mut w: Vec<String> = Vec::with_capacity(7000);
        for p in params {
            let name = p["name"].as_str().unwrap_or("");
            let (_, v) = values.iter().find(|(n, _)| *n == name).ok_or_else(|| err(format!("artifact parameter {name} is not derived by this core")))?;
            let t = &p["type"];
            match (t["kind"].as_str(), v) {
                (Some("struct"), InputValue::Bounded(b)) => {
                    let fields = t["fields"].as_array().ok_or_else(|| err(format!("{name}: struct without fields")))?;
                    for f in fields {
                        match f["name"].as_str() {
                            Some("storage") => {
                                let cap = f["type"]["length"].as_u64().unwrap_or(0) as usize;
                                if b.len() > cap { return Err(err(format!("{name}: {} bytes exceeds capacity {cap}", b.len()))); }
                                w.extend(padded(b, cap).iter().map(|x| x.to_string()));
                            }
                            Some("len") => w.push(b.len().to_string()),
                            other => return Err(err(format!("{name}: unexpected BoundedVec field {other:?}"))),
                        }
                    }
                }
                (Some("array"), InputValue::Bytes(b)) => {
                    let n = t["length"].as_u64().unwrap_or(0) as usize;
                    if b.len() != n { return Err(err(format!("{name}: artifact wants {n} bytes, derived {}", b.len()))); }
                    w.extend(b.iter().map(|x| x.to_string()));
                }
                (Some("integer"), InputValue::Scalar(x)) => w.push(x.to_string()),
                (kind, _) => return Err(err(format!("{name}: artifact kind {kind:?} does not match the derived value"))),
            }
        }
        Ok(w)
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
