# Showcase: compliance desk (WP38, "backoffice")

Status 2026-09-09: built on branch wp38-backoffice, green locally (desk unit tests, app typecheck and build, local end-to-end on anvil), Privy side bootstrapped live on the builder's app "Attestat" (ids below), not deployed to Sepolia. Case page: docs/wiki/privy-cases/backoffice/case.md.

## What it shows

A fund issuer's compliance desk approves and withdraws investor wallets under a four-eyes rule, and no desk member holds an identity document or a free-signing key. The investor's EUDI evidence is already proven on chain (Attested); the AttestationRegistry refuses `approve` for any address without evidence (`NoDecision`); and the registry's only operator is a Privy server wallet whose policy allows `approve` and `revoke` on the registry and nothing else, owned by a 2 of 2 key quorum of the compliance officer's key and the operations officer's key.

The desk sees an address and its evidence. The issuer's compliance file stays with the issuer.

Flow on screen (/showcase/backoffice):

1. Operator wallet card: address, key custody, the quorum (2 of 2), the policy in plain words and as the rule JSON sent to Privy.
2. Queue: the desk watched an Attested event and proposed an approve, "0 of 2". Acting as compliance, Confirm: "1 of 2", nothing sent. Acting as operations, Confirm: the desk sends one `approve` signed by both keys; the receipt appears; `isEligible` is true; Subscribe on the fund token opens.
3. Refusals: a 1 wei transfer, `attestByOperator`, `approve` with one signature, and a plain `personal_sign`. Each is refused before signing, by the policy or by the quorum. In privy mode the text is Privy's, verbatim; in local mode the desk's own checker plays the policy and the count, captioned simulated. In privy mode with an unfunded wallet, the two transaction probes are stopped by Privy's funds pre-check before the policy is consulted; the panel says so ("inconclusive") instead of claiming a policy verdict. The `personal_sign` probe is the conclusive one without gas: `400 policy_violation`.
4. Manual withdrawal: propose revoke, two confirmations, one `revoke`. Subscribe closes.
5. No evidence, no approval: approve for a stranger address with two confirmations reverts `NoDecision` on the registry.
6. Registry events (the chain's own audit trail) and the honesty box.

## Pieces

| Piece | Path |
|---|---|
| Desk service (bun, @privy-io/node 0.34.0) | showcase/backoffice/src/ (server.ts routes, desk.ts queue and watcher, operator.ts local and Privy signer, policy.ts rule builder and simulated evaluator, chain.ts viem) |
| One-time Privy bootstrap and live probes | showcase/backoffice/scripts/bootstrap-privy.ts, probe-privy.ts |
| Unit tests | showcase/backoffice/test/policy.test.ts, desk.test.ts |
| App panel | app/src/showcase/backoffice/BackofficeDesk.tsx, api.ts |
| Showcase route wiring | app/src/showcase/registry.ts (one line per demo), ShowcaseRoute.tsx, one Route in app/src/App.tsx |
| Local run | scripts/showcase-backoffice-local.sh |

Contracts: unchanged. Deploy.s.sol already takes `OPERATOR_ADDRESS`; the Privy wallet's address (privy mode) or anvil account 3 (local mode) is passed there, so the deployer is registry owner but not an operator.

## How to run

Local mode (evidence class L, no Privy app, nothing leaves the machine):

    scripts/showcase-backoffice-local.sh            # prints SHOWCASE-BACKOFFICE-LOCAL PASS
    scripts/showcase-backoffice-local.sh --keep     # also starts the app: http://127.0.0.1:5179/showcase/backoffice

The script: anvil (port 8548), Deploy.s.sol with the desk operator, MockProofVerifier as the policy's verifier (simulated evidence), the desk in local mode (port 8794), `attestWithProof` from the investor, the desk proposes, compliance confirms (not eligible), operations confirms (approve mined by the operator wallet, isEligible true, subscribe mined), three refusals, revoke with two confirmations (subscribe refused), stranger approve reverts NoDecision.

Tests:

    cd showcase/backoffice && bun install && bun test && bun run typecheck
    cd app && bun run typecheck && bun run build

Privy mode (the builder, by hand; Sepolia):

1. `source <the builder's local config directory>/privy.env` in a shell (PRIVY_APP_ID and PRIVY_APP_SECRET; nothing from that file is written anywhere by the scripts).
2. Once: `cd showcase/backoffice && bun run scripts/bootstrap-privy.ts` creates two P-256 keys, the 2 of 2 quorum, the policy (owner: the quorum) and the wallet, and writes showcase/backoffice/.env (gitignored, mode 600) with the officer keys and the ids. Already done on 2026-09-09, see "Privy ids".
3. Deploy with the wallet as operator: `OPERATOR_ADDRESS=<wallet address> forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --broadcast`, then point the policy at the registry: `bun run scripts/bootstrap-privy.ts --set-registry <registry>` (both officer keys sign the policy update; the quorum owns the policy).
4. Fund the wallet with Sepolia ETH for gas.
5. `cd showcase/backoffice && REGISTRY=<registry> FUND_TOKEN=<token> RPC_URL=<sepolia rpc> bun run src/server.ts` (the rest comes from .env), and `VITE_BACKOFFICE_URL=http://127.0.0.1:8794` plus the Sepolia addresses for the app.
6. Live checks without funds: `bun run scripts/probe-privy.ts` (wallet owner and policy, personal_sign refused by policy, wallet update with one key refused by the quorum and accepted with two, approve passes the policy, 1 wei transfer refused by policy).

## The Privy features used

- Server wallet, app-owned, `chain_type: 'ethereum'`, created with `owner_id` = the key quorum and `policy_ids` = [the policy] in one call: showcase/backoffice/scripts/bootstrap-privy.ts:94. Privy: "Your app's wallet environment ... TEE enabled" (dashboard, evaluation.md 11a).
- Key quorum 2 of 2 of two P-256 authorization keys (`keyQuorums().create` with `authorization_threshold: 2`): showcase/backoffice/scripts/bootstrap-privy.ts:64. Signing: both keys in `authorization_context.authorization_private_keys` of one request: showcase/backoffice/src/operator.ts:124 (PrivyOperator.send). Privy checks the count: with one key the API answers `401 invalid_data: Number of signatures in privy-authorization-signature header does not match the wallet's authorization threshold.` (live, 2026-09-09).
- Policy "attestat-backoffice-registry-operator", two ALLOW rules on `eth_sendTransaction`: `to` equals the registry, `chain_id` in [31337, 11155111], `ethereum_calldata.function_name` equals `approve` or `revoke` with the registry ABI entry; default DENY for everything else: showcase/backoffice/src/policy.ts:42 (registryOperatorRules), sent by bootstrap-privy.ts:79 with `owner_id` = the quorum, so a rule change also needs both officers (bootstrap-privy.ts:41, `--set-registry`). The same rule JSON is what the local mode evaluates (policy.ts:104, simulated).
- Refusal before signing: Privy's `APIError` is mapped to a refusal with the verbatim text and Privy's error code: showcase/backoffice/src/operator.ts:179 (toRefused). Observed codes: `policy_violation` (policy), `invalid_data` with the threshold sentence (quorum), `transaction_broadcast_failure` (Privy's funds and gas pre-check, answered before the policy; reported as inconclusive, never as a policy verdict).

Not used, and why: intents (the asynchronous propose-and-authorize flow in the case page). The Node SDK 0.34.0 has no `intents.authorize` method (evaluation.md 3.5) and the dashboard shows no Intents page (11a). The four-eyes rule is therefore synchronous: the desk records each officer's confirmation and, once both are in, sends one request signed by both keys. Two keys on one demo server; in production each desk holds its own key and the request would be assembled from two signatures (the comma-separated `privy-authorization-signature` header, Privy docs).

## Four-eyes mechanism shipped

2 of 2 key quorum as the wallet owner, synchronous two-key signing in one request. Fallbacks in the brief (1 of 1 key plus an application-level second approver in statusRef) were not needed: the quorum was created through the API on the Free plan without a sales contact (see "Privy ids").

## Privy ids (no secrets)

Created live on 2026-09-09 by `bun run scripts/bootstrap-privy.ts` on the builder's app "Attestat" (app id cmttciu77003c0bjv4xvdmupe, Free plan, TEE enabled), no sales contact, every call accepted at the first attempt:

| Object | Id |
|---|---|
| Key quorum "attestat-backoffice-desk", 2 of 2 (compliance key, operations key) | xmyxk0g9u7zuii9qe16gfoz3 |
| Policy "attestat-backoffice-registry-operator", owner: that quorum | qa7rgjwdbvy03ewug8oaq9k1 |
| Server wallet "attestat-backoffice-operator", owner: that quorum, policy: that policy | jabcvi80nv2dx5tkes25lo62 at 0xa7d474A830F9FCe684a68a51f356f1cA0e9bf625 |

The policy's `to` is the first anvil deployment address (0x5FbDB2315678afecb367f032d93F642f64180aa3) until `--set-registry` points it at the Sepolia registry. The two officer private keys exist only in showcase/backoffice/.env (gitignored, mode 600) on the builder's machine.

Live probe results (`bun run scripts/probe-privy.ts`, 2026-09-09, wallet unfunded, verbatim):

1. PASS wallet owner_id = the quorum, policy_ids = [the policy].
2. PASS personal_sign with both keys: `400 {"error":"RPC request denied due to policy violation","code":"policy_violation"}`.
3. PASS wallet update with one key: `401 {"error":"Number of signatures in `privy-authorization-signature` header does not match the wallet's authorization threshold.","code":"invalid_data"}`.
4. PASS the same update with both keys: accepted.
5. PASS approve(0x...01) to the registry on eip155:11155111 with both keys passes the policy and fails on gas: `400 {"error":"Transaction creation failed. Details: insufficient funds for gas * price + value: have 0 want 30910024788172","code":"transaction_broadcast_failure"}`.
6. INCONCLUSIVE 1 wei to 0x...dEaD with both keys: `400 transaction_broadcast_failure ... insufficient funds for gas * price + value: have 0 want 1`. Privy checked the balance before the policy; the policy's verdict on a transfer is only visible with a funded wallet (Sepolia step 4).

## Honesty lines on screen

- "Two officers, one operator wallet, one policy. This desk sees an address and its evidence. The issuer's compliance file stays with the issuer."
- Local mode banner: "Local mode, simulated. The operator is a dev key on this machine; the 2 of 2 quorum and the policy are played by the desk itself. In privy mode Privy's secure enclave enforces both."
- "Withdrawal is manual: one officer proposes revoke, the other confirms."
- "Official test wallet, sample identity on the investor side; in the local run the evidence comes from a mock proof verifier (simulated). No identity documents on chain, and nothing we could use to find her. Withdrawal is manual. Two authorization keys live on one demo server; in production each desk holds its own key. Operator wallet by Privy in privy mode: a server wallet whose key is reconstituted only inside Privy's secure enclave (Privy's wording), owned by a two-key quorum of the issuer's compliance and operations desks, and bound by a policy that allows approve and revoke on the AttestationRegistry and nothing else. Privy sees this wallet's transactions; it never sees identity evidence."

## Evidence template

| Check | Class | Result | Record |
|---|---|---|---|
| scripts/showcase-backoffice-local.sh | L | SHOWCASE-BACKOFFICE-LOCAL PASS | this file, "Runs" |
| Desk unit tests (bun test 35), app typecheck and build, forge 152 passed 0 failed 20 skipped (recount on main 46d8349, 2026-09-09; 119 passed on the branch run below), app-e2e sp1-mock 1 passed | L | green 2026-09-09 | this file |
| Bootstrap: quorum, policy, wallet ids | Privy API, no chain | ids below | this file |
| probe-privy.ts: one key refused, two keys accepted; personal_sign refused by policy; approve passes the policy; transfer inconclusive (funds pre-check) | Privy API, no chain | done 2026-09-09, texts above | this file |
| Sepolia: approve from the Privy wallet after two confirmations, Approved event with the wallet as operator; revoke; refused transfer | S | open (needs deployment and gas) | docs/evidence/<date>.md |

## Runs

- 2026-09-09, builder's M3 Max, branch wp38-backoffice after the merge of main a4766c2: `scripts/showcase-backoffice-local.sh` printed SHOWCASE-BACKOFFICE-LOCAL PASS (approve 53,327 gas by the operator wallet after two confirmations; revoke after two confirmations; stranger approve reverted before broadcast with NoDecision; four refusals, simulated). Desk `bun test` 35 pass; app `tsc` and `vite build` clean; forge 119 passed, 20 skipped without RPC (152 passed, 0 failed, 20 skipped after the later merges, recount on main 46d8349 with `cd contracts && forge test`, 2026-09-09); app-e2e sp1-mock 1 passed, 2 skipped by mode.

## Open

- Sepolia (class S): deploy with the wallet as operator, `--set-registry`, fund the wallet, then the panel in privy mode: approve after two confirmations (Approved event with 0xa7d4...f625 as operator), revoke, and the transfer probe's real policy verdict.
- Intents (asynchronous authorize from two places) are not used; see "Not used".
- The desk's queue is in memory; a restart re-proposes from the watcher's start block (local: block 0; privy: the head, or START_BLOCK).
