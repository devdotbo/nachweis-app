---
type: plan
title: Privy case, back office: a document-blind compliance desk for the issuer's allowlist
updated: 2026-09-09
sources:
  - /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/BRIEF.md (2026-09-09)
  - /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/backoffice/research.md (all Privy pages fetched 2026-09-09, URLs there)
  - /Users/bioharz/git/ethglobal/nachweis/wiki/handoff-fable-2026-09-09.md, product.md, spec-privy.md
  - /Users/bioharz/git/ethglobal/nachweis-app main 5f5ceb9 (opus inventory 2026-09-09, read-only)
  - https://ethglobal.com/events/ethonline2026/prizes/privy (prize text as pasted in the brief, 2026-09-09)
---

# Back office: a document-blind compliance desk

## 1. Sentence

A fund issuer's compliance desk can approve and withdraw investor wallets under a four-eyes rule, with no desk member holding an identity document or a free-signing key, because the investor's EUDI evidence is already proven on chain and the AttestationRegistry refuses any approval without it, with Privy providing the operator wallet as a server wallet owned by a two-key quorum, bound by a policy that permits only approve and revoke on the registry, and driven by intents raised from the registry's own Attested events.

## 2. Who buys and who uses

Buyer: the issuer, transfer agent or launchpad that owns the gate (product.md, "Who buys"). It pays because the gate is a liability it already runs: an allowlist key, an ops team, and a compliance file that both must touch today.

Users: two desks inside that buyer. The compliance desk decides that an address with evidence may hold the instrument. The operations desk co-signs approvals and can withdraw an address alone in an emergency. Neither desk holds the operator's private key; Privy's enclave holds it and each desk holds one P-256 authorization key.

Money that moves: none through the operator wallet, by design. The fund token is minted to the investor by Subscribe (contracts/src/Subscription.sol:23 to 28) and traded in the permissioned pool; the desk's wallet can only write eligibility. The buyer pays for the control, not for a money flow.

## 3. Otherwise not possible

FACT (repository): the registry separates evidence from approval. `attestWithProof` is permissionless and never approves; `approve` is operator-only and reverts `NoDecision` when no evidence exists for the address (contracts/src/AttestationRegistry.sol:114 and :155; contracts/test/Nachweis.t.sol:375). One revoke closes the token transfer hook and the pool checker (Nachweis.t.sol:513, EudiAllowlistChecker.t.sol:116).

FACT (repository): the only operator today is anvil account 0, which is also the deployer, the registry owner and the bridge's key (scripts/real-proof-local.sh:51 to 52 and :167). Approve and revoke are either an HTTP call to the bridge behind a bearer token (scripts/real-proof-local.sh:210 and :228) or a browser click with the dev operator connector (scripts/browser-real-wallet-up.sh:253). Any holder of that key can also mint, move funds and change verifiers.

CLAIM (product.md, product-pitch-legal memo): the issuer is the obliged entity; its compliance file stays with it (AMLR Art 22 and Art 77); Attestat carries eligibility, not onboarding.

OPINION, the enabling difference: today an allowlist approval is an act of document custody. The address itself carries nothing, so the person who approves it must be the person who has seen the file, and the key that writes the allowlist sits with that person or with a multisig of such people. With EUDI evidence proven on chain and bound to the address, the approval act needs only the address, the evidence bits and the issuer's own record reference; the contract refuses to approve anything else. That is what makes a document-blind desk possible: a wallet whose entire authority is "confirm or withdraw eligibility for addresses that brought evidence", governed by who may sign and when, not by who may open the file. COUNT 0 live products accept an external attestation without a contract (live-gated-products memo, cited in product.md), so no issuer runs such a desk today.

What Privy adds that a plain multisig does not: the policy is enforced in the enclave before signing ("Defaults to DENY if no rules resolve", research.md section 2), so the desk wallet cannot be talked into a mint or a transfer even by a majority of its own keys, and the approval itself is an asynchronous intent that two people authorize from two places.

## 4. Privy as core

Wallet: one app-owned server wallet, `chain_type: 'ethereum'`, created with `owner_id` set to a key quorum (research.md 1). Its address is passed as `OPERATOR_ADDRESS` to Deploy.s.sol (contracts/script/Deploy.s.sol:22 to 32), so it is the sole operator of the policy id. No contract changes.

Controls, all three named in the prize text:

- Policy "Registry operator" (owner: the same quorum): ALLOW `eth_sendTransaction` and `eth_signTransaction` when `ethereum_transaction.to` equals the registry, `chain_id` is 31337 or 11155111, and `ethereum_calldata.function_name` is `approve` or `revoke` with the registry ABI. Nothing else is allowed, so everything else is denied by default.
- Key quorum "Compliance desk", 2-of-2: the compliance authorization key and the operations authorization key. Owner of the wallet and of both policies.
- Additional signer "Operations emergency" (the operations key alone) with `override_policy_ids` set to a second policy that allows only `revoke` on the registry and only while `current_unix_timestamp` is below a rotation date (research.md 2, time-bound example).
- Intents: the back-office service proposes an `eth_sendTransaction` intent for `approve(subject, policyId)`; each desk authorizes with its own key; Privy executes at 2 of 2 (research.md 4).

Why core and not decoration: with the Privy wallet as the only operator, nothing in the system can approve without it. Remove Privy and the demo has no approver.

Prize mapping, B2B financial product (primary):

| Requirement | Artifact |
|---|---|
| Privy as a core part | The operator of the registry is the Privy server wallet; bridge and app never hold an operator key |
| Create or use at least one Privy wallet | backoffice/scripts/bootstrap.ts creates the server wallet; address recorded in docs/evidence |
| Business or organization use case | Issuer compliance desk and operations desk, two keys, one quorum |
| At least one functional B2B workflow | Approval flow: Attested event, intent, two authorizations, on-chain approve. Wallet administration: rotate the emergency signer by an update-wallet intent |
| At least one Privy control | Policy, key quorum, intents (three) |
| Working demo and source | scripts/backoffice-up.sh, scripts/backoffice-local.sh, README section |
| Explain how Privy enables it | On-screen sentence in section 8 and README |

Financial flow track: not met by this case. The operator wallet moves no digital assets, and the prize text's list (transfers, swaps, Earn, onramps) does not include an allowlist write. It would be met only by adding a treasury leg (a Privy treasury wallet paying redemptions), which is a second integration and is left to the investor-side cases.

## 5. The flow, as in the demo video

1. Issuer screen, new "Compliance desk" panel: operator wallet address, "owner: key quorum 2 of 2", "policy: approve and revoke on the registry, nothing else", "emergency signer: operations, revoke only, valid until <date>". Caption: the Privy sentence from section 8.
2. Investor screen (unchanged, WP30): QR, the official test wallet on the iPhone presents, the browser tab proves in about 11 s, the bridge sends `attestWithProof`. Event log: Attested, hash. Caption: "official test wallet, sample identity; proof made in the browser tab".
3. Compliance desk panel: the watcher saw Attested and proposed an approval intent, "0 of 2". Role toggle "Compliance", click Approve: "1 of 2, authorized by compliance". Toggle "Operations", click Approve: Privy executes; Approved event with hash appears in the log. Caption: "two keys, one demo server; in production each desk holds its own key".
4. Investor: Subscribe, 100 NDF; swap in the permissioned pool (existing beat).
5. Refusal by policy: panel button "Try to send 0.01 ETH from the operator wallet". Privy returns a policy violation; the error text is shown verbatim. Caption: "refused by the wallet policy, before signing".
6. Refusal by evidence: "Approve a stranger address" proposes an intent, both desks authorize, the transaction reverts `NoDecision`, the intent shows Failed. Caption: "no evidence, no approval, even with two signatures".
7. Revoke: toggle "Operations", click "Emergency revoke": one signature, Revoked event. Investor Subscribe is refused (`NotEligible`), the checker returns no permission. Caption: "manual withdrawal".
8. Expiry (short): the panel lists decisions expiring within 7 days from `decisionOf` reads. Caption: "renewal is manual in this build".

Chain: anvil for evidence class L; Sepolia once the builder's key and Privy app exist.

## 6. What changes in the code

New directory `backoffice/` (bun, TypeScript):

- `backoffice/src/privy.ts`: `PrivyClient` from `@privy-io/node` 0.34.0; the two authorization keys in an `AuthorizationContext`; helpers to propose and authorize intents and to fetch their status.
- `backoffice/src/watcher.ts`: viem `watchContractEvent` on Attested; proposes the approve intent; polls intents every 5 s (webhooks are Enterprise in production, free only in development, research.md 5, so polling is the default and a webhook route is optional).
- `backoffice/src/server.ts`: `GET /desk`, `GET /intents`, `POST /intents/approve`, `POST /intents/:id/authorize` (body: role), `POST /revoke` (operations key, single signature), `POST /probe/transfer` (the policy refusal beat), `GET /expiring`.
- `backoffice/src/local.ts`: `BACKOFFICE_MODE=local` signs with a plain viem account (anvil account 0) and simulates the 2-of-2 count in memory, so every script and Playwright run works with no Privy app.
- `backoffice/scripts/bootstrap.ts`: one-time, with the builder's app id and secret: generate two P-256 keys, create the quorum, the two policies and the wallet, print the ids; secrets go to a gitignored `.env.backoffice`.
- `backoffice/README.md`, `backoffice/.env.example`, `backoffice/package.json`.

Changed: `app/src/screens/IssuerScreen.tsx` mounts a new `app/src/components/BackOfficeDesk.tsx` when `VITE_BACKOFFICE_URL` is set; `app/src/config.ts` parses it; `app/.env.example` documents it. `scripts/backoffice-up.sh` (anvil, Deploy with `OPERATOR_ADDRESS` set to the wallet address, fund it from account 0, bridge, back-office service, Vite) and `scripts/backoffice-local.sh` (the acceptance run below). README section "Privy" with file and line references.

Unchanged: contracts/, service/ (the bridge keeps attesting; its approve and revoke routes stay off because `BRIDGE_ISSUER_TOKEN` is unset and its key is no longer an operator), circuits, companion, provers, the investor screen, existing scripts.

Dependencies: `@privy-io/node` 0.34.0, viem (already 2.56.x in app). Env vars: `BACKOFFICE_MODE` (privy or local), `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_COMPLIANCE_AUTH_KEY`, `PRIVY_OPS_AUTH_KEY`, `PRIVY_OPERATOR_WALLET_ID`, `PRIVY_QUORUM_ID`, `PRIVY_POLICY_ID`, `PRIVY_REVOKE_POLICY_ID`, `RPC_URL`, `REGISTRY`, `POLICY_ID`, `CHAIN_ID`, `VITE_BACKOFFICE_URL`.

Anvil versus Sepolia: on Sepolia the intent is `eth_sendTransaction` with `caip2: 'eip155:11155111'` and Privy broadcasts (documented, research.md 2). On anvil the intent is `eth_signTransaction` with `chain_id: 31337` and the watcher broadcasts the returned raw transaction to anvil; whether the enclave signs for chain id 31337 is unverified, so the local Privy run is a stretch and `BACKOFFICE_MODE=local` is the guaranteed L path.

## 7. Evidence plan

Green by 2026-09-12 with class L and no Privy app: tests 1 to 3. Needs the builder's Privy app (free Developer plan): tests 4 to 7 on anvil if 31337 signing works, otherwise on Sepolia after the deployment (class S).

1. `scripts/backoffice-local.sh` with `BACKOFFICE_MODE=local`: attest via the bridge, watcher proposes, two authorize calls, approve mined, subscribe mines 100 NDF, emergency revoke, subscribe refused with `NotEligible`, checker returns 0x0000. Pass: script prints `BACKOFFICE-LOCAL PASS`.
2. Existing suites unchanged: forge 97 passed, service 12 plus 3, companion 22, nargo 9, app-e2e specs (sp1-mock, noir, browser-prover) pass with `VITE_BACKOFFICE_URL` unset. Pass: same counts as the handoff.
3. Typecheck and production build of app and backoffice pass in both modes.
4. Bootstrap: quorum id, two policy ids and wallet id returned; `GET /desk` shows owner quorum 2 of 2 and the policy names. Pass: ids recorded in docs/evidence without secrets.
5. Policy refusal: `POST /probe/transfer` returns Privy's policy error; no transaction is broadcast. Pass: error text recorded; operator balance unchanged.
6. Two-key approval: an approve intent reaches Executed only after both authorizations; one authorization alone leaves it Pending; `Approved` event with the operator address equal to the Privy wallet. Pass: transaction hash in the record.
7. Evidence refusal and revoke: approve intent for an address without evidence ends Failed with a `NoDecision` revert; operations key alone revokes; the compliance key alone cannot revoke (intent stays Pending) and cannot send ETH. Pass: all four outcomes recorded.
8. Wallet administration: update-wallet intent removes the emergency signer; a later revoke by the operations key alone is refused. Pass: refusal recorded.

## 8. Honesty check

product.md rules applied to every on-screen sentence of this case:

- "Official test wallet, sample identity" on the investor beat; never "real state-issued identity".
- "No identity documents on chain, and nothing we could use to find her"; never "nothing about you on chain".
- "Proof made in the browser tab" (WP30); never "on the device".
- The desk is document-blind, the issuer is not: the on-screen line is "This desk sees an address and its evidence. The issuer's compliance file stays with the issuer." Never "second KYC removed"; the word KYC does not appear.
- "Manual withdrawal", "renewal is manual in this build", "simulated" on any stub.
- Two keys on one demo server is said on screen (step 3 caption).
- Privy custody: say only what the docs say. Verbatim on-screen sentence about Privy: "Operator wallet by Privy: a server wallet whose key is reconstituted only inside Privy's secure enclave (Privy's wording), owned by a two-key quorum of the issuer's compliance and operations desks, and bound by a policy that allows approve and revoke on the AttestationRegistry and nothing else. Privy sees this wallet's transactions; it never sees identity evidence."
- Privy appears in the video and README only if tests 4 to 7 are green (sponsor rule).

## 9. Size and review burden

Large. About 9 new files and 4 changed files, one new dependency, one new script pair, one new README section, one evidence record.

Decision points for the builder: (1) intents versus synchronous two-key signing in one request (fallback if the Intents API is gated); (2) anvil raw-broadcast path versus Sepolia only; (3) a TypeScript back-office service beside the Rust bridge versus extending the bridge with the REST API (chosen: separate service, bridge untouched); (4) 2-of-2 versus 2-of-3 with an auditor key (2-of-2 chosen for the video's length).

Risks: the Privy app does not exist yet and every Privy test waits on the builder; key quorums are labelled "an advanced feature, reach out" in the docs; plan gating of intents and quorums on the free plan is unverified; chain id 31337 signing is unverified; the policy engine's function-name matching needs the exact registry ABI entries.

Kill criteria: quorum or intent creation is refused on the free plan and the synchronous two-key fallback also fails; the wallet cannot sign for 31337 and Sepolia is not deployed by 2026-09-11; the policy cannot express the function restriction (then a `to` plus `chain_id` allowlist alone is weaker but still honest, and the case is downgraded to medium confidence); any step needs a Privy feature that is "mocked" in the prize's sense.

## 10. Unverified

- Whether key quorums, the Intents API and the organizations API are usable on the free Developer plan (docs gate only Dashboard manual approvals and production webhooks to Enterprise).
- The Node SDK method name for authorizing an intent (only the Java tab shows `client.intents().authorize`).
- Whether the enclave signs `eth_signTransaction` for chain id 31337, and whether a policy accepts 31337 in a `chain_id` condition.
- Whether an intent can carry `eth_signTransaction` (the page says the RPC intent accepts the same body as the synchronous RPC endpoint).
- Exact policy error text returned on a violation.
- privy-rs crate name and version (not used).
- Which pricing-matrix cells are ticked for "Key quorum approvals" and "Custodial wallets".

## 11. Rejected variants

- Embedded wallet for a single issuer operator (spec-privy.md's stretch): one key, no quorum, no policy beyond the wallet itself. Meets "create a wallet" but not the control requirement in any meaningful way; the approval is still a lone click.
- Organization wallets API (organization object, default key quorum, entity-scoped wallets): the fuller product shape and what a real transfer agent would use, but it adds users, an organization object and unverified plan gating on top of the same three controls. The quorum plus policy plus intents subset gives the identical demo with less surface; the case can be upgraded to it later without changing the flow.
- Treasury and redemption payout (a Privy treasury wallet that pays the investor on redemption): would hit the financial flow track too, but the issuer's pain is the gate, not the payout, and it needs a stable token leg and a redemption contract that do not exist. Left to the investor-side cases.
