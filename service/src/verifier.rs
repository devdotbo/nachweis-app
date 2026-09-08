//! Client for the EUDI verifier-service in its verifier mode (`docs/bridge-mode.md` there).
//!
//!   POST {VERIFIER_URL}/request  {"nonce": "<hex>"}  -> {"session", "authorization_request", "request_uri"}
//!   GET  {VERIFIER_URL}/result/:id                   -> {"status": "pending"|"verified"|"rejected", "presentation"?, "reason"?}
//!
//! The verifier serves `presentation` only with `RESULT_INCLUDES_PRESENTATION=true` and only to a
//! caller that presents its `RESULT_TOKEN` as `X-Result-Token`; this client sends
//! `VERIFIER_RESULT_TOKEN` on every `GET /result/:id`. The presentation carries the disclosed names,
//! so this transfer is the plaintext boundary of the SP1 route: verifier and bridge see them, the
//! chain does not.
use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

/// Header the verifier reads the shared secret from.
pub const RESULT_TOKEN_HEADER: &str = "X-Result-Token";

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
    /// Sent as `X-Result-Token` on `GET /result/:id`; `None` sends no header.
    result_token: Option<String>,
    http: reqwest::Client,
}

impl VerifierClient {
    /// A client that reads the result token from `VERIFIER_RESULT_TOKEN` itself, so the existing
    /// call site (`api.rs`, `cfg.verifier_url.as_deref().map(VerifierClient::new)`) needs no change.
    /// `Config::verifier_result_token` carries the same value; prefer `with_token` where a `Config`
    /// is at hand.
    pub fn new(base: &str) -> Self {
        let token = std::env::var("VERIFIER_RESULT_TOKEN").ok().filter(|t| !t.trim().is_empty());
        Self::with_token(base, token)
    }

    pub fn with_token(base: &str, result_token: Option<String>) -> Self {
        Self {
            base: base.trim_end_matches('/').to_string(),
            result_token: result_token.filter(|t| !t.trim().is_empty()),
            http: reqwest::Client::new(),
        }
    }

    pub fn has_result_token(&self) -> bool {
        self.result_token.is_some()
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

    /// Ok(Some(presentation)) once verified, Ok(None) while pending, Err on rejection and on a
    /// token or configuration problem on the verifier side (401, 503), named so the operator can
    /// fix the environment rather than wait for the poll to time out.
    pub async fn fetch_result(&self, session: &str) -> Result<Option<String>> {
        let mut req = self.http.get(format!("{}/result/{}", self.base, session));
        if let Some(token) = self.result_token.as_deref() {
            req = req.header(RESULT_TOKEN_HEADER, token);
        }
        let resp = req.send().await.context("verifier GET /result")?;
        match resp.status() {
            reqwest::StatusCode::NOT_FOUND => return Ok(None),
            reqwest::StatusCode::UNAUTHORIZED => {
                return Err(anyhow!(
                    "verifier GET /result returned 401: {} {}; set VERIFIER_RESULT_TOKEN to the verifier's RESULT_TOKEN",
                    RESULT_TOKEN_HEADER,
                    if self.result_token.is_some() { "does not match" } else { "was not sent" }
                ));
            }
            reqwest::StatusCode::SERVICE_UNAVAILABLE => {
                return Err(anyhow!(
                    "verifier GET /result returned 503: the verifier has RESULT_INCLUDES_PRESENTATION on but no RESULT_TOKEN; set RESULT_TOKEN there and VERIFIER_RESULT_TOKEN here"
                ));
            }
            status if !status.is_success() => return Err(anyhow!("verifier GET /result returned {status}")),
            _ => {}
        }
        let r: VerifierResult = resp.json().await.context("verifier GET /result body")?;
        match r.status.as_str() {
            "verified" => r.presentation.map(Some).ok_or_else(|| {
                anyhow!("verifier result is verified but carries no presentation: the verifier needs RESULT_INCLUDES_PRESENTATION=true (plus RESULT_TOKEN) for verifier mode")
            }),
            "rejected" => Err(anyhow!("verifier rejected the presentation: {}", r.reason.unwrap_or_default())),
            _ => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn with_token_keeps_a_non_empty_token_and_drops_an_empty_one() {
        assert!(VerifierClient::with_token("http://127.0.0.1:8080/", Some("s".into())).has_result_token());
        assert!(!VerifierClient::with_token("http://127.0.0.1:8080", Some("  ".into())).has_result_token());
        assert!(!VerifierClient::with_token("http://127.0.0.1:8080", None).has_result_token());
    }

    #[tokio::test]
    async fn the_token_travels_as_x_result_token_and_401_and_503_are_named() {
        use axum::{extract::State, http::HeaderMap, routing::get, Router};
        use std::sync::{Arc, Mutex};

        let seen: Arc<Mutex<Vec<Option<String>>>> = Arc::new(Mutex::new(Vec::new()));
        let app = Router::new()
            .route(
                "/result/:id",
                get(|State(seen): State<Arc<Mutex<Vec<Option<String>>>>>, headers: HeaderMap| async move {
                    let token = headers.get("x-result-token").and_then(|v| v.to_str().ok()).map(str::to_string);
                    seen.lock().unwrap().push(token.clone());
                    match token.as_deref() {
                        Some("secret") => (axum::http::StatusCode::OK, r#"{"status":"verified","presentation":"a~b~c"}"#),
                        Some("unset") => (axum::http::StatusCode::SERVICE_UNAVAILABLE, r#"{"error":"RESULT_TOKEN is not set"}"#),
                        _ => (axum::http::StatusCode::UNAUTHORIZED, r#"{"error":"X-Result-Token header missing"}"#),
                    }
                }),
            )
            .with_state(seen.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

        let ok = VerifierClient::with_token(&base, Some("secret".into())).fetch_result("s").await.unwrap();
        assert_eq!(ok.as_deref(), Some("a~b~c"));

        let err = VerifierClient::with_token(&base, None).fetch_result("s").await.unwrap_err().to_string();
        assert!(err.contains("401") && err.contains("VERIFIER_RESULT_TOKEN"), "{err}");

        let err = VerifierClient::with_token(&base, Some("wrong".into())).fetch_result("s").await.unwrap_err().to_string();
        assert!(err.contains("401") && err.contains("does not match"), "{err}");

        let err = VerifierClient::with_token(&base, Some("unset".into())).fetch_result("s").await.unwrap_err().to_string();
        assert!(err.contains("503") && err.contains("RESULT_TOKEN"), "{err}");

        assert_eq!(
            seen.lock().unwrap().clone(),
            vec![Some("secret".into()), None, Some("wrong".into()), Some("unset".into())]
        );
    }
}
