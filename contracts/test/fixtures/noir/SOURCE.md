# Noir proof fixture (pid-sdjwt, evm target)

Copied unchanged from `circuits/pid-sdjwt/out/adapted/` after running the commands in
`/circuits/README.md` (nargo 1.0.0-beta.21, bb 5.0.0-nightly.20260324) on the realistic PID
vector `prover-sp1/fixtures/realistic-input.json` (minted by `companion mint-fixture`, see
`circuits/pid-sdjwt/REALISM.md`; the vector itself is unchanged since WP13, the circuit changed in
WP22 (movable header window, REALISM.md section 8), so proof and vk_hash were regenerated):

    cd circuits/pid-sdjwt
    nargo compile
    bun run ../tools/gen-prover.ts ../../prover-sp1/fixtures/realistic-input.json
    nargo execute pid_witness
    bb write_vk -b target/pid_sdjwt.json -o out/adapted -t evm
    bb prove -b target/pid_sdjwt.json -w target/pid_witness.gz -k out/adapted/vk -o out/adapted -t evm
    cp out/adapted/proof         ../../contracts/test/fixtures/noir/proof.bin
    cp out/adapted/public_inputs ../../contracts/test/fixtures/noir/public_inputs.bin
    cp out/adapted/vk_hash       ../../contracts/test/fixtures/noir/vk_hash.bin

| file | bytes | sha256 |
| --- | --- | --- |
| proof.bin | 10,304 | a904a488b059e09ab86f6a9f5e7192395bd297f37c1a1702eba8261304f5c3d6 |
| public_inputs.bin | 2,752 (86 x 32) | 4ea8becf1a1507dea981db42a412477e58c421309d20c8a45f6f90e85de4e43f |
| vk_hash.bin | 32 | 09221f422d4e3b9f26c9401b67521e8f9cd139caa45d11d7e9fd69d7b3d4c3f4 |

`vk_hash.bin` must equal the `VK_HASH` constant in `contracts/src/noir/PidSdJwtUltraHonkVerifier.sol`
(0x2e13794a77895882c11e891c641277cede611206c575ca2a35e8fe7724758a64, WP22 header window); the test asserts this. Decoded
public inputs: subject 0xf99edde971f4e9c88715a79ca78963284a2955dc, issuer_key_hash
0xb52359580c14e2d79d34605740d86338adc6a0868a22ec648d1896187813fd26 (the companion test issuer whose
self-signed leaf is the x5c[0] of the vector; its private key is not in the repo, so re-minting the
vector changes this value), over18 1, expiry 1819756800 (issuer credential exp, 2027-09-01), nonce
0x306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762 (subject and challenge are the
SP1 fixture's, so the nonce is unchanged). Any change to the circuit changes the VK and invalidates
all three files together with the generated verifier.
