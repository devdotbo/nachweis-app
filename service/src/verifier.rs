//! Client for the EUDI verifier-service.
//!
//! The verifier as of today exposes no JSON endpoint that (a) accepts a caller-supplied nonce or
//! (b) returns the raw presentation for a session (it stores only the parsed `VerifiedPid`).
//! This client targets the two small additions documented in README.md:
//!   POST {VERIFIER_URL}/request  {"nonce": "<hex>"}  -> {"session", "authorization_request", "request_uri"}
//!   GET  {VERIFIER_URL}/result/:id                   -> {"status": "pending"|"verified"|"rejected", "presentation"?, "reason"?}
use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct CreatedRequest {
    pub session: String,
    pub authorization_request: String,
    #[serde(default)]
    pub request_uri: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VerifierResult {
    pub status: String,
    #[serde(default)]
    pub presentation: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Clone)]
pub struct VerifierClient {
    base: String,
    http: reqwest::Client,
}

impl VerifierClient {
    pub fn new(base: &str) -> Self {
        Self { base: base.trim_end_matches('/').to_string(), http: reqwest::Client::new() }
    }

    pub async fn create_request(&self, nonce_hex: &str) -> Result<CreatedRequest> {
        let resp = self
            .http
            .post(format!("{}/request", self.base))
            .json(&serde_json::json!({ "nonce": nonce_hex }))
            .send()
            .await
            .context("verifier POST /request")?;
        if !resp.status().is_success() {
            return Err(anyhow!("verifier POST /request returned {}", resp.status()));
        }
        resp.json().await.context("verifier POST /request body")
    }

    /// Ok(Some(presentation)) once verified, Ok(None) while pending, Err on rejection.
    pub async fn fetch_result(&self, session: &str) -> Result<Option<String>> {
        let resp = self.http.get(format!("{}/result/{}", self.base, session)).send().await.context("verifier GET /result")?;
        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !resp.status().is_success() {
            return Err(anyhow!("verifier GET /result returned {}", resp.status()));
        }
        let r: VerifierResult = resp.json().await.context("verifier GET /result body")?;
        match r.status.as_str() {
            "verified" => r.presentation.map(Some).ok_or_else(|| anyhow!("verifier result is verified but carries no presentation")),
            "rejected" => Err(anyhow!("verifier rejected the presentation: {}", r.reason.unwrap_or_default())),
            _ => Ok(None),
        }
    }
}
