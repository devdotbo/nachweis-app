//! Synthetic SD-JWT PID presentations for tests.
//!
//! Mirrors the host's `--synth` shape: `vct`, `cnf.jwk` holder key, a nested
//! `age_equal_or_over` object whose `18` entry is a separate disclosure, and a KB-JWT with
//! `aud`, `iat`, `nonce`, `sd_hash` and an optional `exp`. Keys are derived from a seed, so
//! nothing here is or resembles a real credential. Never compiled into the guest.
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use nachweis_pid_lib::{nonce_string, GuestInput};
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// Minimal issuer header, alg first.
pub const DEFAULT_ISSUER_HEADER: &str = r#"{"alg":"ES256","typ":"dc+sd-jwt"}"#;

#[derive(Debug, Clone)]
pub struct SynthOptions {
    /// Seed for the issuer and holder keys, the address and the challenge.
    pub seed: u8,
    /// Issuer JWT header as JSON text (signed verbatim, so key order is preserved).
    pub issuer_header: String,
    pub vct: String,
    pub aud: String,
    pub issuer_iat: u64,
    pub issuer_exp: u64,
    pub kb_iat: u64,
    /// KB-JWT `exp`; `None` omits the claim, as the official German test wallet does.
    pub kb_exp: Option<u64>,
    /// Value of the disclosed `age_equal_or_over.18` entry.
    pub over18: bool,
}

impl SynthOptions {
    /// Baseline at `now`: German PID vct, the sandbox aud, credential valid for a year, KB-JWT
    /// issued at `now` without `exp` (the official test wallet's claim set, G0 2026-09-08).
    pub fn at(now: u64) -> Self {
        SynthOptions {
            seed: 1,
            issuer_header: DEFAULT_ISSUER_HEADER.to_string(),
            vct: "urn:eudi:pid:de:1".to_string(),
            aud: "https://self-issued.me/v2".to_string(),
            issuer_iat: now,
            issuer_exp: now + 365 * 86_400,
            kb_iat: now,
            kb_exp: None,
            over18: true,
        }
    }
}

fn b64u(b: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(b)
}

fn key_from_seed(label: &str, seed: u8) -> SigningKey {
    let mut h = Sha256::new();
    h.update(label.as_bytes());
    h.update([seed]);
    SigningKey::from_slice(&h.finalize()).expect("seed scalar")
}

fn sign_jws(header: &str, payload: &str, key: &SigningKey) -> String {
    let input = format!("{}.{}", b64u(header.as_bytes()), b64u(payload.as_bytes()));
    let sig: Signature = key.sign(input.as_bytes());
    format!("{input}.{}", b64u(&sig.to_bytes()))
}

/// Object-property disclosure: returns (base64url disclosure, its digest).
fn disclosure(salt: &str, name: &str, value: Value) -> (String, String) {
    let d = b64u(serde_json::to_string(&json!([salt, name, value])).unwrap().as_bytes());
    let digest = b64u(&Sha256::digest(d.as_bytes()));
    (d, digest)
}

/// Mint a presentation and the matching private guest input (issuer key, vct, aud, bound
/// address and challenge). The presented disclosures are `given_name`, `family_name` and the
/// nested `18`; `birthdate` and the other age entries stay undisclosed.
pub fn mint(o: &SynthOptions) -> GuestInput {
    let issuer = key_from_seed("issuer", o.seed);
    let holder = key_from_seed("holder", o.seed);
    let issuer_key_sec1 = issuer.verifying_key().to_encoded_point(false).as_bytes().to_vec();
    let holder_pt = holder.verifying_key().to_encoded_point(false);

    let addr_h = Sha256::digest([b"address".as_slice(), &[o.seed]].concat());
    let mut bound_address = [0u8; 20];
    bound_address.copy_from_slice(&addr_h[..20]);
    let challenge: [u8; 32] = Sha256::digest([b"challenge".as_slice(), &[o.seed]].concat()).into();
    let nonce = nonce_string(&bound_address, &challenge);

    let salt = |i: u8| b64u(&[i; 16]);
    let (d_given, dg_given) = disclosure(&salt(1), "given_name", "Erika".into());
    let (d_family, dg_family) = disclosure(&salt(2), "family_name", "Mustermann".into());
    let (_d_birth, dg_birth) = disclosure(&salt(3), "birthdate", "1964-08-12".into());
    let mut age_digests = Vec::new();
    let mut d_18 = String::new();
    for (i, t) in [12u8, 14, 16, 18, 21, 65].iter().enumerate() {
        let value = if *t == 18 { o.over18 } else { true };
        let (d, dg) = disclosure(&salt(10 + i as u8), &t.to_string(), value.into());
        if *t == 18 {
            d_18 = d;
        }
        age_digests.push(dg);
    }
    let payload = json!({
        "iss": "https://synthetic-issuer.example/pid-de",
        "vct": o.vct,
        "iat": o.issuer_iat,
        "nbf": o.issuer_iat,
        "exp": o.issuer_exp,
        "_sd_alg": "sha-256",
        "cnf": {"jwk": {"kty": "EC", "crv": "P-256",
            "x": b64u(holder_pt.x().unwrap()), "y": b64u(holder_pt.y().unwrap())}},
        "_sd": [dg_given, dg_family, dg_birth],
        "age_equal_or_over": {"_sd": age_digests},
    });
    let issuer_jwt = sign_jws(&o.issuer_header, &serde_json::to_string(&payload).unwrap(), &issuer);
    let sd_part = format!("{issuer_jwt}~{d_given}~{d_family}~{d_18}~");
    let sd_hash = b64u(&Sha256::digest(sd_part.as_bytes()));
    let mut kb_payload = json!({
        "iat": o.kb_iat,
        "aud": o.aud,
        "nonce": nonce,
        "sd_hash": sd_hash,
    });
    if let Some(exp) = o.kb_exp {
        kb_payload["exp"] = json!(exp);
    }
    let kb = sign_jws(r#"{"alg":"ES256","typ":"kb+jwt"}"#, &serde_json::to_string(&kb_payload).unwrap(), &holder);

    GuestInput {
        presentation: format!("{sd_part}{kb}"),
        issuer_key_sec1,
        expected_vct: o.vct.clone(),
        expected_aud: o.aud.clone(),
        bound_address,
        challenge,
    }
}
