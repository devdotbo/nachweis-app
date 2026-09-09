# Showcase: the attested savings plan (one decision, four doors, one revoke)

Branch `wp38-savings-plan`, case /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/lifecycle/case.md. Status on 2026-09-09: class L green (local chain, no Privy app: `scripts/showcase-savings-plan-local.sh` prints `SHOWCASE-SAVINGS-PLAN-LOCAL PASS`); class S (Sepolia with the builder's Privy app) not run. Nothing below with only local evidence is described as a Privy run or a wallet run.

## 1. What it shows

A retail investor holds one eligibility decision on chain (policy id, predicate bits, tier, expiry, status reference, revoked flag; no name, no document). Four consumers read it at every purchase, transfer or swap, and none of them keeps an allowlist of its own:

| Door | What reads the decision | Where |
|---|---|---|
| (a) Recurring plan | WP32's automation sends `subscribe()` from the investor's wallet under a policy copied from the decision; the chain re-checks `isEligible(msg.sender, ...)` at every run | `automation/src/tick.ts`, `contracts/src/Subscription.sol:25` |
| (b) Issuer B's instrument | A second FundToken (NDF-B) and its Subscription on the same registry and policy id, deployed by a second issuer key; its transfer check is the same `isEligible(to, ...)` | `contracts/script/DeploySecondIssuer.s.sol`, `contracts/src/FundToken.sol:61` to `:63` |
| (c) Permissioned pool | `EudiAllowlistChecker.checkAllowlist(account, token)`, the call the Uniswap v4 PermissionsAdapter makes before a swap; returns `0x0003` (swap and liquidity) or `0x0000` | `contracts/src/uniswap/EudiAllowlistChecker.sol:58` to `:60` |
| (d) Transfer to a second wallet | FundToken's transfer hook asks `isEligible` for the recipient; a transfer to an unattested address reverts with `NotEligible(address)` | `contracts/src/FundToken.sol:61` to `:63` |

Then the lifecycle: one `revoke` closes all four in one transaction; `approve` reopens them (manual, by the issuer); on a local chain `evm_increaseTime` past the decision's expiry closes all four again. The second wallet's own decision has its own expiry and is unaffected.

What the doors gate, exactly: FundToken checks the recipient, not the sender (`FundToken.sol:61`, `to != issuer` exempts redemption). After revoking investor A, a transfer from A to an attested wallet still goes through; a transfer to A does not. The script and the board test the transfer to A.

No contract changed. The AttestationRegistry is untouched. The second issuer is a deployment, not code.

## 2. How to run

Local, class L (anvil, automation in local mode, no Privy call):

```
scripts/showcase-savings-plan-local.sh            # prints SHOWCASE-SAVINGS-PLAN-LOCAL PASS in about 15 s
scripts/showcase-savings-plan-local.sh --app      # also starts Vite and prints http://127.0.0.1:<port>/showcase/savings-plan
```

The script: anvil; `Deploy.s.sol` (issuer A = anvil key 0); `DeploySecondIssuer.s.sol` (issuer B = anvil key 4, `REGISTRY_ADDRESS` set to the first deployment); `forge create` of `EudiAllowlistChecker(registry, policyId, 3)`; the automation with `AUTOMATION_SIGNER=local` and anvil key 1 as investor A's key; `attestByOperator` for A (expiry chain time + 180 s) and for B (anvil key 2); two plan runs (200 NDF); `subscribe()` on Subscription B from A's wallet (50 NDF-B) and a refusal for an unattested caller; checker flags `0x0003` for A and `0x0000` for an unattested address; a 20 NDF transfer A to B (180 / 20) and a refused transfer to an unattested address (`NotEligible(address)` in the revert data); `revoke(A)`: plan run refused by the policy ("decision revoked: deny everything") and the chain's own `eth_call` refuses too, Subscription B reverts with `NotEligible()`, a transfer to A reverts, checker `0x0000`; `approve(A)`: plan run OK (280 NDF), checker `0x0003`; `evm_increaseTime 200`: plan run refused ("decision expired: deny everything"), Subscription B, transfer to A and checker all closed, B still eligible. Run history for A: `1:ok 2:ok 3:denied-policy 4:ok 5:denied-policy`. Addresses land in `.e2e/showcase-savings-plan/env.json`.

With `--app`, the Vite dev server gets the dev signer (investor A = anvil key 1, operator = anvil key 0), `VITE_PRIVY_APP_ID` forced empty, the second issuer, the checker and the second wallet as prefilled recipient. The board's beats then run from the page: Attest by operator (with an empty recipient it attests investor A again, since the script left A expired), Run the month, Subscribe with Issuer B, Transfer 20 NDF, Revoke, Re-approve, Move the clock past the expiry.

Privy mode (class S, the builder clicks): the WP32 stack on Sepolia (docs/privy-standing-order.md sections 6 and 7) plus `VITE_FUND_TOKEN_B`, `VITE_SUBSCRIPTION_B` from a `DeploySecondIssuer.s.sol` run with `REGISTRY_ADDRESS` set to the Sepolia registry, and `VITE_CHECKER` from the pool onboarding (`CreatePermissionedPool.s.sol` prints the checker). The investor signs in with email; the Standing order card (Allow, Run the month, Remove signer) sits under the board; revoke and approve run from the issuer console at `/issuer` and the board reads the doors again within one poll (4 s). The expiry beat is disabled on Sepolia.

## 3. The board

Route `/showcase/savings-plan` (`app/src/App.tsx:104`, registry `app/src/showcase/registry.ts`), code in `app/src/showcase/savings-plan/`:

- `SavingsPlanBoard.tsx`: the decision in the centre (`decisionOf`, `statusOf`, `isEligible`, every 8 s), the four doors around it, the beats, and the honesty list. The door chips are each a live read: plan = `isEligible` and the automation's policy (delegated, no deny-all); Issuer B = `isEligible` plus FundToken B's own `registry()` and `policyId()` compared with the app's; pool = the checker's flags, or the registry read when no checker is configured; transfer = `isEligible(recipient)`.
- `hooks.ts`: reads (wagmi, 4 s), investor writes from the connected wallet (`useInvestorWrites` :65, Subscribe with Issuer B and Transfer), operator beats with the dev operator key when the build carries one (`useOperatorBeats` :99: attestByOperator, approve, revoke; `warp` :135 moves anvil's clock to one minute past the decision's expiry). Without the key the beats card links to the issuer console.
- `config.ts`: `VITE_FUND_TOKEN_B`, `VITE_SUBSCRIPTION_B`, `VITE_CHECKER`, `VITE_SHOWCASE_SECOND_WALLET`, `VITE_SHOWCASE_UNATTESTED`, all optional.

Additive changes to WP32: `automation/src/store.ts` `addRun` :64 and `runsFor` :71 (a run history per investor, filled by `tick.ts` after every tick); `automation/src/server.ts` `GET /runs/:address` :100, `runs`, `planAmount` (the Subscription's `demoAmount`) and `planIntervalSecs` in `GET /status`, and an optional `PLAN_INTERVAL_SECS` timer that runs the tick on a schedule (unset: the Run the month button is the only scheduler, captioned so); `automation/src/config.ts` helpers now read the env passed to `loadConfig` (needed by the tests); `app/src/lib/automation.ts` `automation.runs`. `StandingOrderCard.tsx` is reused unchanged. Tests: `automation/test/store.test.ts` (3) next to the 13 WP32 policy tests.

## 4. Privy features used

Only with `VITE_PRIVY_APP_ID` set (class S); none of them runs in the local script.

| Feature | Where |
|---|---|
| Embedded wallet at email sign-in (`createOnLogin: 'users-without-wallets'`) | `app/src/lib/PrivyWalletProvider.tsx:84` to `:88` |
| Signer on the investor's wallet with an override policy, `useSigners().addSigners({address, signers: [{signerId, policyIds}]})` | `app/src/lib/PrivyWalletProvider.tsx:52`, button `app/src/components/StandingOrderCard.tsx:58` |
| `removeSigners` by the investor | `app/src/lib/PrivyWalletProvider.tsx:59`, button `StandingOrderCard.tsx:75` |
| Policy built from the on-chain decision (deny after expiry, allow only `subscribe()` on the Subscription contract, deny-all after Revoked) | `automation/src/policy.ts:52`, `:73`; watcher `automation/src/watch.ts` |
| Server-side send as the delegated signer, `wallets().ethereum().sendTransaction(walletId, {caip2, ...})` | `automation/src/signer.ts:94` to `:95` |
| Local stand-in ("simulated Privy policy (local)"): the evaluator at `automation/src/policy.ts:175`, called from `signer.ts:69` | class L only |

## 5. On-screen sentences touching identity, custody or Privy (verbatim, case section 8)

- "Official test wallet, sample identity."
- "No identity documents on chain, and nothing we could use to find her."
- "Proof made in your browser tab on this computer." (shown as "Investor portal route: ..." because this board creates no proof)
- "Demo subscription: mints fund tokens, no payment."
- "Second investor attested by the operator for the demo."
- "Expiry demonstrated on a local chain."
- "Manual: issuer revokes; issuer reopens."
- "Issuer B accepts the eligibility decision as its on-chain gate; its own customer file is its own duty."
- With Privy on: the two verbatim Privy sentences from case section 8 (under the connect card and under the plan card), plus the WP32 card's own captions.
- Without Privy: "Plan door without a Privy app: simulated Privy policy (local), a dev key signs on anvil and the rule JSON is applied by a small evaluator."

No "first", no "only", no yield figure, no "KYC". Privy is named on screen only when `VITE_PRIVY_APP_ID` is set.

## 6. Evidence

| Class | What | Result | Record |
|---|---|---|---|
| L | `scripts/showcase-savings-plan-local.sh` | PASS, about 15 s on the M3 Max; run history `1:ok 2:ok 3:denied-policy 4:ok 5:denied-policy` | this file, 2026-09-09 |
| L | Board walked headless (connect dev signer, attest, run, transfer, subscribe B, revoke, re-approve, warp): four chips open, four closed on revoke, open on re-approve, closed on expiry; no page errors | 2026-09-09, not committed as a spec |
| L | Suites: forge 119 passed, 0 failed, 20 skipped (same as main); automation 16 pass; app typecheck and build with and without the app id; app-e2e sp1-mock 1 passed, 2 skipped | 2026-09-09 |
| S | Sepolia with the Privy app: email sign-in, Allow, two runs while the tab is closed, Issuer B subscribe, transfer, revoke from the issuer console | not run | template below |

Evidence template (class S, fill with hashes, never with an email address or a key):

```
date, chain: Sepolia; app id (public), signer id (public); registry, NDF, Subscription, NDF-B, Subscription B, checker
investor A (embedded wallet address), investor B (address), unattested address
attest A / approve: tx; addSigners: policy id shown on the card
plan run 1, run 2: tx hashes, gas; Issuer B subscribe: tx; transfer A -> B: tx; transfer A -> unattested: error text
revoke: tx; plan run 3: Privy's refusal (status, message verbatim); Issuer B: revert; transfer to A: revert; checker flags
approve again: tx; plan run 4: tx
removeSigners: confirmed on the card
```

## 7. Left open

- Class S has not run: no Sepolia deployment exists yet (handoff action 1), so nothing here is a Privy run.
- The pool door reads the checker, not a swap. The real swap door is WP35's (branch `wp35-swap-ui`); this demo does not depend on it. On a local chain the script deploys the checker alone; there is no pool on anvil.
- The expiry beat is local only; on Sepolia the decision expires on its own date.
- A Playwright spec for the board is not committed; the headless walk above was run by hand and is easy to turn into `app/e2e/savings-plan.spec.ts` against the `--app` stack.
