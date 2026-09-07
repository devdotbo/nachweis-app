//! nachweis-bridge: verified EUDI presentation -> SP1 proof -> AttestationRegistry.
pub mod api;
pub mod chain;
pub mod config;
pub mod noir;
pub mod prover;
pub mod session;
pub mod statement;
pub mod verifier;

pub use api::{router, AppState};
pub use config::Config;
