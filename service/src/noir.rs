//! Client-side Noir proofs (circuits/pid-sdjwt, proved on the holder's device by the companion):
//! decoding of the 86 public input field elements and the NoirPidVerifier proof argument.
//!
//! Layout (contracts/src/noir/NoirPidVerifier.sol): [0..20) subject, [20..52) issuer_key_hash,
//! [52] over18, [53] expiry (u64), [54..86) nonce; one byte per field element except expiry.
use alloy::primitives::{Address, Bytes, B256, U256};
use alloy::sol_types::SolValue;
use anyhow::{anyhow, Result};
use serde::Deserialize;

pub const HONK_PUBLIC_INPUTS_LENGTH: usize = 86;
const SUBJECT_OFFSET: usize = 0;
const ISSUER_KEY_HASH_OFFSET: usize = 20;
const OVER18_INDEX: usize = 52;
const EXPIRY_INDEX: usize = 53;
const NONCE_OFFSET: usize = 54;

/// `POST /sessions/:id/noir-proof` body. Hex strings, `0x` optional.
#[derive(Debug, Deserialize)]
pub struct NoirProofBody {
    /// bb `proof` file (evm target), 10,304 bytes for this circuit.
    pub proof_hex: String,
    /// bb `public_inputs` split into 86 field elements of 32 bytes.
    pub public_inputs_hex: Vec<String>,
    #[serde(default)]
    pub tier: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoirPublicValues {
    pub subject: Address,
    pub issuer_key_hash: B256,
    pub over18: u8,
    pub expiry: u64,
    pub nonce: B256,
}

pub fn parse_hex(s: &str, what: &str) -> Result<Vec<u8>> {
    hex::decode(s.trim().trim_start_matches("0x")).map_err(|e| anyhow!("{what}: {e}"))
}

pub fn parse_public_inputs(words: &[String]) -> Result<Vec<B256>> {
    if words.len() != HONK_PUBLIC_INPUTS_LENGTH {
        return Err(anyhow!("public_inputs_hex has {} elements, expected {HONK_PUBLIC_INPUTS_LENGTH}", words.len()));
    }
    words
        .iter()
        .enumerate()
        .map(|(i, w)| {
            let b = parse_hex(w, &format!("public_inputs_hex[{i}]"))?;
            if b.len() != 32 {
                return Err(anyhow!("public_inputs_hex[{i}] is {} bytes, expected 32", b.len()));
            }
            Ok(B256::from_slice(&b))
        })
        .collect()
}

fn byte_at(words: &[B256], i: usize) -> Result<u8> {
    let w = words[i];
    if w[..31].iter().any(|b| *b != 0) {
        return Err(anyhow!("public input {i} is not a byte"));
    }
    Ok(w[31])
}

fn pack(words: &[B256], offset: usize, n: usize) -> Result<Vec<u8>> {
    (offset..offset + n).map(|i| byte_at(words, i)).collect()
}

/// Same decoding as `NoirPidVerifier.decodeProof`; errors where the contract would revert.
pub fn decode_public_inputs(words: &[B256]) -> Result<NoirPublicValues> {
    if words.len() != HONK_PUBLIC_INPUTS_LENGTH {
        return Err(anyhow!("expected {HONK_PUBLIC_INPUTS_LENGTH} public inputs, got {}", words.len()));
    }
    let expiry_word = words[EXPIRY_INDEX];
    if expiry_word[..24].iter().any(|b| *b != 0) {
        return Err(anyhow!("expiry public input exceeds u64"));
    }
    Ok(NoirPublicValues {
        subject: Address::from_slice(&pack(words, SUBJECT_OFFSET, 20)?),
        issuer_key_hash: B256::from_slice(&pack(words, ISSUER_KEY_HASH_OFFSET, 32)?),
        over18: byte_at(words, OVER18_INDEX)?,
        expiry: u64::from_be_bytes(expiry_word[24..].try_into().unwrap()),
        nonce: B256::from_slice(&pack(words, NONCE_OFFSET, 32)?),
    })
}

/// The proof argument NoirPidVerifier decodes: abi.encode(bytes honkProof, bytes32[] honkPublicInputs).
pub fn encode_proof_arg(proof: &[u8], public_inputs: &[B256]) -> Bytes {
    let pr = Bytes::copy_from_slice(proof);
    Bytes::from((pr, public_inputs.to_vec()).abi_encode_params())
}

/// Concatenation of the 86 words, kept as the session's `public_values` bytes.
pub fn public_inputs_bytes(words: &[B256]) -> Vec<u8> {
    words.iter().flat_map(|w| w.0).collect()
}

pub fn bits_of(pv: &NoirPublicValues) -> U256 {
    crate::chain::decision_bits(pv.over18 == 1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture_words() -> Vec<B256> {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../contracts/test/fixtures/noir/public_inputs.bin");
        let raw = std::fs::read(p).expect("contracts/test/fixtures/noir/public_inputs.bin");
        raw.chunks(32).map(B256::from_slice).collect()
    }

    #[test]
    fn decodes_the_contract_fixture() {
        let pv = decode_public_inputs(&fixture_words()).unwrap();
        assert_eq!(pv.subject, "0xf99edde971f4e9c88715a79ca78963284a2955dc".parse::<Address>().unwrap());
        assert_eq!(
            pv.issuer_key_hash,
            "0xb52359580c14e2d79d34605740d86338adc6a0868a22ec648d1896187813fd26".parse::<B256>().unwrap()
        );
        assert_eq!(pv.over18, 1);
        assert_eq!(pv.expiry, 1819756800);
        assert_eq!(pv.nonce, "0x306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762".parse::<B256>().unwrap());
        assert_eq!(bits_of(&pv), U256::from(3));
    }

    #[test]
    fn rejects_non_byte_fields_and_wrong_counts() {
        let mut words = fixture_words();
        words[3] = B256::from(U256::from(256));
        assert!(decode_public_inputs(&words).unwrap_err().to_string().contains("not a byte"));
        assert!(decode_public_inputs(&fixture_words()[..85]).is_err());
        let hexes: Vec<String> = fixture_words().iter().map(|w| format!("{w}")).collect();
        assert_eq!(parse_public_inputs(&hexes).unwrap(), fixture_words());
        assert!(parse_public_inputs(&hexes[..10]).is_err());
    }

    #[test]
    fn proof_arg_is_abi_encode_of_bytes_and_bytes32_array() {
        let words = fixture_words();
        let enc = encode_proof_arg(&[0xaa; 10], &words);
        let (proof, inputs) = <(Bytes, Vec<B256>)>::abi_decode_params(&enc).unwrap();
        assert_eq!(proof.as_ref(), &[0xaa; 10]);
        assert_eq!(inputs, words);
        assert_eq!(U256::from_be_slice(&enc[0..32]), U256::from(0x40));
    }
}
