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
| proof.bin | 10,304 | 413f7f15199afacdf300f87f340e5bac262e132de6d07a14af85c6322676d3ff |
| public_inputs.bin | 2,752 (86 x 32) | 9101bff93b853218615932f8de311b9e3a878a62d374eec28b429663f706b805 |
| vk_hash.bin | 32 | c0d55f4d9db7450193c148e65ab8e71e8ba8685ee558e1462c592d0f300e5018 |

`vk_hash.bin` must equal the `VK_HASH` constant in `contracts/src/noir/PidSdJwtUltraHonkVerifier.sol`
(0x096a8d35...ee14); the test asserts this. Decoded public inputs: subject
0xf99edde971f4e9c88715a79ca78963284a2955dc, issuer_key_hash
0x78cf23963b47d3e393c79ea091c4ed80ebbae4ff78992058dd92fd34e1635183, over18 1, expiry 1819756800
(issuer credential exp, 2027-09-01), nonce 0x306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762. Any change to
the circuit changes the VK and invalidates all three files together with the generated verifier.
