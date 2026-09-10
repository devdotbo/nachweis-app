---
type: decision proposal
title: Privy business cases: evaluation, ranking and the recommended build for 2026-09-10 to 2026-09-12
updated: 2026-09-09
sources:
  - wiki/privy-cases/BRIEF.md (2026-09-09)
  - wiki/privy-cases/backoffice/case.md and research.md (2026-09-09)
  - wiki/privy-cases/investor-money/case.md and research.md (2026-09-09)
  - wiki/privy-cases/other-buyer/case.md and research.md (2026-09-09)
  - wiki/privy-cases/agents/case.md and research.md (2026-09-09)
  - wiki/privy-cases/lifecycle/case.md and research.md (2026-09-09)
  - wiki/product.md, handoff-fable-2026-09-09.md, spec-privy.md, decisions.md (2026-09-09)
  - https://www.privy.io/pricing (fetched 2026-09-09, raw HTML parsed, see section 3)
  - https://docs.privy.io/recipes/tee-wallet-migration-guide.md, wallets/using-wallets/signers/setup.md, signers/overview.md, signers/configure-signers, controls/policies/overview, controls/policies/create-a-policy.md, controls/key-quorum/overview, controls/dashboard/overview.md, transaction-management/intents/overview, transaction-management/intents/sign-intents.md, basics/react/advanced/configuring-evm-networks (all fetched 2026-09-09)
  - github.com/privy-io/node-sdk api.md, src/public-api/services/intents.ts, src/lib/authorization.ts (read with gh 2026-09-09)
  - nachweis-app main 5f5ceb9 and worktree nachweis-app branch wp31-product-ui head 8fbf428 (read-only, opus citation check 2026-09-09, see section 9)
---

# Privy business cases: evaluation and recommendation

Status: decision proposal for the builder and the lead. Nothing here is built. Labels per AGENTS.md.

## 1. Result in three lines

OPINION: build the agents case (the standing order: the issuer's automation subscribes from the investor's Privy embedded wallet through a signer whose policy is a copy of the on-chain decision), with the 0.01 ETH payment leg cut and with two bounded borrowings (the investor-money case's provider wiring, the lifecycle case's local expiry test). It is the only case whose Privy control is a direct function of the EUDI decision (expiry copied into the policy, revoke closes the policy), it stands only on features that the pricing page ticks for the free plan, it changes no contract, and its refusal beat is one click.

Ranking by total score (criteria in section 2): agents 34, lifecycle 29, backoffice 29, investor-money 27, other-buyer 23.

Fallback if the control is gated for the builder's free app (TEE execution not enabled, or policy creation refused): the embedded wallet alone with subscribe hand-clicked on Sepolia (financial flow track only, B2B not claimed), the automation kept in local mode as documentation and never on screen.

Gate dependence: the scores assume the docs and the pricing page. A dashboard inventory of the builder's account is running; section 3.7 states which finding moves which score, and section 11 lists the exact questions the inventory must answer. The recommendation holds under every finding in which an authorization key and a policy can be created on the app with TEE execution on; under any other finding the fallback applies and no control-based case survives the week.

## 2. Scoring table

Scores 1 (weak) to 5 (strong). Justifications in section 4 cite the case page sections.

| Criterion | backoffice | investor-money | other-buyer | agents | lifecycle |
|---|---|---|---|---|---|
| 1 Otherwise-not-possible strength | 3 | 3 | 4 | 5 | 4 |
| 2 Privy as core, track lines verbatim | 5 | 3 | 5 | 5 | 4 |
| 3 Feature reality (GA, self-serve, free, Sepolia) | 2 | 5 | 2 | 4 | 4 |
| 4 Buildability by 2026-09-12 under the constraints | 3 | 3 | 2 | 3 | 3 |
| 5 Fit to product sentence, code, WP31 | 5 | 3 | 1 | 5 | 4 |
| 6 Demo and video strength | 3 | 3 | 3 | 4 | 4 |
| 7 Honesty risk (5 = lowest risk) | 4 | 4 | 4 | 4 | 3 |
| 8 Overlap and uniqueness | 4 | 3 | 2 | 4 | 3 |
| Total | 29 | 27 | 23 | 34 | 29 |

Tie at 29: lifecycle ranks above backoffice because it stands on the same confirmed features as the winner (embedded wallet, signer, policy), while backoffice stands on key quorums ("reach out") and intents (no Node SDK authorize method, section 3).

## 3. Settled feature-status facts (fetched 2026-09-09)

The five research files disagree on three points. Settled here with the primary source.

### 3.1 Pricing page: what the free plan includes

Disagreement: other-buyer/research.md section 4 and lifecycle/research.md 1.3 and 1.4 read "Policy engine" and "Key quorum approvals" as "Available as add-on" on the Developer plans; backoffice/research.md section 8 and investor-money/research.md section 1 say the tick marks are unreadable; agents/research.md section 7 says policies are not named in either column.

FACT (https://www.privy.io/pricing, raw HTML fetched 2026-09-09 with curl and parsed; the table uses one SVG symbol for every tick and an empty cell for no tick; cells counted between consecutive row labels): the feature matrix has two plan columns, Developer and Enterprise. Rows and ticks:

| Row | Developer | Enterprise |
|---|---|---|
| Embedded wallets, Wallet connectors | tick | tick |
| Delegated access to wallets | tick | tick |
| Native gas sponsorship, Native funding and bridging, Custom onramps, Multi-wallet accounts, Authentication | tick | tick |
| Webhooks | tick | tick (the docs still say production webhooks need Enterprise, section 3.5) |
| Policy engine | tick | tick |
| Key quorum approvals | tick | tick |
| Advanced SSO | "Available as add-on" | tick |
| Custodial wallets | empty | tick |
| Integrated fraud prevention (KYT) | empty | tick |

So "Available as add-on" is the Developer cell of the Advanced SSO row, not of the policy or key quorum rows. The other-buyer and lifecycle readings were a flattened-text artefact. Plans (same page): Developer Free 0 to 499 MAU at 0 USD, Core 500 to 2,499 MAU at 299 USD per month, Scale 2,500 to 9,999 MAU at 499 USD per month, Enterprise custom; "Access all of Privy's core features and get 50K signatures and $1M transaction volume for free every month."

Caveat (OPINION): a tick on a marketing page is not a guarantee that the dashboard of a brand-new app exposes the feature; the morning gate in section 7 checks it on the real app.

### 3.2 TEE execution is a precondition for policies and signers

FACT (https://docs.privy.io/recipes/tee-wallet-migration-guide.md, fetched 2026-09-09): "Your app must enable TEE execution in order to access the following features: Support for Tier 1 and Tier 2 chains ... Policy engine in order to restrict Ethereum and Solana transactions. Server-side access to wallets, using signers." And: "Your app's wallet environment will be shown here as either 'On-device' (with an option to 'Request access to migrate to TEE') or 'TEE enabled'" on the Dashboard, Wallets page, Advanced tab. Migration for an on-device app is "Request access", not a toggle.

FACT (https://docs.privy.io/wallets/using-wallets/signers/setup.md, fetched 2026-09-09): "This page is only for apps using on-device wallet execution. If you created your application after May 2025, follow the steps in the signers overview instead."

CLAIM (inference from the two pages): an app created in 2026 starts TEE-enabled, so policies and signers are available to it without a request. Unverified until the builder reads the Advanced tab of the new app. This is the first morning check (section 7, step 3). Only investor-money/research.md section 6 had noticed this precondition; the other four case pages did not mention it.

### 3.3 Signers (delegated access) on user wallets

FACT (https://docs.privy.io/wallets/using-wallets/signers/overview.md, fetched 2026-09-09): "Recurring actions: implement subscriptions, portfolio rebalancing, and more." and "Privy's architecture guarantees that a signer will never see the wallet's private key." FACT (https://docs.privy.io/wallets/using-wallets/signers/configure-signers, fetched 2026-09-09): dashboard path "Wallet infrastructure > Authorization keys", "Create new key"; the modal shows "the key quorum ID and the private key used for signing"; "Privy never sees this private key and cannot help you recover it."; policies under "Wallet infrastructure > Policies". No plan, add-on, enterprise or request-access wording on either page. Pricing row "Delegated access to wallets": ticked on Developer (3.1). Status: generally available, self-serve, free, subject to 3.2.

### 3.4 Policies

FACT (https://docs.privy.io/controls/policies/overview and create-a-policy.md, fetched 2026-09-09): "You can create a policy using the Privy Dashboard, the NodeJS SDK, or the REST API."; "If no rules resolve, the policy will default to DENY."; enforced by "the trusted execution environment (secure enclave)". No gating wording. Pricing row ticked on Developer (3.1). Status: generally available, self-serve, free, subject to 3.2. Sepolia: FACT (https://docs.privy.io/basics/react/advanced/configuring-evm-networks, fetched 2026-09-09) the table row "Ethereum Sepolia | 11155111 | supported | Privy RPC" is ticked in both columns.

### 3.5 Key quorums, intents, manual approvals, webhooks

- Key quorums: FACT (https://docs.privy.io/controls/key-quorum/overview, fetched 2026-09-09): "Key quorums are an advanced feature. Reach out to discuss whether this setup is right for your integration." Pricing row ticked on Developer. A 1-of-1 quorum is what "Create new key" returns (3.3), so the signer path does not depend on this sentence; an m-of-n quorum does. Status for m-of-n: documented, ticked, but "reach out"; unverified on a fresh free app.
- Intents: FACT (https://docs.privy.io/transaction-management/intents/overview and sign-intents.md, fetched 2026-09-09): no plan or gating wording; the authorize step is "POST https://api.privy.io/v1/intents/{intent_id}/authorize", one signature per call; the page shows a Java sample only. FACT (github.com/privy-io/node-sdk api.md and src/public-api/services/intents.ts, read 2026-09-09): the Node SDK 0.34.0 intents service exposes list, get, reject, rpc, transfer, createPolicyRule, deletePolicyRule, updatePolicy, updatePolicyRule, updateKeyQuorum, updateWallet, and no authorize method; the package does export `generateAuthorizationSignature` (src/lib/authorization.ts). So authorizing an intent from Node means a hand-written REST call with a helper-made signature. This raises the build risk of the two intent-based cases (backoffice, other-buyer) beyond what their pages state.
- Manual approvals in the Dashboard: FACT (https://docs.privy.io/controls/dashboard/overview.md, fetched 2026-09-09): "Manual approvals is an Enterprise feature. Reach out to sales@privy.io". Not usable.
- Webhooks: FACT (all five research files quote the same sentence from the webhooks overview): free in development environments, Enterprise in production. Nothing in the recommended build depends on them.

### 3.6 Client packages

FACT (all five research files agree, npm 2026-09-09): `@privy-io/react-auth` 3.40.0, `@privy-io/wagmi` 4.0.17, `@privy-io/node` 0.34.0; `@privy-io/server-auth` is deprecated. Unverified by every case and by this page: `@privy-io/wagmi` 4.0.17 against wagmi 2.19.5, viem 2.56.3, vite 8.2.2 and React 19; the embedded wallet on anvil chain id 31337; gas sponsorship on Sepolia for a free app.

### 3.7 Which dashboard finding changes which score

A browser teammate is inventorying the builder's Privy dashboard (plan, execution environment, whether policies, authorization keys, key quorums, signers, intents, manual approvals and webhooks are creatable). The scores above assume the docs and the pricing page; this table says what moves when the dashboard answers. "Feature reality" is criterion 3; totals follow.

| Dashboard finding | agents | lifecycle | backoffice | other-buyer | investor-money | Recommendation |
|---|---|---|---|---|---|---|
| TEE enabled and a policy is creatable (expected) | 4 stays 4, total 34 | 4 stays 4 | 2 to 3 if a key quorum is also creatable, total 30 | 2 to 3, total 24 | 5 stays | holds |
| TEE enabled, policies creatable, key quorum m-of-n creatable without contact | unchanged | unchanged | 3 to 4, total 31; still needs REST authorize for intents | 3 to 4, total 25 | unchanged | holds; backoffice becomes the post-deadline follow-up with lower risk |
| Intents creatable and authorizable from the API on this plan | unchanged | unchanged | plus 1 on buildability (no synchronous fallback needed), total up to 32 | plus 1, total up to 26 | unchanged | holds (agents does not use intents) |
| Policies creatable but signers (authorization keys) not creatable | 4 to 1, total 31 | 4 to 1 | unchanged | unchanged | unchanged | fallback shape (section 6): embedded wallet only |
| TEE not enabled ("On-device", "Request access to migrate to TEE") | 4 to 1, total 31 | 4 to 1 | 2 to 1 | 2 to 1 | 5 stays 5 | fallback shape for the week; agents resumes if access arrives the same day |
| Policies not creatable (upgrade or sales prompt) | 4 to 1 | 4 to 1 | 2 to 1 | 2 to 1 | 5 stays 5 | fallback shape; investor-money's base (no control) is the only case unaffected |
| Manual approvals gated to Enterprise (expected, docs) | unchanged | unchanged | unchanged (the case never used the dashboard UI) | unchanged | unchanged | holds |
| Webhooks free in development only (expected, docs) | unchanged | unchanged | unchanged (polling) | unchanged | unchanged | holds |

Reading the table: the recommendation holds under every finding in which an authorization key and a policy can be created on the builder's app with TEE execution on. Under any finding that removes the policy or the signer, no control-based case survives the week, the ranking collapses to investor-money's base shape, and the fallback in section 6 applies. No finding promotes backoffice or other-buyer above agents, because their extra dependencies (m-of-n quorum, intents authorize over REST) only add risk and their fit and demo scores do not move with the dashboard.

## 4. Per-case verdicts

### 4.1 backoffice (issuer compliance desk), 29

1. Otherwise-not-possible 3: the enabling fact is real (case section 3: approve reverts NoDecision without evidence), but the desk is a 2-of-2 operator, which any multisig could be today; the page's own "what Privy adds" is the enclave-side policy, which is a control improvement, not a new workflow. Labelled OPINION on the page, correctly.
2. Privy as core 5: every B2B line maps to an artifact (section 4 table); the Privy wallet is the sole operator, so removing it removes the approver. Financial flow not met (the page says so).
3. Feature reality 2: needs key quorum 2-of-2 ("reach out", 3.5) plus intents authorized from Node (no SDK method, 3.5) plus TEE (3.2). Three unverified gates stacked; the synchronous 2-of-2 fallback (section 9 of the page) is sound but still depends on the m-of-n quorum.
4. Buildability 3: 9 new files, 4 changed, no contract change (section 6); one new service beside the Rust bridge; 4 decision points; the anvil path for the enclave signature is a stretch (31337 unverified), so every Privy test waits for Sepolia.
5. Fit 5: approve and revoke are the product's own controls; it drops into the WP31 issuer console (DecisionsTable, EventLog) without a new screen.
6. Demo 3: two refusal beats (policy refusal, NoDecision with two signatures) are good, but a jury sees a 2-of-2 approval, which reads as a multisig; the "otherwise not possible" is in the caption, not on the screen.
7. Honesty 4: the on-screen Privy sentence (section 8) stays inside the docs; "two keys on one demo server" is said. Risk: "document-blind desk" invites the question who saw the file; the page answers it.
8. Overlap 4: pair with other-buyer; backoffice is the stronger member on fit, the same on feature risk.

### 4.2 investor-money (fund desk for an email investor), 27

1. Otherwise-not-possible 3: the Travel Rule and live-gated sourcing (section 3) supports "the address is created at sign-in and evidence is bound to it", but the desk logic (chain refuses distributions to ineligible wallets) does not need Privy; the wallet is a UX gain.
2. Privy as core 3: financial flow lines met (embedded wallet, ERC-20 transfer pattern on Sepolia, section 4 table); B2B not met (no control; the page says "claim B2B only if the stretch is green"). Privy here is the wallet connector, which is exactly the shape the brief calls decoration unless the money flow is the product.
3. Feature reality 5: embedded wallets, email login, eth_sendTransaction on Sepolia; all ticked, all self-serve, no TEE precondition for signing from the user's own wallet (3.1, 3.4).
4. Buildability 3: one new contract (FundDesk) with tests and a second deploy layout (FundToken issuer becomes the desk), 6 app files, 2 ABIs, about 14 files (section 9); the L path is complete without Privy; 4 decision points, two of them contract design.
5. Fit 3: the product sentence is issuer-side eligibility; this adds a payment and redemption product the issuer does not have today, changes the deployment layout of FundToken, and the WP31 investor portal already has HoldingsCard, so the MoneyCard is a second holdings view.
6. Demo 3: ten beats (section 5) are too many for a 60 s Privy segment; refusal and revoke beats exist; the on-screen Privy part is a confirmation modal.
7. Honesty 4: the custody sentence is attributed to Privy; distribution without snapshot captioned; "10 mUSD" is an amount, not a rate. Risk: "distributions" next to "fund" reads like yield to a jury; keep the caption.
8. Overlap 3: unique as the pure financial flow, but it is the spec-privy.md minimum plus a contract; its provider wiring (section 6) is reused by the winner.

### 4.3 other-buyer (contractor payout desk), 23

1. Otherwise-not-possible 4: the best legal sourcing of the five (BGB 106 to 108, Directive 94/33/EC, AMLR Art 3 list without employers, section 3) and a true absence fact (no Privy field source reads chain state). Scored 4 not 5 because the legal memo it cites rates payee verification 1, 1, 2 on demand, crypto appeal and EUDI add (research.md section 6).
2. Privy as core 5: both tracks mapped line by line (section 4 table); treasury wallet, quorum, policy, intents; the refusal beat "both officers and Privy allow, the chain refuses" is the sharpest single beat of all five.
3. Feature reality 2: same stack as backoffice (m-of-n quorum, intents from Node, TEE); its own research reads the policy engine as add-on, which 3.1 corrects, but the "reach out" and the missing SDK authorize remain.
4. Buildability 2: new contract with tests and deploy, a 6-file service, a third role and screen in the app, label maps for the two existing screens, script, docs, spec (section 6); the largest change set; 4 decision points.
5. Fit 1: the buyer is a company paying contractors, not the issuer product.md names; the WP31 issuer console and investor portal would carry swapped labels; the product sentence ("token issuers") would need a second sentence.
6. Demo 3: the two refusal beats are strong; the story switch from fund to payroll on top of the EUDI beat costs the minutes the video does not have.
7. Honesty 4: careful (no uniqueness claim, "not an AMLR obliged entity" said, KYC absent). Risk: "pay only adults who have shown state identity evidence" must keep "sample identity, official test wallet" in the same breath.
8. Overlap 2: same Privy mechanics as backoffice on a second product; a merge (treasury leg on the issuer) was rejected by both pages for good reasons.

### 4.4 agents (standing order under a decision-mirrored policy), 34

1. Otherwise-not-possible 5: FACT-based (section 3): the policy field sources cannot read chain state; the registry holds exactly expiry and revoked; the Subscription contract checks the wallet address, so a signer inherits eligibility and loses it in the same block. "Sign only while this person is eligible" is not writable in Privy without an external decision, and the policy that copies the decision is the product. Privy's own docs name the use case (3.3).
2. Privy as core 5: B2B lines mapped (section 4): embedded wallet, issuer operation, automated recurring transactions plus event-driven policy update plus wallet administration by the investor, controls signers and policies. The prize text's "automated transactions, or event-driven operations" is hit literally. Financial flow also met by the subscribe call (spec-privy.md's reading of "other supported wallet actions"); the 0.01 ETH transfer is not needed for that and is cut (section 5).
3. Feature reality 4: embedded wallet, 1-of-1 signer from "Create new key", policy on the signer, server sendTransaction on Sepolia: all ticked and self-serve (3.1, 3.3, 3.4), subject to the TEE precondition (3.2), which the case page does not mention. No quorum above 1-of-1, no intents, no webhooks.
4. Buildability 3: new automation directory (5 source files and a test), 5 app files changed, 1 component, 1 script changed and 1 added, no contract change (section 6); local mode covers class L with a simulated evaluator; the `addSigners` consent needs a real browser (Playwright cannot); 4 decision points, one of which (the payment leg) this page decides.
5. Fit 5: issuer-side, one decision many doors, expiry and revoke are the product's own lifecycle; the WP31 investor portal gets one card (StandingOrderCard) and the issuer console gets one log panel; the wallet layer on wp31-product-ui already offers connect options (section 9), so "Sign in with email" is one more option.
6. Demo 4: "Run the month" mints while nobody clicks; revoke, then the run is refused by Privy before broadcast and the chain read says false; "Remove signer" closes it from the investor's side. Under 60 s. Scored 4 not 5 because the policy must be shown in plain words on screen for the copy-of-the-decision idea to land.
7. Honesty 4: the section 8 sentences stay inside the docs and caption the tick, the payment gap and the manual revoke. Two lines need tightening: "the policy is closed within a block" is a latency claim about our watcher, and "closed by the issuer's automation when it sees the Revoked event" is what is true; and "Privy sees ... one policy" must not imply Privy verifies the decision.
8. Overlap 4: pair with lifecycle; agents is the sharper member because its policy is a function of the decision (expiry rule, deny-on-revoke) while lifecycle's policy is static and the issuer flips it by hand.

### 4.5 lifecycle (attested savings plan, several doors), 29

1. Otherwise-not-possible 4: sourced (eIDAS Art 5a(8) and (9), COUNT 0 cross-app reuse, section 3); the "revoke closes four doors" fact is real, but the second-issuer door and the transfer door are chain-level and need no Privy; the Privy part repeats agents with a static policy.
2. Privy as core 4: B2B lines mapped (section 4) with signers and a policy; the DENY after revoke is a manual issuer step, not event-driven; "automated transactions" is the runner loop.
3. Feature reality 4: same confirmed features as agents; its research misread the pricing row (3.1 corrects it) and did not see the TEE precondition.
4. Buildability 3: 7 app files, runner, DeploySecondIssuer script, stack script change, about 12 files (section 9); twelve video beats including a swap door the app does not have (DoorsCard's Swap button is disabled, research.md section 2); 4 decision points.
5. Fit 4: strong on "one decision many doors"; the Issuer B panel is a third party the WP31 consoles do not have, and the transfer beat needs a second attested wallet.
6. Demo 4: "one transaction, four doors" is a strong beat, but two of the doors are already in the existing demo, and twelve beats do not fit.
7. Honesty 3: "Issuer B accepts the eligibility decision as its on-chain gate; its own customer file is its own duty" states the memo's OPINION on AMLR reuse as a product line; product.md keeps reuse questions on the open list. Everything else is careful.
8. Overlap 3: the weaker member of the signer pair on the control, the stronger on doors; its expiry test and door list are borrowed (section 5).

### 4.6 The two overlapping pairs

- Signer pair (agents, lifecycle): agents wins. Merge: yes, bounded, by taking lifecycle's local expiry test (evm_increaseTime on anvil) and its wording for the plan card's stop button, and by leaving out the second issuer, the transfer beat and the swap beat. The existing two doors (Subscription, pool checker) already show "revoke closes all doors".
- Quorum pair (backoffice, other-buyer): backoffice wins on fit; both lose on feature reality because of the m-of-n quorum and the Node SDK's missing intents authorize. A merge (issuer treasury paying redemptions under a quorum) would need a contract change and a stablecoin leg and was rejected by both pages. Neither is recommended this week; backoffice is the natural follow-up after the deadline, because it replaces the operator key the bridge holds today.

## 5. Recommendation: exact scope

Build the agents case as one bounded package, named WP32 in work-packages.md by the lead (this page does not edit that file).

Keep, from wiki/privy-cases/agents/case.md sections 5 and 6:

1. Investor portal: "Sign in with email, wallet by Privy" as one more connect option; embedded wallet created at login; the existing bind (`nachweis:session:<id>`, EIP-191) unchanged.
2. Automation service `nachweis-app/automation/` (bun, `@privy-io/node` 0.34.0, viem): `policy.ts` (pure builder, tested), `watch.ts` (Approved creates the per-investor policy from `decisionOf`; Revoked appends a DENY-all rule; re-approve removes it), `run.ts` (the tick: for each delegated wallet send `subscribe()` through `privy.wallets().ethereum().sendTransaction` with `caip2: 'eip155:11155111'`), `server.ts` (`POST /tick`, `GET /status`, `GET /policy/:address` returning the rules in plain words for the two screens). `AUTOMATION_SIGNER=privy|local`; local mode signs with a local key against anvil and applies the same rule JSON in a small evaluator, captioned "simulated Privy policy (local)", never on screen in the video.
3. Policy per investor, created without an owner (updatable by app secret alone, FACT create-a-policy.md; the automation is the issuer's system and holds the secret), rules: DENY `*` when `system.current_unix_timestamp >= expiry`; ALLOW `eth_sendTransaction` when `ethereum_transaction.to == Subscription`, `ethereum_transaction.chain_id == 11155111`, `ethereum_calldata.function_name == subscribe` (ABI inline). Two rules, nothing else.
4. Investor portal card StandingOrderCard: the policy in plain words, "Allow" (`useSigners().addSigners({address, signers: [{signerId, policyIds: [policyId]}]})`), "Run the month" (calls `POST /tick`, captioned "scheduler tick, simulated by this button"), "Remove signer" (`removeSigners`). Issuer console: a log panel fed by `GET /status` (policy created, deny rule added, tick results).
5. Env: `VITE_PRIVY_APP_ID`, `VITE_PRIVY_SIGNER_ID`, `VITE_AUTOMATION_URL` (app, all optional; unset means the current provider and no card); `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_AUTHORIZATION_KEY`, `PRIVY_SIGNER_ID`, `AUTOMATION_SIGNER`, `RPC_URL`, `CHAIN_ID`, `REGISTRY`, `SUBSCRIPTION`, `POLICY_ID` (automation). One switch: `VITE_PRIVY_APP_ID` set means Privy on the investor side, and the automation's `AUTOMATION_SIGNER=privy` is the server-side half of the same switch.
6. Docs: `docs/privy-standing-order.md`, README section "Privy" with file and line references, one evidence record with Sepolia hashes and no email address.

Cut:

- The 0.01 test ETH payment leg (agents case section 2 and step 6): it adds a third rule, a native transfer and a captioned "not linked on chain" gap for no gain in either track. Financial flow is claimed on the subscribe call from the Privy wallet, as spec-privy.md already argued; if the lead wants "transfers" in the submission text, the beat is the investor's own fund-token transfer, not this leg.
- The cut-in dashboard screenshot (step 4): the plain-words policy from `GET /policy/:address` replaces it.

Borrow, bounded:

- From investor-money case section 6: the provider wiring (PrivyProvider with email login and `createOnLogin: 'users-without-wallets'`, then QueryClientProvider, then `WagmiProvider` with `createConfig` from `@privy-io/wagmi`; disconnect calls Privy `logout()` because wagmi's `useDisconnect` is unsupported, research.md section 1). One file, `app/src/lib/PrivyWalletProvider.tsx`, chosen at `WalletProvider.tsx` when the app id is set.
- From lifecycle case section 7 test 5: the local expiry test with `evm_increaseTime` on anvil, in addition to agents test 9 (short expiry via `attestByOperator` on Sepolia).
- From lifecycle case section 8: the plan card's stop wording, "Stop it here at any time; the issuer's revoke stops it too."

Not borrowed: any quorum above 1-of-1, intents, webhooks, a second issuer, the swap door, FundDesk or GatedPayout, Privy's transfer action, onramps, Earn.

Branching (OPINION): branch from wp31-product-ui, not from main, because WP31 rewrote `wallet.ts` (+66 lines) and `ConnectCard.tsx` (+80) and the connect option lands there (section 9). If WP31 is merged first, branch from main after the merge.

Primary track: Best B2B financial product. Secondary: Best financial flow, claimed with the subscribe call and the sentence "an investor without a crypto wallet gets one at email sign-in and a savings plan she can stop with one button". Say both in the submission text only after acceptance tests 6 and 7 are green.

## 6. Fallback shape

Trigger: the Advanced tab shows "On-device" (3.2), or `policies.create` is refused on the free app, or `addSigners` fails on Sepolia within one bounded teammate task.

Shape: the investor-money core without the desk, which is spec-privy.md's minimum: email sign-in, embedded wallet, bind, present, attest, approve, `subscribe()` hand-clicked from the Privy wallet on Sepolia, revoke, refused subscribe. Financial flow track only; no control claimed; B2B not entered. The automation directory stays in local mode as documentation and is not in the video, not in the README's Privy section, and not in the submission text. Kill both if no app id exists by the morning of 2026-09-11 (agents case section 9): then Privy leaves the site footer and the sponsor list.

Do not ship the middle shape (a signer without an override policy): the delegation would be unbounded on Privy's side and the on-screen sentence would be false (lifecycle case section 9, decision point 1). Agreed.

## 7. Builder's morning steps, 2026-09-10, in order

Nothing below is done by an agent. Values in angle brackets are handed to the lead by name, never pasted into a chat.

1. Create the Privy account and app at https://dashboard.privy.io (app name "Attestat", environment Development). Record `<PRIVY_APP_ID>` and `<PRIVY_APP_SECRET>` (App settings, Basics and API keys pages; exact page names unverified).
2. Login methods: enable Email. Embedded wallets: leave defaults; the code sets `createOnLogin`. Allowed origins (Settings, Domains or Allowed origins; exact name unverified): add `http://localhost:5173` (or the app's Vite port; the builder reads it from the stack script) and, if a tunnel URL is used for the phone run, that URL.
3. Gate check, TEE: Wallets page, Advanced tab. Expected: "TEE enabled". If "On-device" with "Request access to migrate to TEE": click it, then tell the lead; the package switches to the fallback shape (section 6) unless access arrives the same day.
4. Wallet infrastructure, Authorization keys, "Create new key". The modal shows the key quorum ID and the private key. Key quorum ID goes to `<PRIVY_SIGNER_ID>` (used as `VITE_PRIVY_SIGNER_ID` and `PRIVY_SIGNER_ID`); the private key goes to `<PRIVY_AUTHORIZATION_KEY>` (automation only). Privy cannot recover it (3.3).
5. Gate check, policies: Wallet infrastructure, Policies, create one throwaway policy by hand (chain Ethereum, one ALLOW rule for `eth_sendTransaction` with `to` equal to any address). Expected: it saves and shows an id. If the page asks to upgrade or contact sales: tell the lead; fallback shape.
6. Sepolia: put the funded deployer key into a local signer (`cast wallet import nachweis-deployer --interactive`) and set `SEPOLIA_RPC_URL`; tell the lead the account name. The Sepolia deployment (handoff action 1) is a prerequisite of acceptance tests 6 to 9 and runs on the lead's thread.
7. Where the values go, all gitignored (check with `git check-ignore -v` from the app repository root; result in section 9): `nachweis-app/app/.env` gets `VITE_PRIVY_APP_ID`, `VITE_PRIVY_SIGNER_ID`, `VITE_AUTOMATION_URL`; `nachweis-app/automation/.env` gets `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_AUTHORIZATION_KEY`, `PRIVY_SIGNER_ID`, `AUTOMATION_SIGNER=privy`, chain addresses after the deployment. The teammate writes both `.env.example` files first; the builder fills the real files.
8. After the first email sign-in on Sepolia (acceptance test 5), send about 0.05 Sepolia ETH from the deployer to the embedded wallet address shown on the card; gas sponsorship is not relied on (3.6 unverified).
9. Later, for the record: the wallet version string from the iPhone's EUDI wallet app (handoff builder item), still missing from both evidence records.

## 8. Acceptance tests the build must meet

Class L (anvil, no Privy app), green by 2026-09-11:

1. `bun test` in automation/: for a Decision with expiry E and the configured addresses, `buildPolicy` returns exactly two rules: DENY `*` at `current_unix_timestamp >= E`, ALLOW `eth_sendTransaction` for Subscription, chain `CHAIN_ID`, function `subscribe`; after `Revoked` the rule set carries a DENY-all; after a fresh `Approved` it does not. Pass: assertions, no network.
2. Local stack (`scripts/browser-real-wallet-up.sh` with the automation in local mode) and `POST /tick`: after approve, 100 NDF minted to the dev investor; after revoke, the tick logs `TICK DENIED policy` (local evaluator) and `TICK DENIED chain` (revert). Pass: the three log lines in order.
3. Expiry on anvil: `attestByOperator` with expiry now plus 120 s, `evm_increaseTime` 121, tick denied by the timestamp rule and by the chain. Pass: both denials logged.
4. `tsc --noEmit` and `vite build` pass with `VITE_PRIVY_APP_ID` unset and set to a dummy; the WP31 Playwright specs and `app-e2e-local.sh --mode noir|browser|sp1-mock` pass with it unset; forge 97 passed, service 12 plus 3, companion 22, nargo 9 unchanged.

Class S (Sepolia, the builder's Privy app), green by 2026-09-12 or the package is not in the video:

5. Email sign-in creates an embedded wallet; the bridge accepts its EIP-191 session signature (`address-proof` 200); the official test wallet presents; attest, approve. Pass: hashes recorded, no email address in the record.
6. On `Approved`, the automation creates the policy; `GET /policy/:address` shows the two rules; the dashboard lists the policy id. "Allow" on the card returns a user whose wallet has `delegated: true`. Pass: policy id and delegation recorded.
7. `POST /tick` with the tab closed: one Sepolia hash from the embedded wallet, balance plus 100 NDF; a second tick, plus 100 again. Pass: two hashes.
8. Refusal by policy: a tick against a wrong target (the fund token address instead of Subscription, a debug flag on the tick) is refused by Privy before broadcast; status code and message logged. Pass: refusal recorded, no hash.
9. Revoke on Sepolia: the DENY-all rule appears on the policy within the automation's poll interval (state the interval on screen); the next tick is refused by Privy; `isEligible` reads false. Then "Remove signer": the next tick reports "no delegated wallet". Pass: all three recorded.
10. Short expiry on Sepolia: `attestByOperator` with expiry now plus 180 s for a second embedded wallet; after expiry the tick is refused by the timestamp rule and the chain. Pass: both denials recorded. (Optional if time is short; test 3 covers the logic.)
11. README section "Privy" with file and line references and the two on-screen sentences; submission text names "a standing order run under a policy copied from the on-chain decision". Pass: lead's review.

Kill criteria (from the agents case, adopted): no app id by the morning of 2026-09-11; TEE not enabled and no access the same day; `addSigners` or the server `sendTransaction` fails on Sepolia without an obvious cause within one bounded task; Privy's refusal cannot be shown as text; the Sepolia deployment is not green by 2026-09-11.

## 9. Code citations, checked

FACT (opus citation check 2026-09-09, read-only, nachweis-app main 5f5ceb9 and nachweis-app branch wp31-product-ui head 8fbf428). The citations the three investor-side cases rely on hold, with these corrections:

- contracts/src/AttestationRegistry.sol: approve :114 to :120, revoke :124 to :130, attestWithProof :155 to :179 (no modifier), attestByOperator :106 to :110, isEligible :187 to :191, setOperator :83, NoDecision revert :116 all match. Events Attested, Revoked, Approved are at :42 to :52 (the cited :40 to :52 includes OperatorSet and VerifierSet).
- contracts/src/interfaces/IEligibility.sol:11 to :18 Decision struct matches, six fields in the cited order.
- contracts/src/Subscription.sol:23 to :28 matches: non-payable, `isEligible(msg.sender, ...)`, mints demoAmount.
- contracts/src/FundToken.sol:61 to :66 matches with both exemptions; DEFAULT_REQUIRED_BITS is at :28 (the cited :25 to :27 is its comment).
- contracts/script/Deploy.s.sol: OPERATOR_ADDRESS is read at :24 (`vm.envOr("OPERATOR_ADDRESS", deployer)`) and used at :32; the cited :22 to :32 is the enclosing range.
- contracts/src/test/MockStable.sol exists: mUSD, 6 decimals, mint without access control. contracts/script/SwapPermissioned.s.sol exists (93 lines).
- app/src/lib/WalletProvider.tsx: chain :21 to :30, connectors :34 to :39 (`injected()` at :39), Privy comment :6 to :8. Identical on wp31-product-ui (diff against main is empty).
- app/src/lib/chain.ts: subscribe write at :207; approve and revoke at :205 to :206 inside `useRegistryTxChain` :189 to :209.
- app/src/lib/wallet.ts on main: 87 lines, `useChainWallet` :55 to :85 (the cited :55 to :90 overruns), `useWallet` export :87. On wp31-product-ui: 145 lines, connect options with ids `mock`, the dev signer id and the injected connector id, labels "Connect (mock wallet)", "Connect dev signer", "Connect <injected name>"; kinds `'injected' | 'dev' | 'mock'` at :11; Privy named in a comment at :14 to :15. The email option is a fourth kind here.
- app/src/components/DoorsCard.tsx: hook :13, handler :17, Subscribe button :35 to :37; Swap button disabled at :46 to :48 ("pool arrives with WP7").
- app/src/components/ConnectCard.tsx on wp31-product-ui: 70 lines, buttons rendered from the wallet options' labels (:59), "Switch to <chain>" (:46).
- app/src/config.ts: 14 VITE_ names, none for Privy. The only "privy" hit in app, service, contracts and scripts is the WalletProvider comment.
- WP31 screens: InvestorScreen renders Rail, ConnectCard, PresentCard, ProveCard, StatusCard, DoorsCard, HoldingsCard, HistoryCard, ChainPanel; IssuerScreen renders ConnectCard, IssuerPending, DecisionsTable, Receipts, EventLog, RevokeByAddress. StandingOrderCard goes after DoorsCard; the automation log goes next to EventLog.
- app/package.json on wp31-product-ui: react 19.2.8, react-router 7.18.3, wagmi 2.19.5, viem 2.56.3, vite 8.2.2; no Privy dependency.
- gitignore: `git check-ignore -v` reports app/.env (app/.gitignore:4), .env and automation/.env (.gitignore:13) as ignored. Morning step 7 is safe.

## 10. Honesty lines for the recommended build

Verbatim on-screen sentences, adjusted from agents case section 8:

- Investor card: "Wallet by Privy: an embedded wallet created at email sign-in. Your identity evidence never goes to Privy. Privy sees this address, the transactions it signs, and one policy: the issuer's automation may send subscribe() for you to this fund until your decision expires on <date>. When the issuer revokes your decision, its automation closes the policy; you can remove the signer here at any time. Sample identity from the official test wallet; testnet funds."
- Issuer panel: "Automation by Privy: the issuer's key signs on the investor's wallet only under a policy copied from her on-chain decision. Revoke on chain, then the automation adds a deny rule to that policy. Privy enforces the policy; Privy does not read the chain."
- Captions: "official test wallet, sample identity"; "proof made in this browser tab"; "scheduler tick: simulated by the Run the month button"; "demo fund: subscribe mints 100 NDF without payment"; "revocation: manual, by the issuer"; "the signer never sees the wallet's private key (Privy's statement)".
- Never: "within a block", "nothing about you on chain", "on the device", "first", "only", any yield figure, "KYC".

## 11. Dashboard facts to fill in

For the lead, from the browser teammate's inventory of the builder's Privy dashboard. Each line is one question; write the answer after the colon with the date and the dashboard page it was read on. The consequence column points to section 3.7.

1. Plan shown for the account and the app (Free, Core, Scale, Enterprise): unverified. Consequence: none by itself; the feature rows below decide.
2. App execution environment on Wallets, Advanced tab, exact label ("TEE enabled" or "On-device" with "Request access to migrate to TEE"): unverified. Consequence: On-device means fallback shape (section 6) until access is granted.
3. Wallet infrastructure, Policies: does "Create policy" (or the equivalent button) open a form and save a policy with one ALLOW rule for eth_sendTransaction, and what id does it return: unverified. Consequence: not creatable means fallback shape.
4. Wallet infrastructure, Authorization keys: does "Create new key" open the modal showing a key quorum ID and a private key: unverified. Consequence: not creatable means fallback shape (no signer possible).
5. Same page, "Register key quorum instead" (m-of-n with two public keys, threshold 2): present and saving, present but gated, or absent: unverified. Consequence: only backoffice and other-buyer; the recommendation does not depend on it.
6. Any page or banner naming Intents or Manual approvals, and its wording (creatable, "Enterprise", "contact sales"): unverified. Consequence: only backoffice and other-buyer.
7. Configuration, Webhooks: creatable in the development app, and any production or plan wording: unverified. Consequence: none for the recommendation.
8. Login methods: Email enabled or enableable: unverified. Consequence: required by every investor-side case; if missing, no case works this week.
9. Chains: is Ethereum Sepolia listed as enabled for the app, or is it a code-side setting only: unverified. Consequence: none expected; the docs tick Sepolia.
10. Allowed origins or domains page: name of the page and whether http://localhost with a port can be added: unverified. Consequence: morning step 2.
11. Gas sponsorship page: any testnet credit or "fund gas credits" wording: unverified. Consequence: none; the build funds the embedded wallet from the deployer (morning step 8).
12. The app id (not the secret) and the app's environment name, so the lead can put them into the two env files' example lines: unverified.

When 2, 3, 4 and 8 are answered yes, the recommendation in section 5 is final and the builder's morning steps 3 to 5 become confirmations rather than gates. When any of 2, 3, 4 or 8 is no, section 6 applies and the lead records the reason in decisions.md.


## 11a. Dashboard facts as read (browser teammate, 2026-09-09 night, FACT unless marked)

- Organisation ZKTREX, one member, plan Free (0 USD per month), 0 MAU and 0 signatures used; no payment method (https://dashboard.privy.io/billing).
- Existing app "openintents" (app id [id withheld], development mode, "can only support 150 users") belongs to another project of the builder; a dedicated app "Attestat" is being created (follow-up running).
- Policies (/policies): page exists, "Create policy" form opens fully (name, chain type EVM, SVM, Tron, Sui, XRPL, optional policy owner), no gate text. Creatable, self-serve.
- Keys and quorums (/authorization-keys): page exists, "Create key" form opens (key name, or register key quorum), no gate text. Creatable, self-serve. No separate Signers page.
- Intents: no sidebar page. Manual approvals: no sidebar page (closest: the optional policy owner field).
- Webhooks (/webhooks-history): self-serve wizard, no gate.
- Gas sponsorship (/fee-sponsorship): toggle exists, real use needs purchased credits. Consequence: the embedded wallet must hold Sepolia ETH for gas.
- Funding (/funding: card onramps, bank transfer, exchange, crypto deposits) and Earn (/earn, "Enable earn" button): present, not enabled, untested.
- Login methods on the existing app: Email on, SMS on (US and Canada), external wallets on, passkeys on, OAuth off, WhatsApp "Request access". Embedded wallet auto-create on login on, EVM.
- Default chain list: no dashboard setting found; chains are configured in the SDK (unverified whether any dashboard page exists).
- TEE execution label: "Wallet environment: TEE enabled" verbatim on both apps (Wallets, Advanced, tab More; https://dashboard.privy.io/apps/[id withheld]/wallets-advanced?wallets-advanced-tabs=more). The same tab offers "Enable asset swaps" (Uniswap-based, no gate); not used.
- Dedicated app created 2026-09-09 night: "Attestat", app id [id withheld], development mode, Email login on, embedded wallet auto-create on login on (EVM), allowed origins http://localhost:5173 and http://localhost:4173. Authorization key "attestat-automation", key quorum id [id withheld] (1 of 1). App secret and private key only in [local secrets path, withheld] (mode 600). [security note withheld]

Decision rule applied: questions 2 (TEE enabled), 3 (policy creatable), 4 (authorization key creatable) and 8 (Email login) are all yes. The agents recommendation is final; the builder's morning steps 1 to 5 are done or reduced to confirmations.

## 12. Unverified

- Whether a Privy app created in 2026 is TEE-enabled by default (3.2, morning step 3).
- `@privy-io/wagmi` 4.0.17 with wagmi 2.19.5, viem 2.56.3, vite 8.2.2, React 19 (all cases).
- Whether the embedded wallet signs on anvil 31337 (all cases; the build does not depend on it).
- The `@privy-io/node` option name for the authorization private key (agents research names `AuthorizationContext.authorization_private_keys`; lifecycle marks the constructor option unverified).
- Calldata `function_name` matching for a no-argument function (lifecycle case section 9).
- The exact status code and message of a policy refusal (agents case section 10).
- Dashboard page names for the app secret and allowed origins (morning steps 1 and 2).
- Whether the wp31-product-ui branch will be merged before the Privy branch is cut (section 5, branching).
