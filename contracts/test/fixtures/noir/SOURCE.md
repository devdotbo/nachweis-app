# Noir proof fixture (pid-sdjwt, evm target)

Copied unchanged from `circuits/pid-sdjwt/out/adapted/` after running the commands in
`/circuits/README.md` (nargo 1.0.0-beta.21, bb 5.0.0-nightly.20260324) on the minted PID vector
`prover-sp1/fixtures/input.json`:

    cd circuits/pid-sdjwt
    nargo compile
    bun run ../tools/gen-prover.ts ../../prover-sp1/fixtures/input.json
    nargo execute pid_witness
    bb write_vk -b target/pid_sdjwt.json -o out/adapted -t evm
    bb prove -b target/pid_sdjwt.json -w target/pid_witness.gz -k out/adapted/vk -o out/adapted -t evm
    cp out/adapted/proof         ../../contracts/test/fixtures/noir/proof.bin
    cp out/adapted/public_inputs ../../contracts/test/fixtures/noir/public_inputs.bin
    cp out/adapted/vk_hash       ../../contracts/test/fixtures/noir/vk_hash.bin

| file | bytes | sha256 |
| --- | --- | --- |
| proof.bin | 10,304 | ff6ce14bb72d23a03bc4a5884c95d84a29b912bd7a49b02dcf6d651ea56e726b |
| public_inputs.bin | 2,752 (86 x 32) | f5daf701b996dc75d5a67378d9c1874228f7872971961c571e4cd9cf0aeaf100 |
| vk_hash.bin | 32 | b6b2f964c0917099314db5c847d50726fe2ca469f370054e48d2e307031cd095 |

`vk_hash.bin` must equal the `VK_HASH` constant in `contracts/src/noir/PidSdJwtUltraHonkVerifier.sol`
(0x088cdfce...1e47); the test asserts this. Decoded public inputs: subject
0xcf02ad5376095e285fc88ae8c1fa240791370c17, issuer_key_hash
0x841e741b14eacdfdeca2e96fd95af5b987b5b872f88f8e359df29f7635556656, over18 1, expiry 1780435560
(2026-06-02), nonce 0xe6de79975a3b30ad89d7af4e44fcdba843df4b70d4b3307e687e5498bbe0a25d. Any change to
the circuit changes the VK and invalidates all three files together with the generated verifier.
