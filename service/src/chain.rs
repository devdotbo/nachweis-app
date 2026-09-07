//! Ethereum side: AttestationRegistry binding, calldata construction, sending with the operator key.
use crate::session::AttestedEvent;
use alloy::network::{EthereumWallet, TransactionBuilder};
use alloy::primitives::{keccak256, Address, Bytes, B256, U256};
use alloy::providers::{DynProvider, Provider, ProviderBuilder};
use alloy::rpc::types::{TransactionReceipt, TransactionRequest};
use alloy::signers::local::PrivateKeySigner;
use alloy::sol;
use alloy::sol_types::{SolEvent, SolValue};
use anyhow::{anyhow, Context, Result};
use uuid::Uuid;

sol! {
    #[sol(rpc)]
    contract AttestationRegistry {
        struct Decision {
            bytes32 policyId;
            uint256 bits;
            uint8 tier;
            uint64 expiry;
            bytes32 statusRef;
            bool revoked;
        }
        event Attested(address indexed subject, bytes32 indexed policyId, uint256 bits, uint8 tier, uint64 expiry, bytes32 statusRef, address indexed attester);
        event Revoked(address indexed subject, bytes32 indexed policyId, address indexed operator);
        function setOperator(bytes32 policyId, address operator, bool enabled) external;
        function setVerifier(bytes32 policyId, address verifier) external;
        function attestByOperator(address subject, Decision calldata decision) external;
        function revoke(address subject, bytes32 policyId) external;
        function attestWithProof(address subject, Decision calldata decision, bytes calldata proof, bytes32[] calldata publicInputs) external;
        function isEligible(address subject, bytes32 policyId, uint256 requiredBits) external view returns (bool);
        function decisionOf(address subject, bytes32 policyId) external view returns (Decision memory);
    }
}

pub use AttestationRegistry::Decision;

/// Predicate bits as the SP1 adapter (branch wp2b-sp1-verifier) derives them from the public values.
pub const BIT_IDENTITY: u64 = 1;
pub const BIT_OVER18: u64 = 2;

/// bits = identity evidence | over-18 (when the proof says so).
pub fn decision_bits(over18: bool) -> U256 {
    U256::from(BIT_IDENTITY | if over18 { BIT_OVER18 } else { 0 })
}

/// The proof argument for attestWithProof as the SP1 adapter decodes it:
/// abi.encode(bytes publicValues, bytes sp1ProofBytes). Keep this the single place to adjust.
pub fn encode_proof_arg(public_values: &[u8], sp1_proof: &[u8]) -> Bytes {
    let pv = Bytes::copy_from_slice(public_values);
    let pr = Bytes::copy_from_slice(sp1_proof);
    Bytes::from((pv, pr).abi_encode_params())
}

/// publicInputs[4] = [subject, policyId, bits, expiry], each as bytes32.
pub fn public_inputs(subject: Address, policy_id: B256, bits: U256, expiry: u64) -> Vec<B256> {
    vec![
        B256::left_padding_from(subject.as_slice()),
        policy_id,
        B256::from(bits),
        B256::from(U256::from(expiry)),
    ]
}

/// statusRef = keccak256 of the session id (hyphenated UUID string).
pub fn status_ref(session_id: Uuid) -> B256 {
    keccak256(session_id.to_string().as_bytes())
}

pub fn decision(policy_id: B256, bits: U256, tier: u8, expiry: u64, session_id: Uuid) -> Decision {
    Decision { policyId: policy_id, bits, tier, expiry, statusRef: status_ref(session_id), revoked: false }
}

#[derive(Clone)]
pub struct Chain {
    pub provider: DynProvider,
    pub registry: Address,
    pub operator: Address,
}

fn decode_attested(receipt: &TransactionReceipt) -> Option<AttestedEvent> {
    receipt.logs().iter().find_map(|log| {
        let ev = AttestationRegistry::Attested::decode_log(&log.inner).ok()?;
        Some(AttestedEvent {
            subject: ev.subject,
            policy_id: ev.policyId,
            bits: format!("0x{:x}", ev.bits),
            tier: ev.tier,
            expiry: ev.expiry,
            status_ref: ev.statusRef,
            attester: ev.attester,
        })
    })
}

fn check_receipt(receipt: &TransactionReceipt) -> Result<()> {
    if receipt.status() {
        Ok(())
    } else {
        Err(anyhow!("transaction {} reverted", receipt.transaction_hash))
    }
}

impl Chain {
    /// Connect with a signing key. `registry` may be zero when only deploying (tests).
    pub async fn connect(rpc_url: &str, private_key: &str, registry: Address) -> Result<Self> {
        let signer: PrivateKeySigner = private_key.trim().parse().context("OPERATOR_PRIVATE_KEY")?;
        let operator = signer.address();
        let url = rpc_url.parse().context("RPC_URL")?;
        let provider = ProviderBuilder::new().wallet(EthereumWallet::from(signer)).connect_http(url).erased();
        Ok(Self { provider, registry, operator })
    }

    fn contract(&self) -> AttestationRegistry::AttestationRegistryInstance<DynProvider> {
        AttestationRegistry::new(self.registry, self.provider.clone())
    }

    pub async fn attest_with_proof(
        &self,
        subject: Address,
        decision: Decision,
        proof: Bytes,
        inputs: Vec<B256>,
    ) -> Result<(B256, AttestedEvent)> {
        let receipt = self
            .contract()
            .attestWithProof(subject, decision, proof, inputs)
            .send()
            .await
            .map_err(|e| anyhow!("attestWithProof send: {e}"))?
            .get_receipt()
            .await
            .context("attestWithProof receipt")?;
        check_receipt(&receipt)?;
        let ev = decode_attested(&receipt).ok_or_else(|| anyhow!("no Attested event in receipt"))?;
        Ok((receipt.transaction_hash, ev))
    }

    pub async fn attest_by_operator(&self, subject: Address, decision: Decision) -> Result<(B256, AttestedEvent)> {
        let receipt = self
            .contract()
            .attestByOperator(subject, decision)
            .send()
            .await
            .map_err(|e| anyhow!("attestByOperator send: {e}"))?
            .get_receipt()
            .await
            .context("attestByOperator receipt")?;
        check_receipt(&receipt)?;
        let ev = decode_attested(&receipt).ok_or_else(|| anyhow!("no Attested event in receipt"))?;
        Ok((receipt.transaction_hash, ev))
    }

    pub async fn revoke(&self, subject: Address, policy_id: B256) -> Result<B256> {
        let receipt = self
            .contract()
            .revoke(subject, policy_id)
            .send()
            .await
            .map_err(|e| anyhow!("revoke send: {e}"))?
            .get_receipt()
            .await
            .context("revoke receipt")?;
        check_receipt(&receipt)?;
        Ok(receipt.transaction_hash)
    }

    pub async fn is_eligible(&self, subject: Address, policy_id: B256, required_bits: U256) -> Result<bool> {
        self.contract()
            .isEligible(subject, policy_id, required_bits)
            .call()
            .await
            .map_err(|e| anyhow!("isEligible: {e}"))
    }

    pub async fn decision_of(&self, subject: Address, policy_id: B256) -> Result<Decision> {
        self.contract().decisionOf(subject, policy_id).call().await.map_err(|e| anyhow!("decisionOf: {e}"))
    }

    // ----- owner helpers, used by the anvil integration test and local setup -----

    pub async fn set_operator(&self, policy_id: B256, operator: Address, enabled: bool) -> Result<B256> {
        let receipt = self
            .contract()
            .setOperator(policy_id, operator, enabled)
            .send()
            .await
            .map_err(|e| anyhow!("setOperator send: {e}"))?
            .get_receipt()
            .await?;
        check_receipt(&receipt)?;
        Ok(receipt.transaction_hash)
    }

    pub async fn set_verifier(&self, policy_id: B256, verifier: Address) -> Result<B256> {
        let receipt = self
            .contract()
            .setVerifier(policy_id, verifier)
            .send()
            .await
            .map_err(|e| anyhow!("setVerifier send: {e}"))?
            .get_receipt()
            .await?;
        check_receipt(&receipt)?;
        Ok(receipt.transaction_hash)
    }

    /// Deploy creation bytecode with ABI-encoded constructor args appended.
    pub async fn deploy(&self, creation_code: &[u8], ctor_args: &[u8]) -> Result<Address> {
        let mut code = creation_code.to_vec();
        code.extend_from_slice(ctor_args);
        let tx = TransactionRequest::default().with_deploy_code(code);
        let receipt = self
            .provider
            .send_transaction(tx)
            .await
            .map_err(|e| anyhow!("deploy send: {e}"))?
            .get_receipt()
            .await?;
        check_receipt(&receipt)?;
        receipt.contract_address.ok_or_else(|| anyhow!("deploy receipt has no contract address"))
    }
}

/// Creation bytecode from a forge artifact JSON (`bytecode.object`).
pub fn creation_code_from_artifact(json: &str) -> Result<Vec<u8>> {
    let v: serde_json::Value = serde_json::from_str(json).context("artifact json")?;
    let obj = v["bytecode"]["object"].as_str().ok_or_else(|| anyhow!("artifact has no bytecode.object"))?;
    hex::decode(obj.trim_start_matches("0x")).context("artifact bytecode hex")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proof_arg_is_abi_encode_of_two_bytes() {
        let pv = vec![0xaa; 192];
        let pr = vec![0xbb; 356];
        let enc = encode_proof_arg(&pv, &pr);
        // abi.encode(bytes, bytes): word 0 = offset of first bytes (0x40), word 1 = offset of second.
        assert_eq!(U256::from_be_slice(&enc[0..32]), U256::from(0x40));
        let second_off = U256::from_be_slice(&enc[32..64]).to::<usize>();
        assert_eq!(U256::from_be_slice(&enc[64..96]), U256::from(192));
        assert_eq!(&enc[96..96 + 192], &pv[..]);
        assert_eq!(U256::from_be_slice(&enc[second_off..second_off + 32]), U256::from(356));
        let (a, b) = <(Bytes, Bytes)>::abi_decode_params(&enc).unwrap();
        assert_eq!(a.as_ref(), &pv[..]);
        assert_eq!(b.as_ref(), &pr[..]);
    }

    #[test]
    fn public_inputs_layout() {
        let subject: Address = "0xcf02ad5376095e285fc88ae8c1fa240791370c17".parse().unwrap();
        let pid = B256::repeat_byte(7);
        let inputs = public_inputs(subject, pid, decision_bits(true), 1780435560);
        assert_eq!(inputs.len(), 4);
        assert_eq!(&inputs[0][12..], subject.as_slice());
        assert_eq!(inputs[1], pid);
        assert_eq!(inputs[2], B256::from(U256::from(3)));
        assert_eq!(inputs[3], B256::from(U256::from(1780435560u64)));
        assert_eq!(decision_bits(false), U256::from(1));
    }
}
