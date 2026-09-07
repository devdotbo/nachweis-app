//! SP1 guest: verify an SD-JWT PID presentation with key binding and commit
//! only hashes, the over-18 bit, the bound address, expiry and nonce.
#![no_main]
sp1_zkvm::entrypoint!(main);

use alloy_sol_types::SolType;
use nachweis_pid_lib::{prove_statement, GuestInput, PublicValuesStruct};

pub fn main() {
    let input = sp1_zkvm::io::read::<GuestInput>();
    let pv = prove_statement(&input);
    let bytes = PublicValuesStruct::abi_encode(&pv);
    sp1_zkvm::io::commit_slice(&bytes);
}
