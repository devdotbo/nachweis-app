# Demo runbook

The exact local sequence for the Nachweis demo, in order, each step with the command and the expected output, followed by the Sepolia real run. Written 2026-09-07 against main at `4c1a7fd` on the builder's Mac (M3 Max, 16 cores, 128 GB, macOS 25.6).

Each step carries one of two labels:

- verified locally 2026-09-07: the command was run on that day and produced the output shown.
- not run: with the reason.

Nothing in this file touches a live network. Every `--broadcast` below goes to a local anvil, except in the last section, which is the builder's manual Sepolia run.

## Known blockers (read first)

TODO-1 (contracts, blocks every `forge` command on main): `forge build` fails on a clean checkout.

```
Error (9582): Member "DEFAULT_REQUIRED_BITS" not found or not visible after argument-dependent lookup in type(contract FundToken).
  --> script/PermissionedPoolScriptBase.s.sol:49:50:
```

solc 0.8.28 does not allow reading a non-library contract's constant through the contract type (`FundToken.DEFAULT_REQUIRED_BITS`); it reports one occurrence per run, and the same expression is in `contracts/script/Deploy.s.sol:26`, `contracts/script/CreatePermissionedPool.s.sol:41` and `contracts/script/PermissionedPoolScriptBase.s.sol:49`. Introduced by commit `78a855a` (WP9). The "87 passed" `forge test` runs recorded elsewhere came from a stale `cache/` and `out/`; `forge clean` exposes the error and `forge test` then fails to compile as well. Fix for the contracts owner: replace the three expressions with `uint256(0x3)` or a shared file-level constant. Everything below that says "verified in the scratch copy" was run in a copy of `contracts/` with exactly that three-line patch applied (`sed '…s/FundToken.DEFAULT_REQUIRED_BITS/uint256(0x3)/'`), nothing else changed; with the patch, `forge clean && forge build && forge test` gives 87 passed, 0 failed, 10 fork tests skipped.

TODO-2 (fixture expiry, until WP9b lands): the prover fixture's `expiry` is 1780435560 (2026-06-02). `Sp1PidVerifier`, `NoirPidVerifier` and `isEligible` compare it with `block.timestamp`, so a plain anvil must start with `--timestamp 1780435000` and the attest must happen within about 9 minutes of starting anvil (anvil's clock advances with wall time). After that window `attestWithProof` reverts with `Expired()` and `isEligible` returns false. WP9b (branch `wp9b-expiry`) re-mints the vector with a future issuer expiry; once merged, drop the `--timestamp` flag and the time limit.

TODO-3 (app chain id): `app/src/lib/WalletProvider.tsx` pins wagmi to Sepolia (chain id 11155111). Against a plain anvil (chain id 31337) the wallet connector refuses the chain. For a local real-mode run start anvil with `--chain-id 11155111`, or use the Sepolia fork (which keeps 11155111), and point the wallet's Sepolia RPC at `http://127.0.0.1:8545`.

TODO-4 (app real mode needs the bridge's verifier mode): in `service` mode the app creates the session at the verifier (`GET /zk/`) and then calls the bridge's `POST /sessions/:id/address-proof` and `GET /sessions/:id` with the verifier's session id (`app/src/bridge.ts`, `app/src/verifier.ts`). The bridge only knows session ids it created itself (`POST /sessions`), and it reuses the verifier's id only in verifier mode (`VERIFIER_URL` set), which needs the two endpoints from the unpushed `klartext-verifier` branch `nachweis-relay` (`service/README.md`, "How the presentation reaches the bridge"). Until those exist, the browser flow stops after the QR code with a 404 from the bridge. The runnable paths today are the scripted bridge flow (section 5) and the app in mock mode (section 8).

TODO-5 (ports on this Mac): unrelated local processes hold 8765, 8787 and 8791. The bridge's default `BIND` is `127.0.0.1:8787`; set `BIND=127.0.0.1:8790` (used below) or any free port and pass the same to `VITE_BRIDGE_URL`.

## 1. Prerequisites

Versions used on 2026-09-07 (verified locally: each `--version` below printed this):

| tool | version | install |
|---|---|---|
| foundry (`forge`, `anvil`, `cast`) | 1.7.1 (4072e48) | https://getfoundry.sh, `foundryup -i 1.7.1` |
| bun | 1.3.5 | https://bun.sh |
| rust | rustc 1.92.0, cargo 1.92.0 | rustup, `prover-sp1/rust-toolchain` selects stable with `llvm-tools` and `rustc-dev` |
| SP1 | `cargo-prove sp1 (d454975 2026-04-11)`, sdk 6.1.0 | `curl -L https://sp1up.succinct.xyz \| bash && sp1up -v v6.1.0` |
| Go (for the in-process gnark Groth16 wrapper) | 1.27.0 | Homebrew |
| nargo | 1.0.0-beta.21 | `noirup -v 1.0.0-beta.21` |
| bb | 5.0.0-nightly.20260324 | `bbup -nv 1.0.0-beta.21` |
| python3 (one-liners below) | 3.14 | Homebrew |

SP1 Groth16 artifacts: the first Groth16 proof downloads 6.2 GB to `~/.sp1/circuits/groth16/v6.1.0` (7.8 GB extracted, one time). Present on this Mac (verified locally: `ls ~/.sp1/circuits/groth16` prints `v6.1.0`).

Put the tools on the path for every terminal below:

```
export PATH="$HOME/.sp1/bin:$HOME/.cargo/bin:$HOME/.foundry/bin:$HOME/.nargo/bin:$HOME/.bb:$HOME/.bun/bin:$PATH:/opt/homebrew/bin"
export W=/Users/bioharz/git/ethglobal/nachweis-app          # repo root
```

## 2. Build everything

| step | command | expected | status |
|---|---|---|---|
| 2.1 | `cd $W/contracts && forge clean && forge build` | `Compiler run successful!` | not run on main: TODO-1 (error above). Verified in the scratch copy with the patch. |
| 2.2 | `cd $W/contracts && forge test` | `87 tests passed, 0 failed, 10 skipped` (the 10 are fork tests, skipped without `SEPOLIA_RPC_URL`) | same as 2.1: fails to compile on main; 87 passed in the scratch copy |
| 2.3 | `cd $W/service && cargo build --release` | `Finished release profile` | verified locally 2026-09-07 (7.7 s incremental; the first build compiles sp1-sdk and takes minutes) |
| 2.4 | `cd $W/service && cargo test` | 3 unit tests plus `mock_pipeline_attests_and_revokes_on_anvil ... ok` | verified locally 2026-09-07 with `contracts/out` populated from the scratch build. Note: when `contracts/out` is missing the test runs `forge build`, which fails on main (TODO-1), and the test then passes with a `SKIP` message instead of running; check for `SKIP` with `cargo test --test anvil -- --nocapture` |
| 2.5 | `cd $W/app && bun install && bun run build` | `416 packages installed`, then `tsc` clean and `vite build` into `dist/` (one chunk-size warning) | verified locally 2026-09-07 |
| 2.6 | `cd $W/prover-sp1/script && cargo build --release` | builds the guest through `build.rs`; produces `$W/prover-sp1/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/nachweis-pid-program` | verified locally 2026-09-07 (1 m 28 s) |
| 2.7 | `cd $W/circuits/pid-sdjwt && nargo test && nargo compile` | `4 tests passed`; `target/pid_sdjwt.json` | verified locally 2026-09-07 |

The Noir proof itself (`bb prove`, `bb write_solidity_verifier`) is documented in `circuits/README.md`; it is not part of the demo sequence because the generated verifier and the proof fixture are already committed under `contracts/`.

## 3. Start anvil

Terminal A:

```
anvil --port 8545 --timestamp 1780435000
```

Expected: the ten funded accounts, `Listening on 127.0.0.1:8545`. `cast chain-id --rpc-url http://127.0.0.1:8545` prints `31337`; `cast block latest --rpc-url http://127.0.0.1:8545 -f timestamp` prints `1780435000`. Verified locally 2026-09-07.

The `--timestamp` flag is TODO-2. Add `--chain-id 11155111` when the browser app is to connect (TODO-3).

Keys used everywhere below (anvil defaults, public, worthless):

```
export RPC=http://127.0.0.1:8545
export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # account 0, 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export POLICY_ID=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f            # keccak256("nachweis.pid.over18.v1")
```

`POLICY_ID` must be passed explicitly: `Deploy.s.sol` and the pool scripts default to `keccak256("nachweis.demo.fund.v1")`, while the verifier deploy scripts, the bridge and the app default to `keccak256("nachweis.pid.over18.v1")`. With the default of `Deploy.s.sol` the bridge would attest under a policy the token does not read.

## 4. Deploy the contracts

All from `$W/contracts` (scratch copy until TODO-1 is fixed).

4.1 Registry, FundToken, Subscription (verified in the scratch copy 2026-09-07):

```
forge script script/Deploy.s.sol:Deploy --rpc-url $RPC --broadcast
```

Expected console block (addresses depend on the deployer nonce; these are from a fresh anvil):

```
  AttestationRegistry: 0x5FbDB2315678afecb367f032d93F642f64180aa3
  FundToken:           0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
  Subscription:        0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
  Operator:            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f
...
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
```

Five transactions (registry, `setOperator`, token, subscription, `setSubscription`). Observed once: the first run printed the addresses and then hung after broadcasting; `cast block-number` showed the transactions mined; killed and re-run, the second run completed in seconds. If it hangs, check `cast block-number --rpc-url $RPC` and re-run.

```
export REG=<AttestationRegistry> TOK=<FundToken> SUB=<Subscription>
cast call $REG "isOperator(bytes32,address)(bool)" $POLICY_ID 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url $RPC    # true
```

4.2 SP1 verifier. On a plain anvil there is no SP1 verifier gateway, so deploy the test double first and pass it as `SP1_GATEWAY` (verified in the scratch copy 2026-09-07):

```
export GW=$(forge create src/test/MockSp1Gateway.sol:MockSp1Gateway --rpc-url $RPC --private-key $DEPLOYER_PRIVATE_KEY --broadcast | awk '/Deployed to/{print $3}')
SP1_GATEWAY=$GW REGISTRY_ADDRESS=$REG forge script script/DeploySp1Verifier.s.sol:DeploySp1Verifier --rpc-url $RPC --broadcast
```

Expected: `Sp1PidVerifier: 0x…`, `SP1 gateway: <GW>`, `Registry: <REG>`, the pinned `programVKey`, `issuerKeyHash`, `vctHash`, `policyId`, then `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`. The script calls `setVerifier(POLICY_ID, verifier)` because `REGISTRY_ADDRESS` is set. `MockSp1Gateway` accepts only `(vkey, publicValues)` pairs registered with `accept(vkey, publicValues, true)` and ignores the proof bytes; it stands in for the gateway, not for the proof. On a Sepolia fork (section 7) omit `SP1_GATEWAY`: the default is the real gateway `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B`, and the real proof is verified.

4.3 Noir verifier (verified in the scratch copy 2026-09-07):

```
REGISTRY_ADDRESS=$REG forge script script/DeployNoirVerifier.s.sol:DeployNoirVerifier --rpc-url $RPC --broadcast
```

Expected: `NoirPidVerifier: 0x…`, `HonkVerifier: 0x…`, `HonkVerifier runtime bytes: 24246`, `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`. This replaces the policy's verifier with the Noir adapter (last `setVerifier` wins). The Noir proof is submitted by hand, not by the bridge; the calldata shape is in `contracts/README.md`, "NoirPidVerifier", and the fixture proof is in `contracts/test/fixtures/noir/`.

4.4 Verifier for the bridge's mock mode. `PROOF_MODE=mock` sends the fixture proof bytes, which only `MockProofVerifier` accepts (verified in the scratch copy 2026-09-07):

```
export MPV=$(forge create src/test/MockProofVerifier.sol:MockProofVerifier --rpc-url $RPC --private-key $DEPLOYER_PRIVATE_KEY --broadcast --constructor-args true | awk '/Deployed to/{print $3}')
cast send $REG "setVerifier(bytes32,address)" $POLICY_ID $MPV --rpc-url $RPC --private-key $DEPLOYER_PRIVATE_KEY
cast call $REG "verifierOf(bytes32)(address)" $POLICY_ID --rpc-url $RPC      # prints $MPV
```

`--constructor-args` must be the last flag of `forge create`; placed earlier it swallows the following flags (`Constructor argument count mismatch: expected 1 but got 6`, observed).

Switching verifiers for the other modes: `cast send $REG "setVerifier(bytes32,address)" $POLICY_ID <Sp1PidVerifier or NoirPidVerifier> …` from the deployer (registry owner).

## 5. The bridge, PROOF_MODE=mock

Terminal B (verified locally 2026-09-07, bridge binary from 2.3):

```
cd $W/service
export BIND=127.0.0.1:8790
export RPC_URL=http://127.0.0.1:8545
export OPERATOR_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export REGISTRY=$REG
export POLICY_ID=nachweis.pid.over18.v1
export REQUIRE_ADDRESS_PROOF=false           # scripted run; true when the browser wallet signs the session
export CORS_ORIGINS=http://localhost:5173
export PROOF_MODE=mock
export PROVER_ARTIFACTS=$PWD/../prover-sp1/fixtures
export ISSUER_KEY_SEC1_HEX=$(python3 -c "import json;print(json.load(open('../prover-sp1/fixtures/input.json'))['issuer_key_sec1_hex'])")   # fixture only; unset for a real sandbox credential
RUST_LOG=info ./target/release/nachweis-bridge
```

Expected log lines:

```
INFO nachweis_bridge: chain client ready registry=0xB7f8… operator=0xf39F…
INFO nachweis_bridge: nachweis-bridge starting proof_mode="mock" mode="local" policy_id=0xd27260f1…
INFO nachweis_bridge: listening bind=127.0.0.1:8790
```

`curl -s http://127.0.0.1:8790/health` prints `{"chain":{"operator":"0xf39f…","registry":"0xb7f8…"},"mode":"local","ok":true,"policy_id":"0xd272…","proof_mode":"mock","require_address_proof":false}`.

### The six beats, scripted (Terminal C, verified locally 2026-09-07 within the TODO-2 window)

The fixture presentation is bound to subject `0xcf02ad5376095e285fc88ae8c1fa240791370c17` with challenge `4a0c254ad03eb45efd6fa230c2cdafc2e14821316c976c22d0272066cc63c1e5`; both must be reused or the KB-JWT nonce check fails (422 `KB-JWT nonce mismatch`).

```
export B=http://127.0.0.1:8790 SUBJ=0xcf02ad5376095e285fc88ae8c1fa240791370c17
```

Beat 1, the investor is not permitted:

```
cast call $REG "isEligible(address,bytes32,uint256)(bool)" $SUBJ $POLICY_ID 3 --rpc-url $RPC        # false
```

Beat 2, session and presentation (in the live demo the wallet answers the QR; here the fixture stands in):

```
SID=$(curl -s -X POST $B/sessions -H 'content-type: application/json' \
  -d "{\"bound_address\":\"$SUBJ\",\"challenge_hex\":\"4a0c254ad03eb45efd6fa230c2cdafc2e14821316c976c22d0272066cc63c1e5\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['session_id'])")
python3 -c "import json,sys;print(json.dumps({'sd_jwt_presentation':open(sys.argv[1]).read().strip()}))" $W/prover-sp1/fixtures/synthetic-over18.sdjwt > /tmp/pres.json
curl -s -X POST $B/sessions/$SID/presentation -H 'content-type: application/json' --data @/tmp/pres.json
```

Expected: `POST /sessions` returns `session_id`, `nonce` `e6de79975a3b30ad89d7af4e44fcdba843df4b70d4b3307e687e5498bbe0a25d` (the fixture's KB-JWT nonce), `address_proof_message` `nachweis:session:<id>`. The presentation call returns in well under a second with `"status":"proved"`, `"proof_system":"mock-groth16"`, `public_values` `{expiry: 1780435560, issuer_key_hash: 0x841e…, nonce: 0xe6de…, over18: 1, subject: 0xcf02…, vct_hash: 0x27b2…}`, `vkey` `0x00b092…`. `GET $B/sessions/$SID` shows `proved | proof ready (mock-groth16)`.

Beat 3, the attest transaction and what the chain sees:

```
curl -s -X POST $B/sessions/$SID/attest -H 'content-type: application/json' -d '{"tier":1}'
curl -s $B/sessions/$SID
cast call $REG "decisionOf(address,bytes32)((bytes32,uint256,uint8,uint64,bytes32,bool))" $SUBJ $POLICY_ID --rpc-url $RPC
cast logs --rpc-url $RPC --address $REG "Attested(address,bytes32,uint256,uint8,uint64,bytes32,address)"
```

Expected: the attest response carries `"attested":{"attester":"0xf39f…","bits":"0x3","expiry":1780435560,"policy_id":"0xd272…","status_ref":"0x…","subject":"0xcf02…","tier":1}` (the decoded `Attested` event) plus the `call` with the `Decision` and the four `publicInputs`; the session reads `attested | attested in 0x<tx hash>`; `decisionOf` prints `(0xd272…, 3, 1, 1780435560, 0x<statusRef>, false)`; `cast logs` shows one `Attested` log whose data is `bits 3, tier 1, expiry 0x6a1f4a68, statusRef`. Nothing in the record or the event is a name. `isEligible(...)` now prints `true`.

Beat 4, door one (the subject has no key on anvil, so impersonate it):

```
cast rpc anvil_impersonateAccount $SUBJ --rpc-url $RPC; cast rpc anvil_setBalance $SUBJ 0xDE0B6B3A7640000 --rpc-url $RPC
cast send $SUB "subscribe()" --from $SUBJ --unlocked --rpc-url $RPC                       # status 1 (success)
cast call $TOK "balanceOf(address)(uint256)" $SUBJ --rpc-url $RPC                          # 100000000000000000000 (100 NDF)
cast send $TOK "transfer(address,uint256)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 1 --from $SUBJ --unlocked --rpc-url $RPC
```

The last call reverts with `custom error 0x3a1c1545: …70997970…` (`FundToken.NotEligible(address)` for the unattested recipient). Verified locally 2026-09-07.

Door two (the Uniswap pool) needs the Sepolia fork, section 7.

Beat 6, revoke and the refusals (verified locally 2026-09-07):

```
curl -s -X POST $B/revoke -H 'content-type: application/json' -d "{\"subject\":\"$SUBJ\"}"
cast call $REG "isEligible(address,bytes32,uint256)(bool)" $SUBJ $POLICY_ID 3 --rpc-url $RPC       # false
cast send $SUB "subscribe()" --from $SUBJ --unlocked --rpc-url $RPC                                   # reverts: custom error 0xf8eb54de (Subscription.NotEligible)
curl -s -X POST $B/sessions/$SID/attest -H 'content-type: application/json' -d '{}'                   # {"error":"session is attested, expected proved"}
cast logs --rpc-url $RPC --address $REG "Revoked(address,bytes32,address)"                            # one Revoked log
```

Re-attesting after a revoke is an explicit operator action (`POST $B/sessions/$SID/attest-operator` with `{"tier":1}` reopens the decision through `attestByOperator`; verified locally, then `subscribe()` succeeds again). The proof path cannot reopen a revoked decision and the fixture nonce is consumed (`NonceConsumed`).

## 6. The bridge, PROOF_MODE=execute and groth16

Same environment as section 5 plus the guest ELF from step 2.6 and the SP1 prover selection:

```
export PROOF_MODE=execute        # or groth16
export SP1_PROVER=cpu
export PROVER_ELF=$W/prover-sp1/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/nachweis-pid-program
```

`execute` (verified locally 2026-09-07, `BIND=127.0.0.1:18791`): the presentation call returns after 11 s with `{'status': 'proved', 'proof_system': 'execute', 'cycles': 430143, 'proof_hex': None}`; the session reads `proved | proof ready (execute, 430k cycles)`; `POST …/attest` answers 409 `{"error":"no on-chain proof for proof mode execute"}`. Good for showing the guest run on camera without the five-minute wait.

`groth16` (`BIND=127.0.0.1:18792`): the presentation call blocks while SP1 proves (core, compress, shrink, wrap, gnark), then returns `proof_system` `groth16`, `proof_hex` of 356 bytes and the `vkey`. Not completed 2026-09-07, see TODO-6. For the attest to succeed on a plain anvil the policy's verifier must be `Sp1PidVerifier` (4.2) and the mock gateway must accept the pair: `cast send $GW "accept(bytes32,bytes,bool)" <vkey> <public_values_hex> true --rpc-url $RPC --private-key $DEPLOYER_PRIVATE_KEY`, within the TODO-2 window. The proof itself is only verified by the real gateway on the Sepolia fork (section 7) or on Sepolia.

Shortcut with a real verification and no proving: on a Sepolia fork, `PROOF_MODE=mock` with the fixture's subject and challenge produces exactly the fixture's public values, and the fixture proof is a valid Groth16 proof for them, so `Sp1PidVerifier` plus the real gateway accept it (this is what `contracts/test/Sp1PidVerifier.fork.t.sol` asserts with `vm.warp`). On the fork the block timestamp is past the fixture expiry (TODO-2); whether `anvil --fork-url … --timestamp 1780435000` rewinds a fork is unverified.

## 7. Uniswap permissioned pool on a Sepolia fork

Not run 2026-09-07: needs a Sepolia RPC URL (network). The commands are the ones the dry runs and fork tests used, pointed at a local fork so `--broadcast` stays local.

Terminal A (replaces the plain anvil; the fork keeps chain id 11155111, which the scripts require, and funds the anvil default accounts):

```
export SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com      # or your own
anvil --port 8545 --fork-url $SEPOLIA_RPC_URL
```

From `$W/contracts`, deployer = anvil account 0. Without `REGISTRY_ADDRESS` the pool script deploys a fresh registry and FundToken; pass the ones from section 4 to reuse them (the deployer must be the token issuer and an operator for `POLICY_ID`):

```
export DEPLOYER_PRIVATE_KEY=0xac09…2ff80 POLICY_ID=0xd272…d05f
forge script script/CreatePermissionedPool.s.sol:CreatePermissionedPool --rpc-url $RPC --broadcast
```

Expected: `AttestationRegistry`, `FundToken`, `MockStable`, `EudiAllowlistChecker`, `PermissionsAdapter`, pool currencies, `Pool hooks: 0x51247E22…`, `Initial tick: 276324` (stable as currency0) and the printed step 7 text. Copy `PermissionsAdapter`, `MockStable`, `FundToken`, `AttestationRegistry` into env:

```
export ADAPTER_ADDRESS=<PermissionsAdapter> STABLE_ADDRESS=<MockStable> FUND_TOKEN_ADDRESS=<FundToken> REGISTRY_ADDRESS=<AttestationRegistry>
forge script script/AddLiquidityPermissioned.s.sol:AddLiquidityPermissioned --rpc-url $RPC --broadcast
```

Expected: LP attested if needed, Permit2 approvals, `modifyLiquidities` with `MINT_POSITION + SETTLE_PAIR`, a position token id, adapter balance of the PoolManager 999 NDF (defaults `FUND_AMOUNT=1000e18`, `STABLE_AMOUNT=1000e6`, full range).

Door two, the investor swap (anvil account 1 as investor):

```
export INVESTOR_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
forge script script/SwapPermissioned.s.sol:SwapPermissioned --rpc-url $RPC --broadcast
```

Expected: the deployer attests the investor (`ATTEST_INVESTOR=true` default), 100 mUSD in, about 90.65 NDF out (`UniversalRouter.execute`, `V4_SWAP`), the investor holds FundToken. Then the refusal:

```
REVOKE_INVESTOR=true forge script script/SwapPermissioned.s.sol:SwapPermissioned --rpc-url $RPC --broadcast
```

Expected: the run stops at `UniversalRouter.execute` with `WrappedError(0x51247E2291d290d17C08813A175AC86465EdE8c0, 0x575e24b4 /* beforeSwap */, Unauthorized(), HookCallFailed())`: the hook refused the revoked investor before any token moved. `Subscription.subscribe()` from the same investor reverts with `NotEligible` in the same state. One revoke, two doors closed.

The equivalent as tests, read-only against Sepolia, no fork server needed (passed 2026-09-07 per `contracts/docs/uniswap-permissioned-pool.md`; not re-run here):

```
SEPOLIA_RPC_URL=$SEPOLIA_RPC_URL forge test --match-contract PermissionedPoolSwapSepoliaForkTest -vv
```

## 8. The app

Mock mode (verified locally 2026-09-07: `bun run dev` prints `VITE v8.2.2 ready`, `http://localhost:5173/` answers 200 with title `Nachweis demo`):

```
cd $W/app && VITE_MOCK=1 bun run dev
```

Everything runs in memory: mock wallets, a mock verifier that "presents" the sample identity after four seconds, a mock bridge that walks verified, proving (three seconds, "generating proof, 430k cycles"), proved, attested, and a mock registry. This is the fallback for the video if a chain step is red; the captions must then say "mock".

Real mode (not run: needs an injected wallet and, past the QR code, the bridge's verifier mode, TODO-4):

```
cd $W/app && cp .env.example .env
# VITE_VERIFIER_URL=http://localhost:3000      the pre-existing verifier-service (DISCLOSURE.md), ZK path enabled
# VITE_VERIFIER_MODE=service
# VITE_BRIDGE_URL=http://127.0.0.1:8790
# VITE_REGISTRY=$REG  VITE_FUND_TOKEN=$TOK  VITE_SUBSCRIPTION=$SUB
# VITE_POOL=                                   leave empty until the pool exists; the Swap door stays disabled
# VITE_POLICY_ID=0xd272…d05f  VITE_REQUIRED_BITS=3
# VITE_RPC_URL=http://127.0.0.1:8545           anvil started with --chain-id 11155111 (TODO-3)
# VITE_MOCK=0
bun run dev
```

Wallet: MetaMask (or any injected wallet) with its Sepolia network's RPC URL edited to `http://127.0.0.1:8545`; import anvil account 1 for the investor and account 0 for the issuer (operator). The bridge runs with `REQUIRE_ADDRESS_PROOF=true` so the session signature is enforced.

The six beats as clicks, and what to watch:

| beat | screen (role in the header) | click | app shows | terminal shows |
|---|---|---|---|---|
| 1 investor | Investor: card 1 "Connect wallet", card 3 "Eligibility" | Connect | Eligibility chip `not permitted`; both doors closed | `cast call $REG isEligible …` false |
| 2 wallet | Investor: card 2 "Present your ID" | the yellow button creates the request; QR and openid4vp link appear; the phone scans and taps once | chip `presented, awaiting issuer`; bridge state chips created, presented, verified | verifier-service log: presentation verified (names in the service, not in any response) |
| 3a binding | same card | "sign" (ghost button): the wallet signs `nachweis:session:<id>` | `address_verified` | bridge: `POST /sessions/:id/address-proof` 200 |
| 3 issuer | Issuer: card 3 "Presentations" | Approve (operator path) or wait for the bridge's `attestWithProof` | bridge chips proving, proved, attested with the tx hash; investor card 3 turns `permitted`, card 5 "What the chain sees" shows the raw Decision and "no name, no document" | bridge: `attestWithProof` tx hash and decoded `Attested`; Issuer card 4 "Registry events" lists `Attested` |
| 4 doors | Investor: card 4 "Two doors, one decision" | Subscribe (`Subscription.subscribe()`); Swap (disabled until `VITE_POOL`; on Sepolia the swap is the script of section 7 or the viem calldata in `contracts/docs/uniswap-permissioned-pool.md`) | balance of NDF; door states from `isEligible` | anvil: `subscribe` mined |
| 6 revoke | Issuer: card 3 Revoke, or card 2 "Revoke by address" | Revoke | Issuer card 4 shows `Revoked`; Investor card 3 `revoked`, both doors closed; Subscribe now fails with `NotEligible` | bridge or cast: `revoke` tx; `cast logs … Revoked` |

Simulated checks: the issuer screen today has no "simulated" label for sanctions and similar checks (`grep -ri simulat app/src` is empty). The caption in the video must carry it (see `docs/video-shotlist.md`).

## 9. Sepolia real run (builder, manual)

Not run 2026-09-07. Nothing is deployed to any network as of this file. What the builder must have:

- A funded deployer key on Sepolia (`DEPLOYER_PRIVATE_KEY`; it becomes registry owner, token issuer, operator and adapter owner). Roughly 12 M gas across all scripts at Sepolia prices; the two dry runs of the pool scripts alone estimated 8.2 M and 8.9 M.
- A funded investor key (`INVESTOR_PRIVATE_KEY`, anything with a few hundredths of Sepolia ETH) and, for the browser beats, the same key imported into the wallet on the phone or laptop.
- `SEPOLIA_RPC_URL` (a private endpoint is better than the public one for `--broadcast`), optionally `ETHERSCAN_API_KEY` for `--verify`.
- `$W/.env` from `/.env.example` with those three values; `foundry.toml` maps `--rpc-url sepolia` to `SEPOLIA_RPC_URL`.
- The blind-relay branch of the verifier pushed and running if the browser flow is to go past the QR (TODO-4); otherwise the scripted flow of section 5 against Sepolia.

Ordered steps, from `$W/contracts`, each a dry run first (drop `--broadcast`) then broadcast:

| # | command | env | records |
|---|---|---|---|
| 1 | `forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --broadcast --verify` | `DEPLOYER_PRIVATE_KEY`, `POLICY_ID=0xd272…d05f`, optional `OPERATOR_ADDRESS`, `REQUIRED_BITS` (default 3), `DEMO_AMOUNT` | registry, token, subscription addresses and tx hashes |
| 2 | `REGISTRY_ADDRESS=<registry> forge script script/DeploySp1Verifier.s.sol:DeploySp1Verifier --rpc-url sepolia --broadcast --verify` | defaults: real gateway, fixture vkey, sandbox issuer key hash, vct hash, policy id. After WP9b: `SP1_PROGRAM_VKEY` from the regenerated `prover-sp1/fixtures/vkey.txt` and `PID_ISSUER_KEY_HASH` if the fixture issuer changed | `Sp1PidVerifier` address; `setVerifier` tx |
| 3 | `REGISTRY_ADDRESS=<registry> forge script script/DeployNoirVerifier.s.sol:DeployNoirVerifier --rpc-url sepolia --broadcast --verify` | `HONK_VERIFIER` to reuse an existing HonkVerifier; `PID_ISSUER_KEY_HASH`, `POLICY_ID` as above. Deploying the 24,246-byte HonkVerifier is the single most expensive transaction | `HonkVerifier`, `NoirPidVerifier` addresses. Note: this points the policy at the Noir verifier; run `cast send <registry> "setVerifier(bytes32,address)" $POLICY_ID <Sp1PidVerifier>` afterwards if the bridge is to attest with SP1 proofs, or use two policy ids |
| 4 | `forge script script/CreatePermissionedPool.s.sol:CreatePermissionedPool --rpc-url sepolia --broadcast` | `DEPLOYER_PRIVATE_KEY`, `REGISTRY_ADDRESS`, `FUND_TOKEN_ADDRESS`, `POLICY_ID`; optional `REQUIRED_BITS`, `POOL_FEE`, `TICK_SPACING` | checker, adapter, pool id, currencies, hook; tx hashes of steps 2 to 6 (FEEDBACK.md TODO) |
| 5 | `forge script script/AddLiquidityPermissioned.s.sol:AddLiquidityPermissioned --rpc-url sepolia --broadcast` | `ADAPTER_ADDRESS`, `REGISTRY_ADDRESS`, `FUND_TOKEN_ADDRESS`, `STABLE_ADDRESS` (the MockStable printed by step 4), optional `LP_PRIVATE_KEY`, `FUND_AMOUNT`, `STABLE_AMOUNT`, `TICK_LOWER`, `TICK_UPPER` | position token id, gas paid (FEEDBACK.md TODO) |
| 6 | bridge on Sepolia: section 5 env with `RPC_URL=$SEPOLIA_RPC_URL`, `OPERATOR_PRIVATE_KEY=$DEPLOYER_PRIVATE_KEY` (or the operator key), `REGISTRY=<registry>`, `PROOF_MODE=groth16`, `SP1_PROVER=cpu`, `PROVER_ELF`, `REQUIRE_ADDRESS_PROOF=true`, `ISSUER_KEY_SEC1_HEX` unset for a real sandbox credential | the real presentation from the test wallet (through the verifier, TODO-4) or the fixture; `attestWithProof` tx hash on Etherscan showing bits, tier, expiry, policy id, no name |
| 7 | `forge script script/SwapPermissioned.s.sol:SwapPermissioned --rpc-url sepolia --broadcast` | step 5 env plus `INVESTOR_PRIVATE_KEY`; `ATTEST_INVESTOR=false` when the investor was attested by the bridge in step 6, otherwise the deployer attests it by the operator path (caption: operator path) | swap tx hash, amounts, gas |
| 8 | revoke: `cast send <registry> "revoke(address,bytes32)" <investor> $POLICY_ID --rpc-url sepolia --private-key $DEPLOYER_PRIVATE_KEY`, then `REVOKE_INVESTOR=false ATTEST_INVESTOR=false forge script script/SwapPermissioned.s.sol:SwapPermissioned --rpc-url sepolia` (dry run is enough to show the revert) and `cast send <subscription> "subscribe()" --rpc-url sepolia --private-key $INVESTOR_PRIVATE_KEY` | | `Revoked` tx hash; the `WrappedError(PermissionedHooks, beforeSwap, Unauthorized(), HookCallFailed())` revert; the `NotEligible` revert |
| 9 | step 7 of the Uniswap guide (web form, optional) and the Uniswap Developer Feedback Form with the `FEEDBACK.md` link | | the form's response |

Then: put the addresses into the root README ("Deployment status" line of the honesty box), `app/.env` (`VITE_REGISTRY`, `VITE_FUND_TOKEN`, `VITE_SUBSCRIPTION`, `VITE_POOL`), fill the TODO lines of `FEEDBACK.md`, and record the run in the wiki log.

What to record for the video (screen recording only, no speedups): the Etherscan page of the `Attested` transaction (event tab: bits, tier, expiry, policy id, status ref, no name), the `subscribe` transaction, the swap transaction with the `PermissionedHooks` address in the trace, the `Revoked` transaction, and the two failed calls afterwards. Keep the terminal windows of the bridge (proof timing line) and of the swap script (the `WrappedError`) in the recording.

## Verification log, 2026-09-07

| item | status |
|---|---|
| tool versions | verified |
| `forge build`, `forge test` on main | failed, TODO-1 (exact error above); 87 passed in the scratch copy with the three-line patch |
| `cargo build --release`, `cargo test` (service, incl. anvil e2e) | verified |
| `bun install`, `bun run build` (app) | verified |
| SP1 guest and host build | verified |
| `nargo test`, `nargo compile` | verified |
| anvil, `Deploy.s.sol`, `DeploySp1Verifier.s.sol` (mock gateway), `DeployNoirVerifier.s.sol`, `MockProofVerifier` + `setVerifier` | verified in the scratch copy against anvil |
| bridge mock: sessions, presentation, attest, `Attested` event, `decisionOf`, `isEligible`, subscribe, transfer refusal, revoke, refusals, attest-operator reopen | verified |
| bridge execute (11 s, 430,143 cycles, attest 409) | verified |
| bridge groth16 | not completed: TODO-6 (artifact re-download) |
| app mock mode serves | verified |
| app real mode browser flow | not run: needs an injected wallet; blocked past the QR by TODO-4 |
| Uniswap pool on a Sepolia fork | not run: needs a Sepolia RPC (network) |
| Sepolia real run | not run: no keys, no network, builder's decision |

TODO-6 (bridge groth16 mode re-downloads the SP1 artifacts): with `PROOF_MODE=groth16 SP1_PROVER=cpu` the bridge ran the core proof for about five minutes and then logged

```
INFO sp1_prover::build: [sp1] groth16 circuit artifacts for version v6.1.0 are missing or incomplete at /Users/bioharz/.sp1/circuits/groth16/v6.1.0. downloading...
```

although that directory holds the 7.8 GB the SP1 spike downloaded (`constraints.json`, `groth16_circuit.bin`, `groth16_pk.bin`, `groth16_vk.bin`, `groth16_witness.json`, `Groth16Verifier.sol`, `SP1VerifierGroth16.sol`; the spike's own host in `prover-sp1/NOTES.md` proved Groth16 with them). The bridge started writing `v6.1.0.incomplete.<random>` next to it. The run was stopped there (network download, 6.2 GB, about 44 minutes on the first spike run). What the sdk's completeness check expects is unverified; the service owner should compare the artifact check in the sp1-sdk 6.1.0 used by `service/Cargo.lock` with the one used by `prover-sp1/script`, or let the download finish once on the demo machine before recording. Until then the Groth16 route is demonstrated by the fixture proof through the real gateway on a Sepolia fork (section 6, shortcut) and by `prover-sp1/script` (`--prove --system groth16`, `prover-sp1/NOTES.md`).
