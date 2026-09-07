use sp1_sdk::{blocking::{Prover, ProverClient}, include_elf, Elf, HashableKey, ProvingKey};

const ELF: Elf = include_elf!("nachweis-pid-program");

fn main() {
    let client = ProverClient::builder().cpu().build();
    let pk = client.setup(ELF).expect("setup");
    println!("{}", pk.verifying_key().bytes32());
}
