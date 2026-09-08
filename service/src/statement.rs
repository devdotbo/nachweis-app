//! Native execution of the shared statement (fast fail before proving) and guest input assembly.
use crate::config::Config;
use crate::session::{DecodedPublicValues, Session};
use alloy::sol_types::SolType;
use anyhow::{anyhow, Context, Result};
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use nachweis_pid_lib::{check_kb_freshness, prove_statement_with_facts, GuestInput, PublicValuesStruct};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::time::SystemTime;
use x509_cert::{der::Decode, Certificate};

/// Issuer public key (SEC1 uncompressed) from the x5c leaf certificate in the issuer JWT header.
pub fn issuer_key_from_x5c(issuer_jwt: &str) -> Result<Vec<u8>> {
    let h = issuer_jwt.split('.').next().ok_or_else(|| anyhow!("issuer JWT has no header"))?;
    let hdr: serde_json::Value =
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(h).context("issuer header base64url")?)
            .context("issuer header json")?;
    let leaf_b64 = hdr["x5c"][0].as_str().ok_or_else(|| anyhow!("issuer header has no x5c"))?;
    let leaf = STANDARD.decode(leaf_b64).context("x5c[0] base64")?;
    let cert = Certificate::from_der(&leaf).map_err(|e| anyhow!("x5c[0] DER: {e}"))?;
    let key = cert.tbs_certificate.subject_public_key_info.subject_public_key.raw_bytes().to_vec();
    if key.len() != 65 || key[0] != 0x04 {
        return Err(anyhow!("x5c leaf key is not an uncompressed P-256 point ({} bytes)", key.len()));
    }
    Ok(key)
}

/// Assemble the private guest input for a session and presentation.
pub fn build_input(cfg: &Config, session: &Session, presentation: &str) -> Result<GuestInput> {
    let presentation = presentation.trim().to_string();
    let issuer_jwt = presentation.split('~').next().unwrap_or_default();
    let issuer_key_sec1 = match &cfg.issuer_key_sec1 {
        Some(k) => k.clone(),
        None => issuer_key_from_x5c(issuer_jwt)?,
    };
    Ok(GuestInput {
        presentation,
        issuer_key_sec1,
        expected_vct: cfg.expected_vct.clone(),
        expected_aud: cfg.expected_aud.clone(),
        bound_address: session.bound_address.0 .0,
        challenge: session.challenge,
    })
}

fn panic_message(p: Box<dyn std::any::Any + Send>) -> String {
    if let Some(s) = p.downcast_ref::<String>() {
        s.clone()
    } else if let Some(s) = p.downcast_ref::<&str>() {
        (*s).to_string()
    } else {
        "statement panicked without message".to_string()
    }
}

/// Run the statement natively, then the KB-JWT freshness check the guest cannot do (it has no
/// clock): with `kb_jwt_window_secs = Some(w)` the KB-JWT `iat` must lie in `[now - w, now + w]`
/// and `exp`, when present, in `(now, now + w]` (`nachweis_pid_lib::check_kb_freshness`). The
/// library asserts on every check, so a statement failure surfaces as a panic which is caught
/// and returned as the error text.
pub fn run_native(input: &GuestInput, kb_jwt_window_secs: Option<u64>) -> Result<(PublicValuesStruct, Vec<u8>)> {
    let r = catch_unwind(AssertUnwindSafe(|| prove_statement_with_facts(input)));
    let (pv, facts) = match r {
        Ok(x) => x,
        Err(p) => return Err(anyhow!("statement failed: {}", panic_message(p))),
    };
    if let Some(window) = kb_jwt_window_secs {
        let now = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        check_kb_freshness(&facts, now, window).map_err(|e| anyhow!("KB-JWT freshness: {e}"))?;
    }
    let bytes = PublicValuesStruct::abi_encode(&pv);
    Ok((pv, bytes))
}

pub fn decode_public_values(bytes: &[u8]) -> Result<DecodedPublicValues> {
    let pv = PublicValuesStruct::abi_decode(bytes).map_err(|e| anyhow!("public values decode: {e}"))?;
    Ok(DecodedPublicValues {
        issuer_key_hash: format!("0x{}", hex::encode(pv.issuerKeyHash)),
        vct_hash: format!("0x{}", hex::encode(pv.vctHash)),
        over18: pv.over18,
        subject: alloy::primitives::Address::from(pv.subject.0 .0),
        expiry: pv.expiry,
        nonce: format!("0x{}", hex::encode(pv.nonce)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::DEFAULT_KB_JWT_WINDOW_SECS;
    use nachweis_pid_lib::synth::{mint, SynthOptions};

    fn now() -> u64 {
        SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_secs()
    }

    /// The official German test wallet signs KB-JWTs with aud, iat, nonce and sd_hash only; the
    /// bridge must accept that with the default window and commit the issuer exp.
    #[test]
    fn native_run_accepts_a_kb_jwt_without_exp() {
        let t = now();
        let input = mint(&SynthOptions::at(t));
        let (pv, bytes) = run_native(&input, Some(DEFAULT_KB_JWT_WINDOW_SECS)).unwrap();
        assert_eq!(pv.expiry, t + 365 * 86_400);
        assert_eq!(pv.over18, 1);
        assert_eq!(decode_public_values(&bytes).unwrap().expiry, pv.expiry);
    }

    #[test]
    fn native_run_rejects_a_stale_iat_when_exp_is_absent() {
        let t = now();
        let input = mint(&SynthOptions { kb_iat: t - DEFAULT_KB_JWT_WINDOW_SECS - 60, ..SynthOptions::at(t) });
        let err = run_native(&input, Some(DEFAULT_KB_JWT_WINDOW_SECS)).err().expect("rejected").to_string();
        assert!(err.starts_with("KB-JWT freshness: KB-JWT iat"), "{err}");
        // Window disabled (KB_JWT_WINDOW_SECS=0): the statement alone decides.
        assert!(run_native(&input, None).is_ok());
    }

    #[test]
    fn native_run_keeps_the_exp_rule_when_exp_is_present() {
        let t = now();
        let fresh = mint(&SynthOptions { kb_exp: Some(t + 300), ..SynthOptions::at(t) });
        assert!(run_native(&fresh, Some(DEFAULT_KB_JWT_WINDOW_SECS)).is_ok());
        let expired = mint(&SynthOptions { kb_iat: t - 400, kb_exp: Some(t - 100), ..SynthOptions::at(t) });
        let err = run_native(&expired, Some(DEFAULT_KB_JWT_WINDOW_SECS)).err().expect("rejected").to_string();
        assert!(err.starts_with("KB-JWT freshness: KB-JWT expired"), "{err}");
    }

    #[test]
    fn native_run_reports_a_statement_failure_as_error_text() {
        let t = now();
        let mut input = mint(&SynthOptions::at(t));
        input.expected_aud = "https://other.example".to_string();
        let err = run_native(&input, None).err().expect("rejected").to_string();
        assert!(err.contains("KB-JWT aud"), "{err}");
    }
}
