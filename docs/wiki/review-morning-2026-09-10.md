---
type: reference
title: Independent review of the overnight focus branches
updated: 2026-09-10
sources:
  - wiki/handoff-2026-09-10-morning.md
  - wiki/review-product-focus-2026-09-09.md
  - nachweis-app (7c4a3bc)
  - nachweis-site (e194875)
  - https://ethglobal.com/events/ethonline2026/info/details
  - https://ethglobal.com/events/ethonline2026/prizes/privy
  - https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation
  - https://ethglobal.com/rules
---

# Independent morning review

OPINION: Accept the narrowing and retain the engineering fixes. The overnight work materially improves the submission candidate. The next gate is a coherent, recorded official-wallet journey on the chosen tree. Buyer usefulness remains unvalidated. The recommendations below are proposals, not new builder decisions.

FACT: Four independent parallel reviews covered code and existing tests, journey wiring and recording, product and site copy, and official submission rules. The parent inspected the live site, checked the preview server directory, reviewed relevant transcript passages, and independently fetched the official rules and schedule data. App main remains 46d8349. The combined branch is 7c4a3bc. Site focus-spine is e194875. Wiki baseline is 16f7375. No implementation was changed or merged, no chain transaction was made, and no secret was accessed for this review.

## Evidence and engineering verdict

| Area | Independent finding | Practical implication |
|---|---|---|
| Local gates | FACT: On wp41-all, offline Forge passed 155 tests, failed 0, skipped 20. Automation passed 19 tests. App and automation typechecks, app build, and diff whitespace check passed. Worktree stayed clean. | The reported local gates reproduce. Fork suites and browser integration were not rerun in this review. |
| FundDesk payout cap | FACT: Aggregate paidOut is updated before both stablecoin transfer paths and prevents distributions exceeding their budget. Existing regression tests pass. | OPINION: Keep the fix. It preserves reserves against the reported overpayment; it does not make distribution entitlement fair across transfers. |
| FundToken sender check | FACT: The shared transfer hook now checks sender eligibility, with explicit issuer exceptions. Existing tests cover revocation, expiry and reapproval. | OPINION: Keep the fix. Transfers back to the issuer remain possible, but that does not itself promise redemption. |
| Watcher retry | FACT: A failed policy update stops cursor advancement and retries its block. Existing tests pass. | OPINION: Keep this repair, but do not describe the automation as durably synchronized. Restart and reconciliation remain separate work. |
| Standing-order route | FACT: The missing route is registered and has a configuration explanation. | OPINION: Keep the correction even if scheduling stays outside the primary story. |
| Integrated journey | FACT: The wiring attaches the pool to the same registry, token and subscription used by the wallet stack. | OPINION: Useful integration work; its full official-phone path still needs execution. |

FACT, source and test references: [FundDesk](../../contracts/src/showcase/FundDesk.sol "line 168"), [distribution regressions](../../contracts/test/FundDesk.t.sol "line 439"), [sender check](../../contracts/src/FundToken.sol "line 65"), [sender regressions](../../contracts/test/Nachweis.t.sol "line 540"), [watcher cursor](../../automation/src/watch.ts "line 49"), [watcher tests](../../automation/test/watch.test.ts "line 43"), [route](../../app/src/showcase/registry.ts "line 20").

FACT, static review: Policy IDs and their associations are in memory. A restart can reconstruct a new remote policy while the investor's delegation still uses the original policy. Delegation lookup does not establish that the reconstructed policy is attached. Retrying whole blocks also replays successful earlier events, so full idempotency and recovery from uncertain remote responses are unverified. The on-chain eligibility check remains intact. This is a limit on the Privy policy synchronization claim, not evidence that revoked subscriptions succeed. Sources: [store](../../automation/src/store.ts "line 40"), [reconstruction](../../automation/src/watch.ts "line 89"), [delegation lookup](../../automation/src/signer.ts "line 79"), [chain check](../../contracts/src/Subscription.sol "line 25").

OPINION: These remaining automation and distribution limitations need explicit resolution before those components support a persistent financial product. They need not expand the narrowed video scope.

## The remaining demo gate

FACT: The September 8 official-wallet evidence covers browser proof, evidence awaiting approval, approval and subscription on local Anvil. The later pool rehearsal covers transactions and refusals with operator attestation. Neither establishes the complete official-phone journey through the pool and revocation in one session. The pool rehearsal records app_commit 46d8349, so its attribution to the final committed wp41-all tree is also unverified. This can reflect work performed before committing; it is a provenance gap, not proof that the rehearsal was invalid. Sources: [official-wallet evidence](../evidence/browser-real-wallet-2026-09-08.md "line 13"), pool run record (session transcript, not published), [handoff](handoff-2026-09-10-morning.md "line 38").

OPINION, acceptance sequence: Start a fresh fork, bridge and browser tab. Use one investor address and one registry throughout. Bind the crypto wallet, present the official test wallet's sample identity, prove in the browser, verify evidence with approval false, approve separately, show the short free demo mint, purchase test tokens through the pool, revoke, show eligibility false, the closed subscription control and the refused pool purchase. Save the exact commit and dirty-state status, deployment addresses, wallet version, receipts and measured timings in a sanitized record.

FACT: The shot list needs correction before filming:

- It proposes separate investor and issuer windows, but pending sessions and receipt history live in one tab's memory. Use header navigation in one tab, without reloading. [Sessions](../../app/src/lib/sessions.ts "line 1"), [receipts](../../app/src/lib/receipts.ts "line 1"), [shot list](video-shotlist-spine.md "line 35").
- It proposes clicking Subscribe after revocation, but the button is disabled. Keep that sensible UI behavior and film the actual pool refusal. [Control](../../app/src/components/DoorsCard.tsx "line 41"), [conflicting shot](video-shotlist-spine.md "line 52").
- The stated 90.65 NDF came from the setup probe; that probe changes pool state. Use the actual investor quote and receipt. Phone mirroring is also unverified. [Shot list](video-shotlist-spine.md "line 34"), probe record (nachweis-app docs/evidence/private/runs/20260909-211336-browser-pool/pool.log (line 5), not in this repository).

OPINION, kill criterion: If the combined phone run fails, fix that boundary or explicitly record the verified fallback with its privacy and chain captions. Do not add Privy or a new identity route to work around an unexplained failure.

## Product and site

OPINION: The focused demonstration is more persuasive because it makes one issuer decision visibly useful in two contracts. The strongest technical feature remains the official-wallet presentation, browser proof and separate issuer approval. Showing a paid test-asset swap gives the permission a concrete consequence. A recurring free mint does not strengthen the money story.

OPINION, suggested lead: Attestat helps a token issuer accept EUDI wallet evidence and apply its approval to an investor's crypto wallet. The prototype demonstrates this with an official test wallet, sample identity and test assets.

FACT: The product record still says no named operator has identified the step this replaces. OPINION: Buyer usefulness has not improved merely because more integration tests pass. Ask an issuer for an actual onboarding case, retained-evidence requirements, existing permission registry, costly failure and desired exit policy. Retain the previous proposed gate: three concrete workflows, two identifying the same costly gap, one willing to test a bounded replacement. Drop or change the buyer hypothesis if no replaced task emerges or the existing provider already solves it more simply. [Product record](product.md "line 21").

FACT: At review time, port 8787 served nachweis-site, the original toolkit site. The process working directory and HTTP response agreed. A separate local preview was started for the actual focus branch at [127.0.0.1:8788](http://127.0.0.1:8788/), and its two-card teaser and removed toolkit hero were verified in the browser. The original server was left intact.

FACT: Even the focus branch retains conflicting story elements. It says names reach the verifier in every route while describing a blind relay; the client route still says companion rather than browser; its scripted sequence approves before binding and illustrates a sale, although the selected evidence shows binding before proof and a purchase. The submission's absence-of-names claim also expands into an unsupported inability to identify a public wallet holder. Sources: site privacy paragraph (nachweis-site/index.html (line 230)), route (nachweis-site/index.html (line 240)), script sequence (nachweis-site/app.js (line 21)), script sale (nachweis-site/app.js (line 123)), [submission](submission-text.md "line 45").

OPINION: Keep the visual design, put the issuer workflow near the hero, and align the walkthrough, privacy map and captions with the selected browser run. Describe restrictions on new purchases precisely. Existing holdings, transfers and redemption need an explicit policy; blocked exits are not themselves investor value. Keep the gallery secondary and remove its competing sales pitches from the primary path.

## Decisions and submission

| Decision | Recommendation, all OPINION |
|---|---|
| Narrowing and branches | Yes. Retain wp41-all's repairs and integration glue. Land a coherent site and recording copy correction, then use the chosen tree for the complete phone acceptance run. Rejection of the pitch would not justify discarding useful fixes. |
| Sepolia | Separate decision. Establish the phone run on the fork first. Public receipts are useful additional evidence, but a clearly labelled fork is a viable baseline. Explicitly pin the sandbox issuer if deploying; the deployment script defaults to a fixture pin. |
| Privy | Optional for the baseline. Require a real Privy-mediated action inside the same journey before claiming a track. An embedded-wallet purchase is a narrower Financial Flow candidate; an issuer control could support B2B. Neither is verified here. Do not expand into scheduling merely to justify the sponsor. |
| Money beat | Pool purchase. Keep free subscription brief and labelled as a demo mint. |
| zkPassport | Leave the existing flag off and omit it from the video. Avoid a removal diff unless it causes a concrete build or runtime problem. |
| Classic and notice | Preserve the selected framing while recording the source of the claimed approval. Complete written disclosure if it has not been delivered. Eligibility remains unverified; an agent's label cannot settle the library interpretation. |
| Hosting and wiki | Prepare the submission video and public source first. Keep wiki history private and publish sanitized planning artifacts. Static hosting can be prepared separately; a hosted proving app needs verified isolation headers and backend access boundaries. |

FACT: Privy's prize requirements specify a functioning Privy wallet integration, with a financial action or a controlled business workflow as appropriate, but no mandatory Sepolia chain. Sepolia plus Privy is this project's implementation choice. [Privy requirements](https://ethglobal.com/events/ethonline2026/prizes/privy). The sandbox pin default is in [DeployNoirVerifier](../../contracts/script/DeployNoirVerifier.s.sol "line 29").

FACT: ETHGlobal requires written disclosure of reused work to its team as well as details in the submission. No universal prior-approval requirement for Classic was found; organizer evidence matters here because the project already reports an approval and its library boundary is disputed. The written notice remains recorded as unsent. [Rules](https://ethglobal.com/rules), [checklist](submission-checklist.md "line 50").

FACT: The spec copy has 40 source pages plus README, matching pinned wiki 5f6271e. Six planning pages are withheld, links are unresolved, later updates are absent, and AI attribution points to missing artifacts. It is not complete. OPINION: Redact sensitive details, refresh the copy, include substantive prompts and decisions, and fix the links. Raw transcript publication is not a stated requirement; omitting all unique planning content in those transcripts would still leave a gap. [Copy manifest](README.md "line 21"), [attribution](../ai-attribution.md "line 47"), [artifact rule](https://ethglobal.com/events/ethonline2026/info/details).

FACT: Moving a tracked transcript or adding an ignore rule does not remove it from Git history. OPINION: Preserve the private wiki history and make a sanitized submission copy; do not publish the wiki merely to expose specs. Copy preparation, claim correction and line-reference repair are agent work. Device operation, narration, account receipts and authorization for external submission require builder participation.

FACT: Uniswap requires public open-source GitHub code, FEEDBACK.md, its feedback form and README implementation pointers. The form is still a separate completion gate. [Uniswap requirements](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation).

FACT, checked 2026-09-10: Check-in 2 is Friday, September 11 at 05:59 Vienna. The official event response returned HTTP 500 but contained the published, confirmed schedule item project-check-in-2-due at 2026-09-11T03:59:00Z. The pasted shorthand saying Thursday 05:59 is incorrect for Vienna. Final submission is Sunday, September 13 at 18:00 Vienna. The demo must be 2 to 4 minutes, at least 720p, with spoken human narration and no speed-up to fit the limit. The planned 195 seconds is within the limit, but it is an unrecorded script duration. [Schedule](https://ethglobal.com/events/ethonline2026), [submission details](https://ethglobal.com/events/ethonline2026/info/details).

## Next work in order

1. OPINION: Confirm or submit check-in 2 and establish the disclosure record. Acceptance: account receipt and delivered notice or existing equivalent, with approval provenance recorded separately.
2. OPINION: Freeze the core scope and reconcile site, shot list, submission and evidence captions. Acceptance: all describe the same browser route and actual purchase direction; no promised clickable refused subscription or unmeasured amount.
3. OPINION: Run and capture the complete official-wallet journey on the chosen final tree. Acceptance: the sequence and evidence record above, including separate approval and the refused purchase.
4. OPINION: Select the submission recording from that verified baseline. Add Sepolia and one real Privy action only if they pass their own acceptance gates without displacing it.
5. OPINION: Finish sanitized source/spec publication, video, README references and forms. Acceptance: publicly resolvable required links, accurate final claims, playable video and submission receipts.
6. OPINION: Validate the issuer's replaced task before any further product expansion. Acceptance and kill criteria are in the product section above.

OPINION: Technicality and a memorable proof-to-enforcement demonstration are credible strengths. Practicality and buyer need are still the weakest evidence. This review cannot estimate finalist probability from commit counts, test counts or feature breadth.
