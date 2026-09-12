# Showcase: contractor payout desk (WP38)

A company pays freelance contractors in a test stablecoin from a treasury wallet that may only pay through one contract, GatedPayout, and GatedPayout pays only addresses that hold a live Attestat decision (AttestationRegistry.isEligible: approved, not revoked, not expired, identity evidence and over 18). The company never holds an identity document. Privy provides the treasury: a server wallet owned by a two-officer key quorum, confined by a Privy policy to that one contract.

Evidence class L (local, anvil) is green; the privy mode is built, its policy and quorum are checked live against the Privy API without funds (section 5), and the Sepolia run by hand is open (section 6). Nothing here is a wallet run, a device run or a deployment. Honesty rules: wiki product.md and the case page (privy-cases/other-buyer/case.md).

## 1. What it shows

- One decision, another door. The same `isEligible` read the fund token and the Uniswap pool use gates a stablecoin payout. contracts/src/showcase/GatedPayout.sol:46 to :62.
- Two controls that refuse in the same demo, on screen:
  - the gate (on chain): a payout to a revoked, expired, unapproved or unattested address reverts `NotEligible(address)`; the desk shows the contract's own revert text, obtained by an eth_call of `payout` per recipient (showcase/payout-desk/src/chain.ts:94, `previewRecipient`);
  - the policy (Privy): a plain `transfer` on the stablecoin, a call to the registry, a payout over the cap, a payout on another chain, or a request signed by one officer only are refused before anything is signed (section 5).
- Four eyes: officer A proposes a run, officer B approves, then the run executes. In privy mode with two officer keys both approvals become the two signatures of a 2-of-2 key quorum that Privy's TEE checks (showcase/payout-desk/src/privy.ts:18, src/signer.ts:98 to :112). With one key, or in local mode, the second approval is recorded by the service and captioned "simulated four-eyes" (src/server.ts:61, `approvalInfo`).

## 2. Parts

| Part | Path | Notes |
|---|---|---|
| Contract | contracts/src/showcase/GatedPayout.sol | immutables registry, token, policyId, requiredBits; `payout(address[] recipients, uint256[] amounts, uint256 total, bytes32 runRef)`; `eligibleOf(address[])`; events PaidOut, PayoutRun; errors NotEligible, LengthMismatch, TotalMismatch, EmptyRun, ZeroAmount. `total` is a scalar so a wallet policy can cap a run without summing an array; the contract checks that the amounts add up. |
| Tests | contracts/test/showcase/GatedPayout.t.sol | 14 tests: eligible paid, batch, preview, no decision, not approved (proof path, then approval opens), revoked, revoke after payment, expired, partial batch reverts whole, total mismatch, length mismatch, empty run, zero amount, no allowance. |
| Deploy | contracts/script/DeployPayout.s.sol | deploys MockStable (mUSD, 6 decimals) unless PAYOUT_TOKEN is set, mints MINT_AMOUNT to TREASURY, deploys GatedPayout against REGISTRY_ADDRESS. |
| Service | showcase/payout-desk/ | bun, `@privy-io/node` 0.34.0, `viem` 2.56.3. src/config.ts (env), src/policy.ts (the rule JSON and the local evaluator), src/chain.ts (reads, calldata, receipts from PaidOut logs), src/signer.ts (privy or local), src/privy.ts (client, authorization context), src/runs.ts (run store, four-eyes), src/server.ts (HTTP), src/setup.ts (one-time Privy setup and live check). test/: 18 unit tests (`bun test`). |
| Screen | app/src/showcase/payout-desk/ | PayoutDeskScreen.tsx (company screen), client.ts, config.ts (VITE_PAYOUT_DESK_URL, default http://127.0.0.1:8792), payout-desk.css. Registered in app/src/showcase/registry.ts; the route /showcase/:slug is app/src/showcase/ShowcaseRoute.tsx, wired in app/src/App.tsx. |
| Script | scripts/showcase-payout-desk-local.sh | the local run, prints `SHOWCASE-PAYOUT-DESK-LOCAL PASS`. |

The stablecoin is the repository's MockStable, "mUSD", 6 decimals, captioned test token. The desk stores nothing but addresses, labels, amounts and transaction hashes.

## 3. How to run, local mode (no Privy app, no funds)

```
scripts/showcase-payout-desk-local.sh          # about 5 s
scripts/showcase-payout-desk-local.sh --keep   # leaves anvil (8550) and the desk (8792) running
```

What it does, and what it prints: anvil on 8550; Deploy.s.sol (registry); DeployPayout.s.sol (mUSD, GatedPayout, 10,000 mUSD to the treasury, anvil key 3); contractor 1 (anvil 1) attested and approved with `attestByOperator` (operator path, captioned manual), contractor 2 (anvil 2) never attested; the desk in local mode, which issues the allowance for the gate through the simulated policy at startup; run 1 for both contractors (100 mUSD each): officer A proposes, officer A's own second approval answers 403, officer B approves, the run executes, contractor 1 receives 100 mUSD, contractor 2 is refused with `NotEligible(0x3C44...)` from the gate; revoke contractor 1 (operator key); run 2 for contractor 1: refused by the gate, nothing paid; re-approve; run 3 over the cap: refused by the simulated policy; bypass 1 (transfer on the stablecoin) and bypass 2 (approve on the registry from the treasury): refused by the simulated policy; the desk log holds no name marker. Last line:

```
SHOWCASE-PAYOUT-DESK-LOCAL PASS (3 s: paid 100 mUSD to the attested contractor, refused the unattested one, refused after revoke, refused over the cap, refused outside the gate)
```

With `--keep`, open the screen:

```
cd app && VITE_PAYOUT_DESK_URL=http://127.0.0.1:8792 VITE_RPC_URL=http://127.0.0.1:8550 VITE_CHAIN_ID=31337 VITE_REGISTRY=<registry from .e2e/payout-desk-local/summary.json> bun run dev
# then http://localhost:5173/showcase/payout-desk
```

Screenshot of the local run after the script: docs/showcase/payout-desk-local.png (the top bar says "local mode, Privy not connected").

Unit tests: `cd showcase/payout-desk && bun test` (18 pass) and `bun run typecheck`. Contract tests: `cd contracts && forge test --match-path 'test/showcase/*'` (14 pass).

## 4. The Privy features used

| Feature | Where | Line references |
|---|---|---|
| Server wallet (Ethereum), owner a key quorum, one policy attached | `privy.wallets().create({chain_type:'ethereum', owner_id, policy_ids})` | showcase/payout-desk/src/setup.ts:84 |
| Key quorum, 2-of-2, two P-256 authorization keys (officer A: the app's key "attestat-automation"; officer B: generated with the SDK's `generateP256KeyPair`) | `privy.keyQuorums().create({public_keys:[A,B], authorization_threshold:2})`, fallback 1-of-1 | src/setup.ts:57, :68, :74 |
| Policy, default DENY, two ALLOW rules on `eth_signTransaction` | `privy.policies().create({..., owner_id: quorum, rules})`; rules built in src/policy.ts:74 (`buildRules`) | src/setup.ts:81; update: src/setup.ts:99 |
| Rule 1 "payout through the gate": `ethereum_transaction.to == GatedPayout`, `chain_id == 11155111`, `ethereum_calldata.function_name == payout` (ABI inline), `ethereum_calldata.payout.total <= cap` | src/policy.ts:76 to :86 | |
| Rule 2 "allowance for the gate": `to == stablecoin`, `chain_id`, `function_name == approve`, `approve.spender == GatedPayout` | src/policy.ts:87 to :97 | |
| Signing under the policy with the quorum: `wallets().ethereum().signTransaction(walletId, {params, authorization_context:{authorization_private_keys:[A,B]}})`, the service broadcasts the signed transaction itself | src/signer.ts:98 to :114, src/privy.ts:18 | |
| Policy or quorum refusal surfaced verbatim (`PolicyDenied`) | src/signer.ts:118 to :119 | |
| Live check without funds | `bun run src/setup.ts check` | src/setup.ts:120 to :149 |

Why `eth_signTransaction` and not `eth_sendTransaction`: the desk builds nonce and fees with viem, Privy signs under the policy in its TEE, the desk broadcasts. This lets the policy be exercised on the real app today without Sepolia ETH (section 5), and it keeps the same code path for the funded run. A rule on `eth_sendTransaction` does not exist, so that method is denied by default like every other one.

Why the allowance rule exists: the treasury keeps custody of the stablecoin and GatedPayout pulls with `transferFrom`. The only way money leaves the treasury is an approve whose spender is the gate, followed by a payout the gate accepts. A plain `transfer` resolves no rule.

## 5. Privy identifiers and the live check (builder's app "Attestat", 2026-09-10, FACT)

Created with `bun run src/setup.ts create --officer-b-out <the builder's local config directory>/privy-payout-officer-b.env` (the officer B private key lives only in that file, mode 600; nothing secret is in this repository):

| What | Id |
|---|---|
| Key quorum "attestat-payout-officers", threshold 2 of 2 | `<key quorum id>` (withheld) |
| Policy "attestat-payout-treasury", owner the quorum, 2 ALLOW rules, default DENY | `<policy id>` (withheld) |
| Server wallet "attestat-payout-treasury", owner the quorum, policy attached | `<wallet id>` (withheld), address 0x1f6B95db18DEe1F6025f28912b6026c6Ab366AbE |

The 2-of-2 quorum was created by the API on the Free plan without a sales contact (the docs' "reach out" sentence for key quorums, evaluation.md 3.5, did not gate the call). The rules currently name the zero address as gate and token (no Sepolia deployment yet); `bun run src/setup.ts update-rules` rewrites them once GATED_PAYOUT and PAYOUT_TOKEN are known (the update is signed by both officer keys because the quorum owns the policy).

`bun run src/setup.ts check` against that wallet (signing requests only, no broadcast, chain 11155111 unless stated):

| Check | Result (verbatim API text) |
|---|---|
| 1. payout(100 mUSD) to the gate, both officer keys | SIGNED (376 bytes) |
| 2. payout(cap + 1) to the gate | REFUSED 400 `{"error":"RPC request denied due to policy violation","code":"policy_violation"}` |
| 3. approve(gate) on the stablecoin | SIGNED (182 bytes) |
| 4. transfer(contractor, 100 mUSD) on the stablecoin | REFUSED 400, policy_violation |
| 5. payout calldata to another contract | REFUSED 400, policy_violation |
| 6. payout(100 mUSD) to the gate with officer A only | REFUSED 401 `{"error":"Number of signatures in \`privy-authorization-signature\` header does not match the wallet's authorization threshold."}` |
| 7. payout(100 mUSD) to the gate on chain 1 | REFUSED 400, policy_violation |
| 8. personal_sign | REFUSED 400, policy_violation |

So on the real app: the calldata conditions (`function_name`, `payout.total`, `approve.spender`) evaluate on `eth_signTransaction`, the chain condition holds, the default deny covers other methods, and the quorum threshold is enforced by the API (401 with one signature).

## 6. Privy mode on Sepolia (builder, by hand; open)

1. Deploy: `REGISTRY_ADDRESS=<registry> TREASURY=0x1f6B95db18DEe1F6025f28912b6026c6Ab366AbE forge script script/DeployPayout.s.sol:DeployPayout --rpc-url sepolia --broadcast` (mints 10,000 mUSD to the treasury). Send Sepolia ETH to the treasury address for gas (the app has no gas credits, evaluation.md 11a).
2. `showcase/payout-desk/.env` from .env.example: PAYOUT_SIGNER=privy, the four PRIVY_* values from <the builder's local config directory>/privy.env (never into a tracked file), PRIVY_AUTHORIZATION_KEY_B from the officer B file, PRIVY_WALLET_ID, PRIVY_POLICY_ID, PRIVY_KEY_QUORUM_ID from section 5, RPC_URL, CHAIN_ID=11155111, REGISTRY, GATED_PAYOUT, PAYOUT_TOKEN, CONTRACTORS.
3. `bun run src/setup.ts update-rules` (writes the real gate and token into the policy), then `bun run src/setup.ts check` (expect the table of section 5 with the real addresses).
4. `bun run start`; at startup the desk issues approve(gate) through the policy (rule 2) and logs the hash.
5. App with VITE_PAYOUT_DESK_URL, VITE_REGISTRY and the Sepolia values; attest and approve a contractor through the issuer console (or the browser route with the official test wallet), then on /showcase/payout-desk: propose as officer A, approve as officer B, hash on screen; revoke on /issuer; propose again: refused by the gate; "Pay directly": refused by the policy.
6. Record in docs/evidence/payout-desk-sepolia-<date>.md: hashes, wallet id, policy id, quorum id, the refusal texts. No names, no keys.

## 7. Evidence template

```
# Payout desk, <class L|S>, <date>
Machine: <builder's M3 Max | other>
Registry, mUSD, GatedPayout, treasury: <addresses>
Privy: wallet <id>, policy <id>, key quorum <id> (2 of 2), app "Attestat" (development mode)
Run 1: proposed by A, approved by B, tx <hash>, paid <n> mUSD to <address>; refused: <address> NotEligible
Revoke tx <hash>; run 2 refused by the gate: NotEligible(<address>)
Bypass transfer: Privy refused (<status>): <text>
Bypass other contract: Privy refused (<status>): <text>
One-officer request: Privy refused (401): <text>
Names in the desk log: 0
```

## 8. On-screen sentences that touch identity, custody or Privy (verbatim)

- "Official test wallet, sample identity. No identity documents on chain, and nothing we could use to find her. A company paying contractors is not an AMLR obliged entity; this gate is capacity and age, not customer due diligence."
- "Eligible means: identity evidence and over 18, approved, not revoked, not expired. It does not mean one person per address."
- "Approval and revoke of a contractor's decision are manual steps by the issuer desk (/issuer). The gate is on chain, not in this service's database."
- "Treasury wallet by Privy: the company's payout wallet is a Privy server wallet owned by an officer key quorum, with a Privy policy that lets it sign only payout(...) through the GatedPayout contract on this chain (and the allowance for that gate). Privy sees addresses, amounts and calldata, never identity evidence. Sample identity from the official test wallet; testnet funds."
- "Second approval recorded by this service; Privy not connected (local mode). Simulated four-eyes." (local mode) and "Two-officer approval: the treasury wallet is owned by a 2-of-2 Privy key quorum; both officer keys sign every signing request and Privy refuses a request with one key." (privy mode with two keys)
- "The treasury may only pay through the gate. In local mode the refusal comes from the simulated policy checker; in privy mode from Privy's policy engine before anything is signed."
- "Both officer tokens live in this browser for the demo. In privy mode with two keys, each approval is a signature of that officer's authorization key."

## 9. Open

- Sepolia run (section 6): needs the funded deployer key and Sepolia ETH in the treasury; the desk's `sendRawTransaction` path after a Privy signature is untested on a public chain.
- Privy's transaction on the rule: the policy is on `eth_signTransaction` only. If the builder wants Privy to broadcast (`sendTransaction`), add the same two rules with method `eth_sendTransaction` and switch src/signer.ts; the local evaluator handles both methods.
- The screen's officers are two bearer tokens in one browser; a second browser with only officer B's token is the honest demo shape for the video.
- WP32's automation service (branch wp32-privy-standing-order) has the same module shapes (config, policy evaluator, signer, privy client); this desk mirrors them because WP32 is not on this branch. After both merge, one shared evaluator package is a small cleanup.
