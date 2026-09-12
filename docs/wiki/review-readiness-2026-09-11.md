---
type: reference
title: Independent readiness review, 2026-09-11
updated: 2026-09-11
status: Review recommendations, no new builder decisions
---

# Independent readiness review, 2026-09-11

OPINION: Continue with the accepted Attestat direction and finish the submission. The engineering and Sepolia evidence justify that decision. Freeze feature expansion around the official-wallet, browser-proof, separate-approval and permissioned-pool journey. The commercial hypothesis remains unvalidated.

FACT: Four parallel, bounded reviews covered current code, journey evidence, product claims and submission requirements. The parent inspected the current landing page on port 8787 and checked primary documentation. Reviewed app `5f17c3a567d7ccf60c22454e50b971215fae394d`, site `3bbd038`, and wiki `6a79c66492b5a4ed3d526e00057d3e15698c4e5f`. All checks below were made on 2026-09-11 unless an earlier evidence date is explicit. Implementation files and live chain state were unchanged by this review.

## What changed since the previous review

FACT: The focus branches are merged locally. Current app runtime directories are unchanged from the previously reviewed `7c4a3bc`. The contract reviewer reproduced 155 passing offline Forge tests, with 20 fork tests skipped; 19 automation tests; app and automation typechecks; and a clean whitespace check on the builder's Mac. Forge ran in a scratch copy. The earlier reserve cap, sender eligibility and watcher retry fixes remain present. This review did not rerun the full browser, Rust, fork or build suites and is not a complete circuit audit.

FACT: GitHub metadata still shows the app repository as private, with remote main `46d834908d898eda7ffc96b74b2c2a15fd0dda5d`. Local app main is 34 commits ahead. The latest deployment, fixes and evidence are therefore not yet available to an unauthenticated judge at that repository. The selected decisions remain Classic plus Uniswap, Privy unclaimed, and publication subject to the builder's decision. See [decisions](decisions.md).

## New actionable defect

FACT, P2: A successful swap can be displayed and stored as refused. In [useSwap.ts:211](../../app/src/components/swap/useSwap.ts "line 211"), every preflight exception is converted into a refusal, including transport errors without contract revert data. The refusal branch sends the transaction, ignores the receipt status at line 221, and writes `swapRefused`. The reviewer executed the unmodified function in an isolated mocked harness: a preflight RPC timeout followed by a successful mined receipt produced a refused UI state and receipt entry. This predates the latest merge; it is newly identified in this review.

OPINION: Fix this before recording because the screen is being used as evidence of enforcement. Distinguish unavailable simulation from a decoded contract revert, and use the mined receipt as the final authority.

Acceptance: a transport failure cannot create a confirmed contract-refusal claim. A successful receipt yields a successful swap result even if preflight failed or previously reverted. A genuinely reverted receipt yields a refusal with the available decoded reason. A declined or unconfirmed transaction is labelled accordingly. Add focused regression coverage for these distinct outcomes.

## Evidence boundaries

| Claim | Finding and primary evidence |
|---|---|
| Official test wallet, browser proof, evidence followed by separate approval | FACT: recorded on app `e3b5ec3f0f1797af3f55dd140f38fdf203a3a091`, plain anvil, 2026-09-08. The record includes a session signature, browser proof, evidence-only state, approval and subscription. It explicitly excludes browser swap and revocation in that session. [Record](../evidence/browser-real-wallet-2026-09-08.md "line 7"). |
| Sepolia purchase and rejection after revocation | FACT: independently confirmed by public RPC. The [purchase](https://sepolia.etherscan.io/tx/0x59b0408d2e06a325cdc9f64586e8b3900b5271681d51118a20f84a9efa375474) succeeded, used 228,030 gas and transferred 90.652862473832711386 NDF for 100 mUSD. [Revocation](https://sepolia.etherscan.io/tx/0xa63ff4f0cbc42dfe978698f309caf5b31a3fd33d5b9ab6f4536cabb004e50a2c) succeeded. The [subsequent swap](https://sepolia.etherscan.io/tx/0xc6961750ab233d890a107091a981f059242138ec4d11e3e2b985a127479aff17) reverted with 77,809 gas. Historical `eth_call` at block 11676884 independently reproduced the wrapped `PermissionedHooks.beforeSwap` / `Unauthorized()` error. |
| Browser proof submitted on Sepolia, followed by separate approval and purchase | unverified: the Sepolia rehearsal used a stub relay and `attestByOperator`, which grants approval immediately. Its subsequent approval was idempotent. No phone or proof participated in that run. [Setup and result](../evidence/sepolia-journey-2026-09-10.md "line 11"), [operator path](../../contracts/src/AttestationRegistry.sol "line 104"). |
| A fresh address is ready for the phone take | FACT: at public RPC head 11684161, the prepared investor `0xC616e007DC6FF4ac26d938F5FB9F062470EAbA44` had 0.02 Sepolia ETH, nonce 0, and no evidence or approval. Its [funding transaction](https://sepolia.etherscan.io/tx/0xbbbc62f24ab1518a371f271d3ee7176babe082e1dff8d198b3c353c4c24c4a06) succeeded. The registry's verifier and sandbox issuer pin matched the deployment. The operator pays the proof transaction and also has sufficient funds at the sampled gas price. |

FACT: The circuit, Noir adapter, browser prover/worker and `service/src/noir.rs` are unchanged between the earlier official-wallet proof record and current main. This reduces the integration uncertainty; it does not establish that the combined journey has passed.

FACT: The [shot list:34](video-shotlist-spine.md "line 34") contradicts itself: it first requires an official-wallet journey on the same tree, then marks the gate met using no-phone evidence and excludes the phone leg. Actual Sepolia receipts justify Sepolia captions for those transactions. They do not justify presenting the entire official-wallet journey as already verified on Sepolia.

## One acceptance run

OPINION: After the swap fix, select one final commit and use the prepared fresh investor with the real relay. Follow [the existing deployment runbook](../demo-runbook.md), preserving one address, registry, chain and browser tab throughout:

1. Record the official test-wallet version, selected commit, deployment addresses and chain. Start with no evidence and no approval.
2. Sign the crypto-wallet session, present the sample credential from the official wallet, generate the proof in the browser, and obtain a successful `attestWithProof` receipt.
3. Before approval, require `statusOf = (true, false, false, expiry)` and `isEligible = false`. Both doors must remain closed. Capture read-only refusal checks.
4. Approve separately. Confirm eligibility, the explicitly free test subscription, and a purchase using test mUSD with a successful receipt and token transfer.
5. Revoke manually. Confirm the disabled Subscribe control, its decoded read-only refusal, and the pool's actual refusal. Distinguish mined rejection from a transaction that was never sent.
6. Save an evidence record with exact hashes, decoded results and measured durations from this take. Use those results in the video and submission wording.

Stop criteria: operator attestation replacing proof, stub wallet or relay, premature eligibility, wrong subject or issuer pin, missing proof receipt, failed proof, or a reload that loses the active session means the combined take has not passed. The [session](../../app/src/lib/sessions.ts "line 44") and [receipt](../../app/src/lib/receipts.ts "line 20") stores are in memory. A labelled separate-session or local-chain demonstration remains a fallback; it must preserve its actual evidence boundaries.

## Claims and publication repairs

| Repair | Grounding |
|---|---|
| Scope proof-verification claims to the proof path and retain issuer authority. | FACT: site:230 (nachweis-site/index.html (line 230)) says the chain verifies a proof and nothing else. The registry also accepts privileged operator attestations without a proof. |
| Describe the browser route's retained record accurately. | FACT: [submission:45](submission-text.md "line 45") and [shot list:50](video-shotlist-spine.md "line 50") retain presentation-record or names-to-issuer wording that conflicts with the blind browser route. An implemented match to an issuer's existing customer identity file remains unverified. |
| Use the accepted product sentence in the main claim. | OPINION: replace the unsupported universal passport-copy claim at site:46 (nachweis-site/index.html (line 46)) and its implication of complete onboarding replacement. Qualify the finance acceptance statement at site:260 (nachweis-site/index.html (line 260)) against the conditions in [Article 5f](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ%3AL_202401183). |
| Align network status and fallback wording. | FACT: site:291 (nachweis-site/index.html (line 291)), [feedback](../../FEEDBACK.md "line 7") and submission fallback text still contain pending or no-broadcast wording. A future fork recording cannot undo the existing Sepolia deployment. |
| Complete and accurately identify the sanitized spec bundle. | FACT: the copy contains all 49 pages selected by its script; validation reproduced 82 files, 129 relative links and zero broken links. However, [the script:31](../../scripts/wiki-copy.ts "line 31") excludes all `raw/`, while [raw/build-plan.md:12](raw/build-plan.md "line 12") contains substantive project gates and agent workstreams. [The manifest:48](README.md "line 48") incorrectly says these are not planning artifacts. Its source pin at line 5 also differs from the latest copy commit. Classify and include relevant sanitized plans and prompts, correct the manifest, and check coverage as well as links. |

FACT: Classic wording in `DISCLOSURE.md` and AI attribution is already corrected. Submission reminders asking for those changes are stale. The attribution's 289-commit count is explicitly tied to an earlier commit, so it need not equal current HEAD. The existing private wiki history and exported transcripts should remain outside the public repository; relevant unique planning content needs a sanitized representation.

FACT: The [official submission instructions](https://ethglobal.com/events/ethonline2026/info/details) require spec files, prompts and planning artifacts for spec-driven work. A successful relative-link check alone does not demonstrate complete coverage. They also require a 2 to 4 minute video at 720p or better, human narration and no speedup; cutting waiting is allowed. Final submission closes on **2026-09-13 at 18:00 Europe/Vienna**.

FACT: The [general rules](https://ethglobal.com/rules) require written pre-existing-work disclosure to ETHGlobal and full details in the submission. Delivery and the provenance of the reported Classic approval remain unverified. The [Uniswap prize requirements](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation) require public open-source code, `FEEDBACK.md`, its submitted feedback form and README implementation pointers. The file and pointers exist; public access and form receipts remain open evidence gates. The selected Classic application uses the unrestricted pool. Custom-domain hosting and Etherscan source verification are not stated requirements on that prize page.

FACT: Check-in 2's published schedule was 2026-09-11 at 05:59 Vienna, already past at this review. Optional status is the builder's recorded decision. Its completion remains unverified; this review does not reopen that decision.

## Product verdict

OPINION: Technical execution is the strongest judging dimension. Usability is constrained by the single-tab rehearsal model, and practicality by the missing customer workflow. Originality rests on the EUDI-to-browser-proof integration and its enforcement demonstration. The initial story and proof/refusal scene can make that contribution understandable without adding another showcase.

FACT: Reusable identity claims, wallet-linked registries and transfer eligibility are existing capabilities documented in [ERC-3643](https://docs.erc3643.org/erc-3643/smart-contracts-library/onchain-identities/identity-registry). The [official German sandbox](https://eudi-wallet.gov.de/en/news/testing-digital-credentials-in-the-eudi-wallet-sandbox) explicitly uses sample data. Neither source establishes demand for Attestat.

OPINION: The strongest buyer hypothesis is an EUDI evidence adapter for an issuer, transfer agent or issuance platform that already has onboarding and wallet permissions. Test whether it removes a concrete identity-intake or integration task while preserving customer matching, required records and revocation/exit policy. A second registry by itself is a weak advantage.

Commercial acceptance: document three real buyer workflows; at least two must identify the same costly gap, and one must commit to testing a bounded replacement against its current process. Record the existing provider and registry, the task removed, retained evidence and success criterion. This is a proposed decision gate, not a measured market result.

Kill or change the hypothesis if no task disappears, an incumbent already provides an adequate adapter, or necessary identity records make the proposed blind route unsuitable. Keep Privy and the parked financial showcases outside expanded claims until their own evidence exists. Persistent Privy policy recovery, FundDesk distribution entitlement and zero minimum swap output remain known limits, not reasons to enlarge this submission.

## Next actions in order

1. OPINION, code: fix the confirmed swap-result classification defect with focused regressions. Acceptance is defined above.
2. OPINION, demo: complete and record the fresh official-wallet journey on the selected final commit. If it fails, use explicitly labelled evidence that has actually passed.
3. OPINION, package: reconcile the claims and spec bundle, establish the written-disclosure record, publish the approved submission repository, verify unauthenticated links, and retain both ETHGlobal and Uniswap submission receipts. Keep Privy unclaimed under the existing decision.
4. OPINION, product: run the buyer workflow gate before expanding the commercial product.

FACT: This review records recommendations only. No implementation was changed, no transaction signed, no form or external message sent, and no repository pushed.
