# Spec: issuer approval as a separate step

Status: implemented on branch `wp16-issuer-approval`. Product requirement: `wiki/product.md` (identity evidence is accepted by the issuer's verifier, the issuer approves in a separate step, only then are both doors open, the issuer can withdraw approval, reapproval requires the issuer).

## Goal

Two conditions, not two routes. Today `attestWithProof` is permissionless and makes the subject eligible the moment the proof lands; the operator's `attestByOperator` is a parallel route to the same result. After this change:

1. Evidence: a Noir or SP1 proof (or an operator-signed decision) stores the decision for `(subject, policyId)`.
2. Approval: an operator of the policy calls `approve(subject, policyId)`.

`isEligible` is true only when both hold, the decision is not revoked, and it has not expired. Both doors (FundToken transfer check, Subscription, the Uniswap `EudiAllowlistChecker`) read `isEligible`, so they open and close together.

## On-chain state per (subject, policyId)

| Field | Set by | Cleared by |
|---|---|---|
| `Decision` (bits, tier, expiry, statusRef, revoked) | `attestWithProof`, `attestByOperator` | overwritten by a later store |
| `approved` | `approve`, `attestByOperator` | `revoke` |
| `revoked` | `revoke` | `approve`, `attestByOperator` |

Derived views:

- `isEligible(subject, policyId, requiredBits)`: `approved && !revoked && expiry > now && bits ⊇ requiredBits`.
- `statusOf(subject, policyId)`: `(hasDecision, approved, revoked, expiry)` in one call for UIs and the bridge.

## Invariants

- I1: `attestWithProof` never sets `approved`. A proof alone never opens a door.
- I2: `attestWithProof` cannot overwrite a revoked decision (unchanged; a replayed proof cannot reopen).
- I3: `approve` requires an existing decision (`NoDecision` otherwise) and operator authority for the policy.
- I4: `approve` clears `revoked`. Issuer authority is the only way to reopen a revoked record (I2 + I3).
- I5: `revoke` sets `revoked` and clears `approved`. A later `attestWithProof` with a fresh proof still fails (I2); a later `approve` reopens.
- I6: `attestByOperator` stores and approves in one transaction (the operator signed the decision).
- I7: `Decision` struct, `IEligibility`, public inputs layout, POLICY_ID strings and proof adapters are unchanged.

## Session states (bridge)

`created → presented → proved → attested → approved`, with `revoked` and `rejected`/`failed` as terminal-until-issuer states.

- `attested`: evidence is on chain, `approved == false`. UI copy: "evidence on chain, awaiting issuer approval".
- `approved`: `registry.approve` succeeded, both doors open.
- `revoked`: `registry.revoke` succeeded, doors closed. The issuer's button reads "Re-approve"; `approve` moves the session back to `approved`.

Privileged bridge routes (`attest-operator`, `approve`, `revoke`) require `Authorization: Bearer <BRIDGE_ISSUER_TOKEN>`. When the token is unset the routes answer 503 and the service logs a warning at startup; nothing privileged runs unauthenticated.

## Acceptance tests

Contracts (`forge test`):

- A1: proof-attested subject is not eligible before `approve`; FundToken transfer and Subscription revert; `EudiAllowlistChecker.check` is false.
- A2: after `approve` the same subject is eligible; transfer, subscribe and the checker succeed.
- A3: `approve` by a non-operator reverts with `NotOperator`; `approve` without a decision reverts with `NoDecision`.
- A4: `revoke` closes transfer, subscribe and the checker; `approved` reads false.
- A5: a replayed or fresh proof after `revoke` reverts with `DecisionRevoked` (nonce or not).
- A6: `approve` after `revoke` reopens; `revoked` reads false, `approved` reads true.
- A7: `attestByOperator` is eligible immediately.
- A8: an expired decision is not eligible even when approved.

Bridge (`cargo test`, anvil tests need `forge build` first):

- B1: `POST /sessions/:id/approve` without the bearer token is 401 (or 503 when no token is configured); with the token it calls `approve` and the session reports `approved: true`.
- B2: after a proof attests, session status is `attested` with `approved: false`; the chain read agrees.
- B3: `revoke` moves the session to `revoked`; a second `approve` moves it back to `approved`.

App (`bun run typecheck`, `bun run build`, Playwright specs in `scripts/e2e`):

- C1: issuer screen shows "attested (awaiting issuer approval)" and an Approve button; after approval the badge reads approved.
- C2: investor doors stay closed while `attested`, open after `approved`, close after `revoked`.
- C3: after `revoke` the issuer button reads Re-approve and works.
