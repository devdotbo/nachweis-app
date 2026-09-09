---
type: reference
title: Attestat product focus, independent review
updated: 2026-09-09
status: Review findings and proposed direction for builder review
sources:
  - /Users/bioharz/git/ethglobal/nachweis/wiki/handoff-fable-2026-09-10.md
  - /Users/bioharz/git/ethglobal/nachweis/2026-09-09-201235-from-lastet-agent.txt
  - /Users/bioharz/git/ethglobal/nachweis/wiki/product.md
  - /Users/bioharz/git/ethglobal/nachweis/wiki/decisions.md
  - /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/evaluation.md
  - /Users/bioharz/git/ethglobal/nachweis-app at 46d8349
  - /Users/bioharz/git/ethglobal/nachweis-site at 693821e
---

**OPINION: Keep the EUDI-to-wallet technical core and narrow Attestat to one issuer integration workflow. The exploration produced useful components, but the portfolio has not established a useful business.**

The strongest product hypothesis is EUDI evidence intake and wallet approval for a token issuer or tokenization platform. The investor portal demonstrates that integration. Lead with one investor requesting access to one instrument and completing one transaction. Keep the toolkit explanation behind that concrete use. Freeze new business cases while testing which existing issuer task this replaces.

Proposed product sentence: Attestat lets a token issuer accept evidence from an investor's identity wallet, approve the linked crypto wallet, and enforce that approval when the investor buys or trades, without publishing identity documents.

This describes a proposed product focus. The current demonstration uses the official German test wallet with sample identity and an age predicate. Broader investor qualification and commercial usefulness remain unverified. The issuer's approval remains a distinct decision.

**What the experiment established**

FACT, reviewed 2026-09-09: Seven bounded reviews covered the transcript and intent, implemented use cases, official judging requirements, competing capabilities, product UX, an adversarial product challenge, and isolated reproduction of two code failures. Initial reviews ran in parallel; validation followed their findings. App HEAD was 46d8349, site HEAD 693821e, and wiki HEAD 200ac36 before this review. Runtime repositories were inspected without modification. The handoff's recorded full-suite results were not rerun here.

FACT: Building all five cases and reframing the project as a toolkit was an explicit builder instruction. It was an authorized comparison experiment. Earlier, the builder had requested five alternatives, evaluation, and implementation of the best. The later expansion changed that scope. See [transcript:168](/Users/bioharz/git/ethglobal/nachweis/2026-09-09-201235-from-lastet-agent.txt:168), [transcript:1478](/Users/bioharz/git/ethglobal/nachweis/2026-09-09-201235-from-lastet-agent.txt:1478), and [decisions:77](/Users/bioharz/git/ethglobal/nachweis/wiki/decisions.md:77).

OPINION: Fable performed the implementation experiment substantially, but the selection process never reconciled the resulting businesses. The old product document rejects a general attestation layer, while the toolkit pitch lists multiple buyers and consumers. Those are different positioning choices. A gallery demonstrates possible applications; it does not choose a customer. See [product:39](/Users/bioharz/git/ethglobal/nachweis/wiki/product.md:39) and [toolkit pitch:24](/Users/bioharz/git/ethglobal/nachweis/wiki/pitch-toolkit.md:24).

FACT: The 34/40 standing-order score assessed enabling capability, Privy fit, feature availability, buildability, product fit, demo strength, honesty and overlap. It did not assess observed buyer pain or adoption. The product document explicitly records that no named operator has identified the step Attestat would replace. See [evaluation:37](/Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/evaluation.md:37) and [product:21](/Users/bioharz/git/ethglobal/nachweis/wiki/product.md:21).

OPINION: Treat that score as a historical implementation recommendation. A useful product need not enable something previously impossible. It must improve a concrete workflow enough that someone chooses to use it. The appropriate next experiment is comparison with an operator's current process.

**Why I would not make the standing order the main product**

FACT, primary documentation checked 2026-09-09: Privy already provides delegated recurring execution and wallet restrictions. Tokeny already documents investor qualification, registry inclusion and revocation. Privado ID documents reusable proof verification across contracts. These sources establish adjacent capabilities, not market demand or production equivalence with Attestat. [Privy signers](https://docs.privy.io/wallets/using-wallets/signers/overview), [Privy policies](https://docs.privy.io/controls/policies/overview), [Tokeny qualification](https://docs.tokeny.com/docs/qualify-investors), [Privado verification](https://docs.privado.id/docs/verifier/on-chain-verification/overview/).

OPINION: Generic automation, a common allowlist, and reuse of a proof are weak novelty claims. Attestat's most interesting demonstrated asset is the conversion of an official EUDI wallet presentation into a client-generated proof that can participate in wallet authorization. A specific issuer integration is a better starting point than a new fund-management or treasury product.

The reviewers differed on recurring investment. One preferred an eligibility-aware purchase plan, with actual payment, clear pause reasons, renewal and cancellation. The adversarial reviewer preferred the EUDI connector because the need for recurring-policy synchronization is unproven. My recommendation follows the latter for the primary product. Retain the plan as a candidate feature only if an issuer identifies its operational value.

FACT: Privy documents simulation before policy evaluation for operations it signs and broadcasts. A reverting contract call can already prevent signing and broadcasting. Consequently, the mirror must demonstrate a benefit beyond the general claim that it prevents a failed transaction. A failed simulation also does not prove that the mirror's policy denied the request. [Policy evaluation](https://docs.privy.io/controls/policies/overview).

**Filter for the current cases**

OPINION: The table is a focus recommendation, not an accepted builder decision. Commercial demand remains unverified across every row. Parking means removing a case from the main pitch and release workload while preserving its code and research.

| Case | Recommendation | Reason and promotion condition |
|---|---|---|
| EUDI investor flow | Keep as the spine | Strongest distinctive technical evidence. One investor, one issuer, one linked wallet. Explain the age predicate and separate approval accurately. |
| Uniswap permissioned purchase | Keep as the principal transaction outcome | An actual exchange of test assets already works on a local fork. Integrate it with the same official-wallet journey and show a refused purchase after revocation. No sell-direction claim without evidence. |
| Investor money / FundDesk | Narrow to a possible paid-subscription alternative | Payment is useful; distributions introduce unrelated fund accounting and a reproduced defect. A primary subscription and a pool purchase are alternative main actions, not both mandatory beats. |
| Standing order | Demote to an optional feature | Current execution is a free mint. Promote only with a bounded paid action, reliable synchronization, cancellation, and a buyer reason for delegated execution. |
| Savings plan | Merge its useful lifecycle states into the core | Expiry and pause reasons belong to the same product. Drop the separate case, second issuer, and broad claim that every transfer closes. |
| Backoffice | Fold into the issuer console if needed | An approval control can strengthen the issuer workflow. It does not require a separately marketed compliance product. |
| Contractor payout desk | Park | It changes the customer to an employer and does not establish why this particular evidence predicate is needed for payment. |
| zkPassport | Keep optional and out of the main story | It is an alternative evidence adapter. A bound phone run and a concrete audience need should determine promotion. It is not eIDAS evidence. |
| Additional national systems and prover variants | Technical appendix | Research compatibility and alternative proof runtimes do not establish working product integrations. |

FACT, evidence boundary: The recorded official-wallet run used a physical iPhone for the credential and desktop Chrome for proving, then attested, approved and subscribed on Anvil using a development crypto signer. It did not demonstrate the combined Privy wallet, paid fund desk or Uniswap journey. [Official-wallet record:7](/Users/bioharz/git/ethglobal/nachweis-app/docs/evidence/browser-real-wallet-2026-09-08.md:7).

FACT: The pool purchase and refusal are recorded on a local Sepolia fork. The new showcases use local operator attestations or mock proof inputs and local signers. Real Privy API checks established selected policies, signatures and quorum behavior, but they do not establish the complete investor journey. No public-chain deployment is recorded at the reviewed heads. [Swap evidence:17](/Users/bioharz/git/ethglobal/nachweis-app/docs/swap.md:17), [showcase screenshot provenance](/Users/bioharz/git/ethglobal/nachweis-app/docs/ui/README.md:30), [Privy run status:95](/Users/bioharz/git/ethglobal/nachweis-app/docs/privy-standing-order.md:95).

**Findings that change the recommendation**

1. FACT: The standing order invokes zero-argument Subscription.subscribe(), which mints a fixed number of demo units without payment. The paid subscribe(uint256) lives in a separate FundDesk deployment. Combining them is implementation work, not a copy change. [Subscription:23](/Users/bioharz/git/ethglobal/nachweis-app/contracts/src/Subscription.sol:23), [automation target:14](/Users/bioharz/git/ethglobal/nachweis-app/automation/src/chain.ts:14), [FundDesk:119](/Users/bioharz/git/ethglobal/nachweis-app/contracts/src/showcase/FundDesk.sol:119).

2. FACT, reproduced in this review: FundDesk distributions can be claimed twice using the same transferable units. Alice subscribed 100 mUSD; the issuer funded a 10 mUSD distribution; Alice claimed 10, transferred all units to eligible Bob, and Bob claimed another 10 from the same distribution. The desk then held 90 mUSD against 100 mUSD redemption liability. Full redemption reverted with ERC20InsufficientBalance. Claim entitlement uses current balances and per-address claim flags, while payout and redemption share the same reserve. A caption saying there is no snapshot does not make the accounting safe. Exclude distributions from the selected demo until the entitlement and reserve invariants are repaired. [Entitlement:160](/Users/bioharz/git/ethglobal/nachweis-app/contracts/src/showcase/FundDesk.sol:160), [payout:173](/Users/bioharz/git/ethglobal/nachweis-app/contracts/src/showcase/FundDesk.sol:173), [redemption:203](/Users/bioharz/git/ethglobal/nachweis-app/contracts/src/showcase/FundDesk.sol:203).

3. FACT, reproduced with the actual watcher and a deterministic backend: One failed addRule request generated one error, but three polls advanced through blocks 10, 11 and 12 with only one update attempt. The deny rule remained absent. The event handler swallows the error and the poll advances its cursor. INFERENCE for live Privy: if the failed request did not apply remotely, the policy can remain stale. This is not evidence that revoked investment succeeds: the contract's eligibility check and existing expiry rule still apply. Retry, reconciliation and truthful status are needed before promoting policy mirroring as a dependable feature. [Handler:65](/Users/bioharz/git/ethglobal/nachweis-app/automation/src/watch.ts:65), [cursor:48](/Users/bioharz/git/ethglobal/nachweis-app/automation/src/watch.ts:48), [registry enforcement:189](/Users/bioharz/git/ethglobal/nachweis-app/contracts/src/AttestationRegistry.sol:189).

4. FACT: FundToken checks the recipient of a transfer. A revoked sender can still transfer to an eligible recipient. Separately, FundDesk blocks redemption and claims when the caller loses eligibility. OPINION: Define new-purchase restrictions and treatment of existing holdings explicitly. A blanket everything-closes story can present trapped investor funds as a benefit. The issuer's intended exit or exception process is a product decision that remains open. [Transfer check:61](/Users/bioharz/git/ethglobal/nachweis-app/contracts/src/FundToken.sol:61), [FundDesk redemption:203](/Users/bioharz/git/ethglobal/nachweis-app/contracts/src/showcase/FundDesk.sol:203).

5. FACT: The public-facing gallery routes working-demo links to localhost. The standing-order link advertises a route absent from the app registry, which redirects unknown cases to the investor home. The fund desk sends unapproved users to another route for identity. OPINION: One connected journey and one usable entry point would improve the product more than another landing page. [App origin:12](/Users/bioharz/git/ethglobal/nachweis-site/showcase/links.js:12), [gallery link:241](/Users/bioharz/git/ethglobal/nachweis-site/showcase/index.html:241), [case registry:16](/Users/bioharz/git/ethglobal/nachweis-app/app/src/showcase/registry.ts:16), [identity detour:101](/Users/bioharz/git/ethglobal/nachweis-app/app/src/showcase/investor-money/InvestorMoneyPage.tsx:101).

FACT: Isolated verification comprised one Foundry regression reproducing duplicate payout and failed full redemption, plus a deterministic Bun watcher reproduction. Neither changed the application repository or used a live provider. Reproduction files and captured outputs are currently retained in [/var/folders/9s/_x0v2y650wq5yftcvb080kdr0000gn/T/attestat-review-52kq7r0n](/var/folders/9s/_x0v2y650wq5yftcvb080kdr0000gn/T/attestat-review-52kq7r0n). This temporary directory may not survive system cleanup; the behavioral steps above are the durable reproduction specification. No claim of a comprehensive security audit is made.

**One demonstration to finish**

OPINION: Use the existing investor and issuer roles. The primary journey should contain these observable states:

1. An investor requests access to one demo instrument and connects a crypto wallet. Use the Privy embedded wallet here if the real integration passes.
2. The official test wallet supplies sample identity evidence; the investor's browser generates the proof. Show the proof location and the public statement briefly.
3. The screen distinguishes valid evidence from issuer approval. A proof alone does not authorize a purchase.
4. The issuer approves. The same crypto wallet buys the demo asset through the permissioned Uniswap pool. Show test-asset balances and a confirmed transaction.
5. The issuer manually revokes. The next purchase is refused. State which contract or policy produced the refusal and display existing holdings accurately.

A paid primary subscription can replace the pool purchase if it produces the clearer, verified journey. Do not make the viewer visit both financial products or a gallery to understand Attestat. Reuse can be demonstrated with one small secondary consumer view after the main outcome is clear. Scheduling, quorums and other evidence providers are optional supporting material.

Acceptance: one address throughout evidence binding, approval and transaction; one chosen deployment configuration; successful and denied actions; expiry and replay checks; explicit handling of existing holdings; a usable entry URL or reproducible judge runbook; a sanitized combined evidence record. A collection of separate passing component scripts does not meet this acceptance test.

**Finalist assessment and sponsor fit**

FACT, official event page checked 2026-09-09: ETHOnline judges technicality, originality, practicality, usability including developer experience, and memorable impact. It publishes no weights or success probabilities. Finalist presentation allocates four minutes to the demo and three to questions. Partner evaluation is separate. [ETHOnline judging](https://ethglobal.com/events/ethonline2026/info/details).

OPINION: Technicality is the strongest present asset. Practicality and usability are weaker because the combined journey is unverified and the customer task remains a hypothesis. Originality should rest on the specific EUDI-to-client-proof integration. The memorable scene is a real wallet presentation leading to a real permitted action and a clearly explained refusal. Eight case cards do not strengthen those outcomes. I see a credible submission direction, but no basis for predicting finalist selection.

FACT: Privy requires a working core integration. Its B2B track requires an organizational workflow and a functional control; its financial-flow track requires a completed action through a generally available feature. Sepolia is the project's internal evidence choice, not an explicit chain requirement on that page. [Privy prizes](https://ethglobal.com/events/ethonline2026/prizes/privy).

FACT: Uniswap's Stack Contribution track accepts integrations and requires public source, integration pointers, FEEDBACK.md and the linked feedback-form submission. [Uniswap prizes](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation).

OPINION: Select the Privy claim that the chosen journey actually supports. Do not preserve a separate business merely to claim another track. Keep the recorded Classic decision and recover the source of the builder's approval; the review has not independently confirmed that approval. Disclose reused and AI-assisted work according to the event rules. [Recorded decision:70](/Users/bioharz/git/ethglobal/nachweis/wiki/decisions.md:70), [event requirements](https://ethglobal.com/events/ethonline2026/info/details).

**Commercial validation and kill criteria**

OPINION: Test one buyer hypothesis: the product or engineering lead of a token issuer/platform needs EUDI evidence intake linked to its existing qualification and wallet-access process. Do not claim a Tokeny or ERC-3643 integration exists. Build an adapter to an existing platform only after its interface and missing task have been established.

Use three concrete workflow reviews with issuer/platform operators. Ask for a recent onboarding or permission-change example, the current tools, required evidence, manual work, and the exact point Attestat would replace. Show the workflow before asking whether they want ZK. A proposed initial promotion gate is two operators identifying the same costly gap and one agreeing to test against its own acceptance criteria. This is a small qualitative gate, not a market-size estimate. No customer contact was undertaken in this review.

Kill or change the issuer-integration hypothesis if operators cannot identify a replaced step, their existing provider already supplies equivalent EUDI intake with less work, the integration requires replacing their qualification platform, or the desired intermediary privacy benefit disappears under their evidence requirements. If the connector helps but recurring purchases do not, drop the recurring feature. If the issuer job fails altogether, reevaluate the business before extending the technology to payroll or other national systems.

**Proposed next work for Fable**

1. Reconcile the product sentence, app entry and submission story around one issuer workflow. Keep the gallery as secondary engineering documentation. Acceptance: one buyer, one primary action, one entry point, and no unsupported product promise. Kill criterion: no concrete issuer task can be named without listing infrastructure capabilities.
2. Finish the selected combined journey using existing components. Remove distributions from its active path. If mirroring is included, repair and test failed-update recovery. Acceptance: the combined record and failure cases above. Kill criterion for an optional component: it cannot demonstrate its claimed behavior in the chosen real integration; remove it from the primary demo.
3. Prepare the release evidence, public source and focused video only for the retained scope. Correct misleading route, state and revocation wording. Acceptance: a reviewer can reproduce the selected journey and distinguish measured behavior from plans.
4. Validate the issuer workflow before expanding product scope. Acceptance and kill criteria are stated above. Sponsor fit and passing scripts do not substitute for this decision.

The two technical defects are open findings. This review records evidence and a recommendation; it does not implement a pivot or change the builder's decisions.
