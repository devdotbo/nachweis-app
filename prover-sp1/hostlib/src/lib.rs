//! Host-side companions to `nachweis_pid_lib`, kept out of the guest on purpose.
//!
//! The guest ELF (and with it the Groth16 verification key pinned by `Sp1PidVerifier`) is a
//! function of everything compiled into `nachweis-pid-lib`, including unreferenced host helpers
//! and the `file:line` of every panic site. Host-only logic therefore lives here, so the shared
//! statement library stays byte-identical to the deployed program.
//!
//! [`check_kb_freshness`] supersedes `nachweis_pid_lib::check_kb_freshness`, whose rule (KB-JWT
//! `exp` required) predates the official German test wallet: that wallet signs KB-JWTs with
//! `aud`, `iat`, `nonce` and `sd_hash` only (G0 run, 2026-09-08). Host and bridge call this one.
pub use nachweis_pid_lib::Verified;

pub mod synth;

/// KB-JWT freshness against the caller's clock (the guest has no clock). Requires `iat` in
/// `[now - window, now + window]`. `exp` is optional: when present it must lie in
/// `(now, now + window]`; when absent, freshness rests on `iat` alone. `window` is in seconds
/// (the bridge default is 600). The committed public values do not depend on either claim.
pub fn check_kb_freshness(v: &Verified, now: u64, window: u64) -> Result<(), String> {
    let iat = v.kb_iat.ok_or_else(|| String::from("KB-JWT has no iat"))?;
    if let Some(exp) = v.kb_exp {
        if exp <= now {
            return Err(format!("KB-JWT expired: exp {exp} <= now {now}"));
        }
        if exp > now.saturating_add(window) {
            return Err(format!("KB-JWT exp {exp} is more than {window} s ahead of now {now}"));
        }
    }
    if iat.saturating_add(window) < now {
        return Err(format!("KB-JWT iat {iat} is more than {window} s before now {now}"));
    }
    if iat > now.saturating_add(window) {
        return Err(format!("KB-JWT iat {iat} is more than {window} s ahead of now {now}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::synth::{mint, SynthOptions, DEFAULT_ISSUER_HEADER};
    use alloy_sol_types::SolType;
    use nachweis_pid_lib::{nonce_string, prove_statement, prove_statement_with_facts, verify_presentation, PublicValuesStruct};

    const NOW: u64 = 1_788_900_000;

    fn facts(kb_exp: Option<u64>, kb_iat: Option<u64>) -> Verified {
        Verified { over18: true, expiry: NOW + 86_400, kb_exp, kb_iat, kb_nonce: String::new() }
    }

    #[test]
    fn freshness_without_exp_rests_on_iat() {
        assert_eq!(check_kb_freshness(&facts(None, Some(NOW)), NOW, 600), Ok(()));
        assert_eq!(check_kb_freshness(&facts(None, Some(NOW - 600)), NOW, 600), Ok(()));
        assert_eq!(check_kb_freshness(&facts(None, Some(NOW + 600)), NOW, 600), Ok(()));
        let err = check_kb_freshness(&facts(None, Some(NOW - 601)), NOW, 600).unwrap_err();
        assert!(err.contains("is more than 600 s before now"), "{err}");
        let err = check_kb_freshness(&facts(None, Some(NOW + 601)), NOW, 600).unwrap_err();
        assert!(err.contains("is more than 600 s ahead of now"), "{err}");
    }

    #[test]
    fn freshness_requires_iat() {
        let err = check_kb_freshness(&facts(None, None), NOW, 600).unwrap_err();
        assert_eq!(err, "KB-JWT has no iat");
        let err = check_kb_freshness(&facts(Some(NOW + 300), None), NOW, 600).unwrap_err();
        assert_eq!(err, "KB-JWT has no iat");
    }

    #[test]
    fn freshness_with_exp_keeps_the_exp_rule() {
        assert_eq!(check_kb_freshness(&facts(Some(NOW + 300), Some(NOW)), NOW, 600), Ok(()));
        let err = check_kb_freshness(&facts(Some(NOW), Some(NOW - 300)), NOW, 600).unwrap_err();
        assert!(err.starts_with("KB-JWT expired"), "{err}");
        let err = check_kb_freshness(&facts(Some(NOW + 601), Some(NOW)), NOW, 600).unwrap_err();
        assert!(err.contains("exp") && err.contains("ahead of now"), "{err}");
    }

    /// The frozen guest-side rule still demands exp; this crate's rule is the one the host and
    /// the bridge apply.
    #[test]
    fn guest_library_rule_still_requires_exp_and_is_superseded() {
        let err = nachweis_pid_lib::check_kb_freshness(&facts(None, Some(NOW)), NOW, 600).unwrap_err();
        assert_eq!(err, "KB-JWT has no exp");
        assert_eq!(check_kb_freshness(&facts(None, Some(NOW)), NOW, 600), Ok(()));
    }

    #[test]
    fn synthetic_presentation_without_kb_exp_verifies() {
        let input = mint(&SynthOptions::at(NOW));
        let v = verify_presentation(&input.presentation, &input.issuer_key_sec1, &input.expected_vct, &input.expected_aud);
        assert!(v.over18);
        assert_eq!(v.expiry, NOW + 365 * 86_400);
        assert_eq!(v.kb_exp, None);
        assert_eq!(v.kb_iat, Some(NOW));
        assert_eq!(v.kb_nonce, nonce_string(&input.bound_address, &input.challenge));
        assert_eq!(check_kb_freshness(&v, NOW + 60, 600), Ok(()));
    }

    #[test]
    fn public_values_commit_the_issuer_exp_with_or_without_kb_exp() {
        let without = mint(&SynthOptions::at(NOW));
        let with = mint(&SynthOptions { kb_exp: Some(NOW + 300), ..SynthOptions::at(NOW) });
        let (pv_without, f_without) = prove_statement_with_facts(&without);
        let (pv_with, f_with) = prove_statement_with_facts(&with);
        assert_eq!(f_without.kb_exp, None);
        assert_eq!(f_with.kb_exp, Some(NOW + 300));
        assert_eq!(pv_without.expiry, NOW + 365 * 86_400);
        assert_eq!(pv_with.expiry, pv_without.expiry);
        assert_eq!(pv_with.over18, 1);
        assert_eq!(pv_with.nonce, pv_without.nonce);
        assert_eq!(pv_with.subject, pv_without.subject);
        assert_eq!(PublicValuesStruct::abi_encode(&pv_with), PublicValuesStruct::abi_encode(&pv_without));
    }

    #[test]
    fn over18_false_is_committed_as_zero() {
        let input = mint(&SynthOptions { over18: false, ..SynthOptions::at(NOW) });
        assert_eq!(prove_statement(&input).over18, 0);
    }

    /// The official German test wallet's issuer header: x5c first, then kid, typ, alg, about
    /// 1033 decoded bytes with one 824-character certificate (G0 2026-09-08). The parser reads
    /// the header as a JSON object, so key order and header size do not matter.
    #[test]
    fn issuer_header_with_x5c_first_and_alg_last_verifies() {
        let cert = "M".repeat(824);
        let kid = "k".repeat(156);
        let header = format!(r#"{{"x5c":["{cert}"],"kid":"{kid}","typ":"dc+sd-jwt","alg":"ES256"}}"#);
        assert_eq!(header.len(), 1033, "header layout matches the observed size");
        assert!(header.find("\"alg\"").unwrap() > 96, "alg is outside the first 96 bytes");
        let input = mint(&SynthOptions { issuer_header: header, ..SynthOptions::at(NOW) });
        let v = verify_presentation(&input.presentation, &input.issuer_key_sec1, &input.expected_vct, &input.expected_aud);
        assert!(v.over18);
        let minimal = mint(&SynthOptions { issuer_header: DEFAULT_ISSUER_HEADER.to_string(), ..SynthOptions::at(NOW) });
        assert_eq!(prove_statement(&input).expiry, prove_statement(&minimal).expiry);
    }

    #[test]
    #[should_panic(expected = "alg must be ES256")]
    fn issuer_header_with_other_alg_is_rejected() {
        let input = mint(&SynthOptions { issuer_header: r#"{"typ":"dc+sd-jwt","alg":"ES384"}"#.to_string(), ..SynthOptions::at(NOW) });
        verify_presentation(&input.presentation, &input.issuer_key_sec1, &input.expected_vct, &input.expected_aud);
    }
}
