use anyhow::Result;
use nachweis_bridge::chain::Chain;
use nachweis_bridge::{router, AppState, Config};
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();
    // The statement library reports failures by panicking; the bridge catches those and turns them
    // into error text, so the default hook's stderr dump is replaced by one log line.
    std::panic::set_hook(Box::new(|info| {
        let msg = info.payload().downcast_ref::<String>().cloned()
            .or_else(|| info.payload().downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_default();
        tracing::warn!(location = %info.location().map(|l| l.to_string()).unwrap_or_default(), "panic: {msg}");
    }));
    let cfg = Config::from_env()?;
    let chain = match (&cfg.rpc_url, &cfg.operator_private_key, cfg.registry) {
        (Some(rpc), Some(key), Some(registry)) => {
            let c = Chain::connect(rpc, key, registry).await?;
            tracing::info!(registry = %registry, operator = %c.operator, "chain client ready");
            Some(c)
        }
        _ => {
            tracing::warn!("RPC_URL, OPERATOR_PRIVATE_KEY or REGISTRY unset: attest and revoke endpoints disabled");
            None
        }
    };
    tracing::info!(
        proof_mode = cfg.proof_mode.as_str(),
        mode = if cfg.verifier_url.is_some() { "verifier" } else { "local" },
        policy_id = %cfg.policy_id,
        artifacts = %cfg.prover_artifacts.display(),
        "nachweis-bridge starting"
    );
    let bind = cfg.bind;
    let state = Arc::new(AppState::new(cfg, chain));
    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!(%bind, "listening");
    axum::serve(listener, router(state)).await?;
    Ok(())
}
