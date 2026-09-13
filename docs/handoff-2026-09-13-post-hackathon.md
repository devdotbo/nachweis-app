# Handoff 2026-09-13 evening: post-hackathon state, what was done today, the open fix

Written for the next agent or person picking this up. Self-contained. Labels: FACT = observed in this session (command output, chain reads, page content pasted by the builder). CLAIM = read from code or docs, not exercised. OPINION = judgement. No code, config or deployment was changed in this session; the only changes were one on-chain transaction and stopping stale local processes, both listed below.

Repository: this repository, branch `main` at `7ef18b2`, working tree clean before this file was added. Sister worktree with the hosted-services branch: the sister worktree of this repository (branch `hosted-services` at `66d8ec3`). Wiki copy: `docs/wiki/` (re-copied from the separate wiki repository, the private wiki repository).

## 1. What the system is (short)

- Investor portal and issuer console (Vite/React, `app/`), hosted at https://app.attestat.dev (Vercel, static build; record in `docs/hosting-app-vercel.md` and, for the build with the hosted services, `docs/hosting-server.md` in the hosted worktree).
- Bridge (`service/`, Rust) at https://bridge.attestat.dev, holds `OPERATOR_PRIVATE_KEY` (operator `0x452A376805821aD33D2F01c9134Ba5E26455900a`, the deployer) and `BRIDGE_ISSUER_TOKEN`. Relay (verifier-service) at https://relay.attestat.dev. Both run as systemd units on the server reachable as `ssh cloud` (NixOS, env files under `/var/lib/attestat/secrets/`). See `docs/hosting-server.md` (hosted worktree).
- Contracts on Sepolia (chain 11155111), from `docs/deployments/sepolia-2026-09-10.md`: AttestationRegistry `0xeD46dC419e826c9Fdf16aADe1C9e3e970cc8ad53`, FundToken NDF `0x8Ef00746fc2508B01CC8bBCDd0e161598eC9792f`, Subscription `0x1542515f5E8a00BF087bEcdeEdfC4c9Bd68569fb`, Uniswap v4 PermissionsAdapter `0xc440aD626959d97a689Ba0465f2F1eD293a0b20D`, mUSD `0x645476358892F920991e544394EA24fF6Df5204A`, EudiAllowlistChecker `0x967A70…aF7046`, NoirPidVerifier `0x44970b304f5e0e53a2cd32a6064da8be951b757a`. Policy id `0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f`, required bits `0x3`.
- Eligibility is two conditions (spec: `docs/spec-issuer-approval.md`): (1) evidence, stored by `attestWithProof` (the bridge sends it after a valid proof) or by `attestByOperator`; (2) approval, `registry.approve(subject, policyId)` by an operator. `isEligible` is true only with both, not revoked, not expired. FundToken transfers, Subscription and the Uniswap hook (via the checker) all read `isEligible`.

## 2. What the builder saw today (FACT, from the pasted page and chain reads)

Journey of investor `0xFC619fFC5DA7d203C76e9a96a313946a2dD092ef` (injected wallet, Helium browser) on https://app.attestat.dev:

1. Session `b1c527f3-…` created at bridge.attestat.dev, session signed by the wallet, nonce `ac7cafc3…5eb1`.
2. Proof made in the browser tab (route "Prove in this browser"): noir_js and bb.js, 12 threads, cross-origin isolated, total 53.3 s (witness 1450 ms, bb_init 1337 ms, prove 12169 ms, verify 4321 ms), proof 10304 bytes, 86 public inputs, verified in the tab. Issuer key hash `0xb4f2bfa1…e079` (sandbox PID issuer). Statement: over 18, expiry 1790035200 (2026-09-22).
3. Bridge stored the evidence: `attestWithProof` tx `0x4a890867a633f64ecfa44493481d7741ad3f1b4da4da632e3aca50811918eb76`, block 11696785 (17:32:24 CEST), from the operator. Registry: hasDecision true, approved false, revoked false, bits 0x3, tier 1, statusRef `0x4f94bcc7…5e25`.
4. Bridge session state `attested`, `proof_system` `noir-ultrahonk`, `approved` false. Page: "evidence on chain, awaiting issuer approval", both doors closed.
5. The builder clicked Swap while the door was closed. Tx `0x2900c14a…178b1171` was mined and reverted: `PermissionedHooks.beforeSwap` `Unauthorized()`, decoded on the page. This is intended behaviour: `app/src/components/swap/SwapDoor.tsx` keeps the button enabled with the hint "Door closed: the swap can still be sent, and the pool's refusal is shown here with the revert reason."

Diagnosis: nothing was broken. The issuer approval had simply never been sent, and on the hosted site nobody could send it (section 3).

## 3. Why the approval could not be sent on the hosted site (FACT from code, CLAIM where marked)

- The issuer console (`app/src/screens/IssuerScreen.tsx`, `app/src/components/IssuerPending.tsx`, `app/src/components/DecisionsTable.tsx`) sends `registry.approve` from the connected wallet (`useRegistryTx(wallet.address)`). The registry accepts it only from an operator of the policy (`onlyOperator`). The builder's browser wallet holds the investor address, not the operator key, so the console shows "Connect the operator wallet to approve, revoke or attest" and the buttons stay disabled.
- The operator key exists in two places only: the hosted bridge's env on the server, and the local stack script's dev signer (`VITE_DEV_OPERATOR_KEY`, dev builds only; the hosted build is compiled without it, `docs/hosting-app-vercel.md`).
- The bridge has bearer-token routes that use its operator key: `POST /sessions/:id/approve`, `POST /sessions/:id/revoke`, `POST /sessions/:id/attest-operator`, `POST /revoke` (by address). Token: `BRIDGE_ISSUER_TOKEN` in `/var/lib/attestat/secrets/bridge.env` on the server; the app does not carry it and has no field for it. There is no approve-by-address route; approve is per session, and sessions live in the bridge's memory (`HashMap` behind a mutex, `service/src/session.rs`), so they are lost on a bridge restart.
- Consequence: on app.attestat.dev the journey always stops at "awaiting issuer approval" unless someone runs a local console with the dev signer, imports the operator key into a browser wallet, or calls the bridge route with the token from the server. This is the defect to fix (section 6).

## 4. What was done in this session (FACT)

1. Leftover local stack found and stopped. A stack from `scripts/browser-real-wallet-up.sh` started 2026-09-12 13:08 (run directory `docs/evidence/private/runs/20260912-130837-browser`, gitignored) was still running: Vite dev server pid 38034 on 127.0.0.1:62953, bridge pid 37277 on 127.0.0.1:62952, verifier-service pid 35828 on 127.0.0.1:62963, cloudflared tunnel pid 32042. It pointed at the real Sepolia registry with the same operator key, but had processed no session (bridge log 6 lines, tunnel log without the session id). It had been kept alive on 2026-09-12 night for the video take (`docs/wiki/handoff-2026-09-13.md`, "Today, in order", item 2). Stopped with `scripts/browser-real-wallet-down.sh <run dir>`; logs and the run's `issuer-token` file remain in the run directory. Also stopped: a stale `anvil --fork-url … --port 49326` from 2026-09-09 (pid 54715), unrelated to any run directory. The local stack was not the cause of anything the builder saw.
2. Approval sent from the shell with the deployer key in the repo root `.env` (gitignored; the key was not printed):
   `cast send 0xeD46dC…c8ad53 "approve(address,bytes32)" 0xFC619fFC5DA7d203C76e9a96a313946a2dD092ef 0xd27260…e3d05f --rpc-url https://ethereum-sepolia-rpc.publicnode.com --private-key "$DEPLOYER_PRIVATE_KEY"`
   Result: tx `0x99b11459f462c4da51b4045a79e7d433b6771af2705516b64306139de06fd4ba`, block 11696951, gas 53327, status 1. Registry after: `statusOf` = (true, true, false, 1790035200), `isEligible(subject, policy, 3)` = true. Registry event `Approved` by `0x452A…900a`.
3. The builder then exercised both doors on the hosted page (FACT, from the page and `Transfer` logs of the fund token):
   - Swap 1: tx `0x246cfed8aa43c482775f00822e0c4f951f82bd0044a7318f8dbb09b16d069f8e`, block 11696955, 100 mUSD for 47.535084 NDF.
   - Subscribe: tx `0x3c2401bf79920d97b21b7094cb0a153cfc555a532f2c1aad432e8028fc9d786a`, block 11696956, 100 NDF minted.
   - Swap 2: tx `0xd1d33c1c7f8eb71dce4c43b4abd5531e48474a1e40ffb5ea7f5c24a2596bf469`, block 11696991, gas 210834, 100 mUSD for 41.600639 NDF.
   - Fund token balance 189.135723261164184267 NDF; page journey reads approved, subscribed, swapped. Investor nonce 12, about 0.7487 Sepolia ETH left.
4. Nothing else. No commit, no push, no redeploy, no env change on the server, no key printed.

## 5. Where it stands now (FACT)

- Hosted app, bridge and relay: unchanged and up (`GET https://bridge.attestat.dev/health` returned ok, operator `0x452a…900a`, `issuer_routes: token`, `proof_mode: mock`, `require_address_proof: true`).
- Investor `0xFC61…92ef`: fully eligible on chain until 2026-09-22 00:00 UTC (decision expiry), holds NDF, doors open.
- Known stale display on that investor's page: the "Present your ID" card and the Eligibility card's bridge line still say "attested, awaiting issuer approval". Cause: the hosted bridge's in-memory session was never told about the approval, because it happened on the registry directly, not through the bridge's route. The app never downgrades the chain's answer (`app/src/App.tsx`, comment near line 20), so doors and events are right; only those two bridge-fed lines are wrong. A bridge restart would clear the session entirely (no display at all for that session).
- Local machine: no nachweis process running. Run directories under `docs/evidence/private/runs/` keep the logs.
- Two copy defects noticed, not fixed: the refusal texts say "After the issuer approves again" even when the address was never approved: `app/src/components/swap/calldata.ts:154` and `app/src/lib/chain.ts:241`.

## 6. Next step, proposed and not yet decided (OPINION, plan only)

Goal: an issuer can approve, revoke and attest-directly from the hosted issuer console in any browser, without holding the operator key in a wallet extension, and the bridge's view of a session can never go stale. Two options were put to the builder; the builder has not chosen yet.

Option 1 (recommended; keeps the two-step design that the product copy, the video and the submission text are built on):

1. Bridge (`service/src/api.rs`, `service/src/chain.rs`): add `POST /approve` by address (bearer token, symmetric to the existing `POST /revoke`); optionally `POST /attest-operator` by address. On `GET /sessions/:id`, re-read `approved` and `revoked` from the registry (`status_of`) and update the session before answering, so a chain-side approve or revoke is reflected. Keep `require_issuer` on every privileged route.
2. App issuer console: an "Issuer token" card (input, kept in `sessionStorage` only, never in the bundle or a query string). When a token is present and no operator wallet is connected, Approve, Revoke and "Attest directly" call the bridge routes with `Authorization: Bearer`; when an operator wallet is connected they sign as today; with neither, the buttons stay locked as today. `IssuerPending.tsx` and `DecisionsTable.tsx` both take the same `RegistryTx`-like interface, so one adapter in `app/src/lib/chain.ts` or a new `app/src/lib/issuerBridge.ts` covers both.
3. Tests: bridge `cargo test` for the new route (B-series in `docs/spec-issuer-approval.md` as the model), app typecheck, unit tests, Playwright issuer spec extended for the token path.
4. Deploy: bridge binary cross-built for `x86_64-unknown-linux-musl` and copied through `ssh cloud` as in `docs/hosting-server.md`; app rebuilt with the exports listed in `docs/hosting-server.md` (hosted worktree) and `vercel deploy --prebuilt --prod`. The token stays on the server and in the builder's password manager.
5. Docs: `docs/spec-issuer-approval.md` (new routes, console behaviour), `docs/hosting-server.md`, README issuer section, and the wiki log.

Option 2 (smaller, changes the product): a bridge flag such as `AUTO_APPROVE=true` that calls `approve` right after a successful `attestWithProof`. One env line on the server and a few lines in `service/src/api.rs`. It removes the separate issuer step everywhere the demo runs with that flag.

Not part of either option, but cheap while there: the two copy fixes in section 5, and a decision whether the Swap button should stay enabled while the door is closed (`SwapDoor.tsx` around line 203; today it is deliberate, to show the live refusal).

## 7. Commands that reproduce the reads (no side effects)

```
RPC=https://ethereum-sepolia-rpc.publicnode.com
REG=0xeD46dC419e826c9Fdf16aADe1C9e3e970cc8ad53
SUB=0xFC619fFC5DA7d203C76e9a96a313946a2dD092ef
POL=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f
cast call --rpc-url $RPC $REG "statusOf(address,bytes32)(bool,bool,bool,uint64)" $SUB $POL
cast call --rpc-url $RPC $REG "isEligible(address,bytes32,uint256)(bool)" $SUB $POL 3
cast logs --rpc-url $RPC --from-block 11696785 --address $REG "Approved(address,bytes32,address)" $SUB
curl -s https://bridge.attestat.dev/health
curl -s https://bridge.attestat.dev/sessions/b1c527f3-… | jq '{state, approved, tx_hash, approve_tx_hash}'
```

## 8. Do not

- Do not print or copy `DEPLOYER_PRIVATE_KEY`, `OPERATOR_PRIVATE_KEY` or `BRIDGE_ISSUER_TOKEN` anywhere; the local run directories contain an `issuer-token` file for the stopped local stack, unrelated to the hosted token.
- Do not commit anything under `docs/evidence/private/` or any `.env`.
- Do not restart the hosted bridge casually: its sessions are in memory.
