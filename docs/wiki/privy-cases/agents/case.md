---
type: plan
title: Privy case, agents and automation: a standing order run by the issuer's automation under a decision-mirrored policy
updated: 2026-09-09
sources:
  - wiki/privy-cases/BRIEF.md
  - wiki/privy-cases/agents/research.md (every Privy URL, fetched 2026-09-09)
  - wiki/handoff-fable-2026-09-09.md, product.md, spec-privy.md, narrative-zk.md
  - raw/2026-09-06-product-pitch-legal.md and 2026-09-06-live-gated-products.md (as cited by product.md)
  - nachweis-app main 5f5ceb9 (opus inventory 2026-09-09, read-only)
---

# Standing order: the issuer's automation subscribes for the investor, only while the decision is valid

## 1. Sentence

A fund issuer can run a standing order (a recurring subscription) for an investor from the investor's own wallet, without holding an identity document, because the investor's EUDI evidence produced an on-chain eligibility decision with an expiry and a revocation flag, with Privy providing the investor's embedded wallet, a server signer on that wallet, and a policy on the signer that mirrors the decision: only the fund's contracts, only until the decision's expiry, denied the moment the issuer revokes.

## 2. Who buys and who uses

Buyer: the issuer of the gated fund token (product.md: the issuer owns the gate). It pays because a standing order is the product feature that turns a one-time subscription into recurring inflow, and today it cannot offer one on a tokenized instrument without running its own document funnel for every wallet and keeping a human in the loop for every run.

User: the investor. She signs in by email, gets a Privy embedded wallet, presents her EUDI sample identity once, and grants the issuer's automation a signer with a policy she can read: "subscribe for me, into this fund, until my decision expires". She can remove the signer at any time (Privy `removeSigners`, research.md section 2).

Money that moves per run, in this build: 0.01 test ETH from the investor's wallet to the issuer's address (the payment leg, a Privy transfer), then `Subscription.subscribe()` from the same wallet, which mints 100 NDF to her (FACT, Subscription.sol:23 to 27: the demo contract takes no payment, so the two legs are not linked on chain; captioned as such). Signer: the issuer's authorization key, held by a small automation service that the issuer operates.

## 3. Otherwise not possible

- FACT: a Privy policy cannot read chain state. The condition sources are transaction fields, decoded calldata, typed data, message content, and the system clock (research.md section 1, field_source list). So "sign only while this person is eligible" cannot be written in Privy alone; it needs an external, machine-readable eligibility fact with an expiry and a revocation signal.
- FACT: the AttestationRegistry stores exactly that per (subject, policyId): `expiry` and `revoked` (IEligibility.sol:11 to 18), emits `Revoked` (AttestationRegistry.sol:51) and `Approved` (:52), and checks expiry on read (:189). Subscription and FundToken check the wallet address, not who authorised the signature (Subscription.sol:25, FundToken.sol:63). A signer added to the investor's wallet therefore inherits her eligibility, and loses it in the same block she does.
- FACT: Privy itself names the use case, "Recurring actions: implement subscriptions, portfolio rebalancing, and more" (signers overview), and recommends "Time-based controls" and "Allowlisted contracts" for agents (agentic wallets recipe). What Privy does not have is a source of truth for "this address belongs to an eligible natural person".
- CLAIM (product.md, product-pitch-legal memo): the issuer keeps its compliance file; a predicate never satisfies full customer due diligence. The standing order does not replace that file. It removes the need for the automation operator to hold or consult the document at every run: the run reads a decision, not a person.
- COUNT 0 (live-gated-products memo, 2026-09-06): no live gated product accepts an external attestation without a contract. OPINION: without eligibility on the address, every automated run needs the issuer's own allowlist lookup with its own identity file behind it. With the decision on chain and the policy copied from it, the automation is stoppable by the issuer (revoke), by time (expiry) and by the investor (remove signer), and none of the three holds a document for it.

## 4. Privy as core

Primary track: Best B2B financial product. The second track, Best financial flow, is also met.

Wallet type: user-owned embedded wallet (email login, `createOnLogin`), plus the issuer's authorization key registered in the dashboard as a 1-of-1 key quorum (the signer id). Controls: a per-investor policy attached as the signer's override policy; rule updates on the policy driven by chain events. Flow: the automation sends two transactions per run through Privy's wallet API with the authorization key.

Why core, not decoration: the standing order runs only through Privy. Without the signer the issuer has no way to act on the investor's wallet; without the policy the investor has no way to bound it; without the rule update the revoke stays on chain only and the automation would keep broadcasting reverting transactions. The decision-mirrored policy is the product.

Mapping, B2B track:

- "Integrate Privy as a core part": the automation service and the investor screen depend on `@privy-io/node` and `@privy-io/react-auth`.
- "Create or use at least one Privy wallet": the investor's embedded wallet, created at email sign-in.
- "Business or organization use case": the issuer's standing-order operation.
- "At least one functional B2B workflow": automated recurring subscription (payment plus mint), event-driven policy update on revoke, wallet administration by the investor (add and remove signer).
- "At least one Privy control": policies (override policy on the signer) and signers (key quorum as signer). Intents and key quorums above 1-of-1: not used (see 11).
- "Working demo and source", "explain how Privy enables the product": the video beats in section 5 and the README section proposed in section 8.

Mapping, financial flow track: "Complete at least one functional financial flow using a generally available Privy feature": a native transfer (0.01 test ETH to the issuer) and a contract call from a Privy wallet, both "supported wallet actions" through the Node SDK; "explain how Privy improves the user experience": an investor without a crypto wallet gets one at email sign-in and a savings plan she can stop with one button.

GA and self-serve status of what the case stands on (research.md sections 1, 2, 4, 7): policies and signers are documented for dashboard, Node SDK and REST with no beta or plan label; the Developer plan is free with 50K signatures per month; Sepolia is a supported chain for `sendTransaction` (the docs' own examples use `eip155:11155111`). Unverified: gas sponsorship on Sepolia for a Developer app, and `@privy-io/wagmi` 4.0.17 against wagmi 2.19 and vite 8.

## 5. The flow, as in the video

1. Investor screen. "Sign in with email, wallet by Privy" (new option next to "Bring your wallet"). The embedded wallet address appears with the on-screen Privy sentence (section 8).
2. Bind: the wallet signs `nachweis:session:<id>` (EIP-191, unchanged bridge check).
3. Present: QR code, the official German EUDI test wallet on the iPhone answers with the sample identity; the tab decrypts and proves (Noir, 11 s class); the bridge submits `attestWithProof`. Caption: "official test wallet, sample identity; proof made in this browser tab".
4. Issuer screen: Approve. On chain: `Approved`. The automation sees `Approved`, reads `decisionOf`, and creates the Privy policy for this investor: a DENY rule for `current_unix_timestamp >= expiry`, an ALLOW rule for `to == Subscription` with `function_name == subscribe` on chain 11155111, an ALLOW rule for `to == issuer` with `value <= 0.01 ETH`. The issuer screen shows the policy id and the three rules in plain words, with a dashboard screenshot cut in.
5. Investor screen, new card "Standing order": "Let the issuer's automation subscribe for me until <expiry date>". Click, Privy's consent, `addSigners({address, signers: [{signerId, policyIds: [policyId]}]})`. The card now shows "delegated" and a "Remove signer" button.
6. "Run the month" (captioned "scheduler tick, simulated"): the automation sends the transfer, then `subscribe()`, both through `privy.wallets().ethereum().sendTransaction` with the authorization key. Two Sepolia hashes on screen; the balance shows plus 100 NDF; the issuer's address shows plus 0.01 ETH.
7. Revoke beat: issuer clicks Revoke. `Revoked` on chain; within seconds the automation appends a DENY-all rule to the policy; the issuer screen logs "policy <id>: deny-all rule added". "Run the month" again: Privy refuses the request before anything is broadcast; the error text is shown. Below it, an `isEligible` read shows false: the chain would refuse too. Caption: "revocation manual, by the issuer".
8. Closing beat: the investor clicks "Remove signer"; the card shows "only you can transact on this wallet".

## 6. What changes in the code

New, `nachweis-app/automation/` (bun, like companion/), dependency `@privy-io/node` 0.34.0 plus viem: `src/policy.ts` builds the rules from a Decision and the addresses (pure, tested); `src/watch.ts` watches `Approved` and `Revoked`, creates the policy on approve, appends DENY-all on revoke, removes it on re-approve; `src/run.ts` is the tick (list delegated wallets, transfer, subscribe, log hashes); `src/server.ts` serves `POST /tick` and `GET /status`. Env: `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_AUTHORIZATION_KEY` (never printed), `PRIVY_SIGNER_ID`, chain addresses, and `AUTOMATION_SIGNER=privy|local`. In `local` mode the tick signs with a local key against anvil and a small evaluator applies the same rule JSON, captioned "simulated Privy policy (local)", dev loop only.

App, `nachweis-app/app/`: `package.json` adds `@privy-io/react-auth` 3.40.0 and `@privy-io/wagmi` 4.0.17 (bun). `src/lib/WalletProvider.tsx` (connectors at :34 to 39) wraps with `PrivyProvider` and `@privy-io/wagmi` when `VITE_PRIVY_APP_ID` is set, else renders the current provider unchanged. `src/config.ts` adds `VITE_PRIVY_APP_ID`, `VITE_PRIVY_SIGNER_ID`, `VITE_AUTOMATION_URL`, all optional. `src/lib/wallet.ts` (:62 to 65) gets the email sign-in option for the investor role. New `src/components/StandingOrderCard.tsx` (`useSigners`, the "Run the month" button, the policy in plain words), mounted in `InvestorScreen.tsx` after `DoorsCard`; a log panel in `IssuerScreen.tsx`.

Scripts: `scripts/browser-real-wallet-up.sh` starts the automation in `local` mode after the bridge (:174); new `scripts/automation-sepolia.sh` starts it in `privy` mode.

Unchanged: contracts/ (expiry, revoke and both door checks exist), service/ (the automation watches events instead of being called by the bridge), circuits, provers, companion, Playwright specs (the Privy path is off without the app id). Docs: `docs/privy-standing-order.md`, README section "Privy", one evidence record.

## 7. Evidence plan

Green with class L by 2026-09-12 without a Privy account: policy builder tests, the event watcher against anvil, the local tick, typecheck and build with and without the app id, Playwright suites unchanged. Needs the builder's app id, app secret and dashboard-created signer id: policy creation, `addSigners`, every run through Privy. Needs Sepolia for the evidence run (class S): Privy broadcasts only on chains it knows; sign-only against anvil is unverified.

Acceptance tests:

1. `bun test` in automation/: for a Decision with expiry E, the built policy has a DENY rule at `current_unix_timestamp >= E`, an ALLOW rule for Subscription with `function_name == subscribe`, an ALLOW rule for the issuer with `value <= 0.01 ETH`, and chain id equal to `CHAIN_ID`; after `Revoked` the rules carry a DENY-all; after a fresh `Approved` the DENY-all is gone. Pass: all assertions, no network.
2. Local stack: `scripts/browser-real-wallet-up.sh` plus `POST /tick` in `local` mode mints 100 NDF for the dev investor after approve and is refused after revoke (evaluator DENY and on-chain revert). Pass: log lines `TICK OK` then `TICK DENIED policy` and `TICK DENIED chain`.
3. `tsc --noEmit` and `vite build` pass with `VITE_PRIVY_APP_ID` unset and set to a dummy value.
4. Playwright `app-e2e-local.sh --mode noir|browser|sp1-mock` pass with the app id unset.
5. Privy app: `privy.policies().create` returns a policy id and the dashboard shows it; `addSigners` in the browser returns a user whose wallet has `delegated: true`.
6. Sepolia, hand-clicked, official wallet: steps 1 to 6 of section 5; two hashes, balance plus 100 NDF; record in docs/evidence with hashes, no email address, wallet version string filled.
7. Revoke: after the issuer's revoke, the policy shows a DENY-all rule within one block time; `POST /tick` returns Privy's denial (status and message logged) and no hash; `isEligible` is false.
8. Remove signer: after `removeSigners`, `POST /tick` reports "no delegated wallet" and sends nothing.
9. Expiry: `attestByOperator` with expiry now plus 120 s on Sepolia, policy created with that expiry; after 120 s the tick is denied by the timestamp rule (Privy) and by the chain. Pass: both denials logged.

## 8. Honesty check

Rules from product.md, applied to every sentence on screen:

- "Official test wallet, sample identity. Proof made in this browser tab." (never "real state-issued identity", never "on the device")
- "No identity documents on chain, and nothing we could use to find her." (never "nothing about you on chain")
- "Revocation: manual, by the issuer." "Scheduler tick: simulated by the Run the month button." "Demo fund: subscribe mints 100 NDF without payment; the 0.01 test ETH to the issuer is a separate transaction, not linked on chain."
- None of the banned words of product.md (no "first", no "only", no yield figure, no "second ... removed"). Privy on screen only if the Sepolia run is green (sponsor rule).
- Custody: say "embedded wallet by Privy" and "the signer never sees the wallet's key" (Privy's own words, CLAIM attributed to Privy's docs), nothing beyond the docs.

Proposed verbatim Privy sentence for the investor screen: "Wallet by Privy: an embedded wallet created at email sign-in. Your identity evidence never goes to Privy. Privy sees this address, the transactions it signs, and one policy: the issuer's automation may subscribe for you into this fund and pay the issuer up to 0.01 test ETH per run, until your decision expires on <date>. If the issuer revokes your decision, the policy is closed within a block; you can remove the signer at any time."

Issuer screen sentence: "Automation by Privy: the issuer's key signs on the investor's wallet only under the policy copied from her on-chain decision. Revoke on chain adds a deny rule to that policy."

## 9. Size and review burden

Large. New directory with five source files and one test; five app files changed and one new component; one script changed and one added; two docs and one evidence record. Two new browser dependencies, one server dependency.

Decision points needing the builder: (1) the issuer's authorization key lives in the automation's env, so the automation is the issuer's system, not Attestat's; (2) the payment leg in or out (out reduces the policy to two rules and drops the transfer from the financial flow claim); (3) gas for the embedded wallet on Sepolia: faucet ETH sent to the address versus `sponsor: true` (unverified on the free plan); (4) `@privy-io/wagmi` versus a separate Privy code path if the wagmi bridge fights wagmi 2.19 or vite 8.

Risks: no Privy app before 2026-09-11; the Sepolia deployment (handoff action 1) is a prerequisite; the `addSigners` consent needs the embedded wallet in a real browser, which Playwright cannot exercise; `useSigners` API drift against 3.40.0; the revoke-to-policy update must be signed with the authorization key if the policy has an owner.

Kill criteria: no app id by the morning of 2026-09-11; `addSigners` or the server `sendTransaction` fails on Sepolia without an obvious cause within one bounded task; Privy's denial cannot be shown as text; the Sepolia deployment is not green by 2026-09-11. If killed, the class L work stays as documentation and Privy leaves the site footer.

## 10. Unverified

- Whether any Privy policy field source reads chain state (absent from the fetched list; no other page checked).
- `signTransaction` with `chain_id: 31337` (anvil) for a sign-only path; if accepted, class L could cover the Privy signing too.
- Gas sponsorship (`sponsor: true`) on Sepolia under the Developer plan.
- Whether intents and m-of-n key quorums are available on the Developer plan without contact ("advanced integration, reach out").
- `@privy-io/wagmi` 4.0.17 compatibility with wagmi 2.19.5, viem 2.56.3, vite 8.2.2, React 19.
- Exact shape of Privy's denial response (status code and message) when the override policy denies.
- The delay between a rule update and its enforcement on the next request.
- Whether the consent step of `addSigners` shows the policy to the user or only the app's request.

## 11. Rejected variants

1. Trading agent in the permissioned Uniswap v4 pool: an agent signer rebalancing through the Universal Router under a calldata policy. Stronger "trading" story, but the app has no swap door yet (WP8 note), the router calldata is nested and the policy would need the full ABI path, and the pool onboarding is itself on the Sepolia to-do list. Size XL, two unknowns stacked.
2. Issuer operations wallet as a Privy server wallet: event-driven approve after `Attested`, revoke as a dashboard intent under a 2-of-2 quorum, auto-refund of refused subscriptions. Automatic approve contradicts the product rule that the issuer approves as a separate step, the dashboard approval needs a second team member in the video, quorums above 1-of-1 are "reach out", and there is nothing to refund because `subscribe()` takes no payment (FACT, Subscription.sol:23). Replacing `OPERATOR_PRIVATE_KEY` in the bridge with a server wallet is a follow-up.
3. Self-hosted AI agent with Privy's device-code agent authorization: the agent would act on its own judgement and the demo minutes would go to the agent, not to the eligibility decision.

The standing order wins because every beat lands on the enabling fact: the policy is a copy of the decision, revoke closes policy and chain in one beat, and the investor can see and cut the delegation herself.
