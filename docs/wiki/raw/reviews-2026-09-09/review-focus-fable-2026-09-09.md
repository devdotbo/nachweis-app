Independent focus verdict (Fable reviewer, 2026-09-09 about 21:10 Vienna). Read-only. Every sentence FACT (cited) or OPINION.

## 0. Headline

OPINION: Agree with the GPT review on the spine and on parking most cases; disagree on two rows: the standing order should stay as the single Privy beat inside the spine (not "optional feature"), and the fund token door should not be dropped in favour of the pool as sole transaction. OPINION: The toolkit framing must go from the main page; it contradicts the project's own product page.

## 1. Per case

- EUDI investor flow: keep as spine. FACT: it is the only flow with an official-wallet run (W class), recorded at nachweis-app/docs/evidence/browser-real-wallet-2026-09-08.md:7 per wiki/review-product-focus-2026-09-09.md:62. Sponsor consequence: none lost.
- Uniswap permissioned purchase: keep as door two of the spine, not as the sole transaction. FACT: the in-app swap door and refusal are green on a local Sepolia fork (WP35, wiki/handoff-fable-2026-09-10.md:57). FACT: the pitch already carries "one permission, two doors" as the sentence a judge should repeat (wiki/pitch.md:19). OPINION: two doors plus one revoke is the memorable scene; the pool alone is a gated swap, which raw/synthesis.md:20 records as a losing framing. Sponsor: keeps Best Uniswap Stack Contribution (public repo, FEEDBACK.md, form still due, wiki/sponsors.md:28).
- Standing order: keep as secondary, one beat inside the investor portal, gated on a green Sepolia Privy-mode tick. FACT: it lives in the investor portal, not as a showcase route (wiki/handoff-fable-2026-09-10.md:62; nachweis-app/app/src/showcase/registry.ts:16-21 has no standing-order entry). FACT: it is the only case whose Privy control is a function of the decision (wiki/privy-cases/evaluation.md:25). FACT: subscribe() mints demo units without payment and the watcher swallows a failed addRule (review :68, :72). OPINION: GPT's "Privy simulation already reverts" point does not remove the B2B story, because the policy's expiry rule and deny rule are the organizational control the track asks for ([event wiki, local, withheld]). Sponsor: this beat is the whole Privy B2B claim; without it no Privy track is claimable with a control. Conditions: caption "demo units, no payment" and either fix the swallowed error or caption the mirror as best effort.
- Investor money / FundDesk: fold, off the video. FACT: distributions can be claimed twice, reproduced (review :70). OPINION: paid subscribe is the only piece worth reusing, and only if the builder wants a payment leg in the spine. Sponsor: Best financial flow becomes weak (the standing-order subscribe from an embedded wallet is the remaining claim; evaluation.md:159 argues it counts, unconfirmed by Privy).
- Savings plan: park. FACT: its h1 says "One revoke closes every door" (nachweis-site/showcase/savings-plan/index.html:42) while FundToken gates the recipient, not the sender (handoff:60). FACT: evaluation.md:169 already says its doors repeat the existing two. Sponsor: nothing lost.
- Backoffice: park, post-deadline follow-up. FACT: the evaluator named it the natural follow-up because it replaces the operator key (evaluation.md:181). FACT: the 2-of-2 quorum reads as a multisig (evaluation.md:129). Sponsor: nothing lost while the standing order carries B2B.
- Contractor payout desk: park. FACT: fit scored 1 because the buyer is an employer (evaluation.md:150). Sponsor: nothing lost.
- zkPassport: remove from the story, keep the flag. FACT: off by default, one revert commit, no phone run, no prize track (handoff:55; wiki/pitch-toolkit.md:62). Sponsor: none.
- Other national systems: appendix in nachweis-app/docs. FACT: nothing built, sentences only quoted on the gallery (handoff:58). Sponsor: none.

## 2. Product sentence and primary journey

OPINION: Keep the sentence at wiki/product.md:11 unchanged, without the "Attestat is the toolkit" prefix. OPINION: The primary journey is pitch.md beats 1, 2, 3, 3a, 4, 6, 7 as written on 2026-09-08 (wiki/pitch.md:25-32), with the standing order as one ten-second insert between beats 4 and 6 if green on Sepolia, otherwise cut.

Why it beats toolkit plus gallery: FACT: product.md:39 rejects "attestation hub or compliance layer" and cites the count that six finalists out of 302 identity projects all had identity inside a wanted product, none as a layer (raw/synthesis.md:20). FACT: the toolkit sentence on the site says "any door can read it" (nachweis-site/index.html:49), which is the layer framing. FACT: the word "toolkit" appears 19 times on the site and zero times in the app (subagent grep, 2026-09-09). OPINION: a judge who follows the one allowed click lands on an investor portal that never mentions a toolkit, so the video and the site would describe two products. FACT: nothing is green for W, D or S in the showcase (handoff:49), and badges are hand-written (pitch-toolkit.md:78). OPINION: eight cards with "pending" badges read as eight unfinished things, and the finalist cut needs one memorable sentence ([event wiki, local, withheld]). OPINION: where I disagree with GPT: the toolkit is real as architecture, so the gallery can survive as an unlinked engineering page; it must not be the pitch.

## 3. What confuses a first-time judge today

1. FACT: the main page defines the product twice, at nachweis-site/index.html:49 (toolkit) and :282 (toolkit prefix plus product sentence), under a passport question h1 at :46. FACT: three hero buttons at :51-53; pitch-toolkit.md:80 already flags the third as one too many.
2. FACT: counts disagree: :49 enumerates five things, the teaser :283-308 shows four cards, the gallery says "Eight demos" (nachweis-site/showcase/index.html:187), the app registry has four routes (registry.ts:16-21), the wiki has five folders with different names (agents, lifecycle, other-buyer vs standing-order, savings-plan, payout-desk).
3. FACT: every demo link points to localhost (nachweis-site/showcase/links.js:12); the standing-order card links a route not in the registry (showcase/index.html:241) and unknown routes redirect to "/" (nachweis-app/app/src/App.tsx:106).
4. FACT: the app entry says "Investor portal" (nachweis-app/app/src/screens/InvestorScreen.tsx:53) and the top bar has no Showcase link (nachweis-app/app/src/components/TopBar.tsx:25-32).
5. FACT: README.md:11 still says Continuity while the decision is Classic (handoff:167). FACT: Privy sits in the site footer while the eligibility question was never sent (sponsors.md:37).
6. FACT: the backoffice page says quorum availability is "not yet verified" although the demo settled it (handoff:170).

## 4. Cheapest change set

OPINION, ordered by decision points:

A. Site copy only, one file, about six hunks: delete :49 and :53 on nachweis-site/index.html, strip the toolkit prefix at :282, cut the teaser to two cards (EUDI flow, Uniswap pool) or retitle it "Also built, demos on anvil", drop the nav item at :24-31 and keep the footer link at :310. Decision: gallery linked from footer or not at all.
B. Gallery, two hunks: change the lede at showcase/index.html:39 to "Demos built on Attestat", fix the standing-order link at :241 to "/", mark the four parked cards "parked" in the badge. No deletions.
C. App: zero diff for the spine. Optional one-line flag on nachweis-app/app/src/App.tsx:105 to hide /showcase. Decision: hide or leave unlinked.
D. Wiki: pitch-toolkit.md status "superseded", one decisions.md entry, submission-text.md from product.md:11 plus pitch.md beats. Bookkeeping, Opus.
E. Not a diff, the real work: Sepolia deploy of the spine contracts only (registry, verifier, fund token, subscription, checker, pool; handoff:158 lists them) and one hand-clicked run recorded in docs/evidence; if the standing order stays, one Privy-mode tick plus the watch.ts error path. Everything else in handoff:158 (second issuer, FundDesk, payout, zkPassport deploys) is dropped from the deploy list, which shortens the builder's clicking.

Decision points total: gallery visibility, standing order in or out, zkPassport revert, payment leg yes or no.

## Questions only the builder can answer

1. Who gave the Classic "ok" and on which channel (handoff:93)?
2. Will you send the Privy eligibility notice from track-decision.md before the form, or drop the Privy tracks?
3. Do you have the Sepolia signer and RPC, and will you hand-click the spine run before 2026-09-12? If not, is an anvil-only video acceptable with the caption?
4. Standing order in the video, yes or no, given "demo units, no payment"?
5. zkPassport: revert on 2026-09-10 or keep the flag?
6. Investor wallet in the video: Privy email sign-in or a dev signer or MetaMask?
7. Gallery: footer-only engineering page, or removed from the public site?
8. Is a paid subscribe leg worth wiring into the spine before the deadline, or stays FundDesk parked entirely?
9. Where is the app hosted for the one judge click, or is it video plus runbook only?
