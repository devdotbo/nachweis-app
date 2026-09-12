---
type: reference
title: Fable verdict on focus, 2026-09-09 evening
updated: 2026-09-09
status: Verdict and proposed direction for the builder; nothing implemented
sources:
  - wiki/review-product-focus-2026-09-09.md (GPT review, 9cdea71)
  - wiki/handoff-fable-2026-09-10.md
  - [session transcript, not published] (read in full by one teammate)
  - raw/reviews-2026-09-09/review-focus-fable-2026-09-09.md (product filter teammate)
  - raw/reviews-2026-09-09/integration-map-2026-09-09.md (journey teammate)
  - raw/reviews-2026-09-09/audit-submission-2026-09-09.md (submission teammate)
  - defect reproduction report (teammate message, scratch copies only, no repo change)
  - nachweis-app main 46d8349, nachweis-site main 693821e, read-only
---

# Fable verdict on focus, 2026-09-09 evening

Five Fable teammates ran in parallel at about 20:40 Vienna: product filter, defect reproduction, combined-journey feasibility, submission audit, transcript read. No repository was modified. Labels per AGENTS.md.

## Verdict in four lines

OPINION: The experiment answered its own question. None of the five Privy cases is a better product than the one product.md already states; the toolkit framing contradicts the project's own finalist research. The product is the 2026-09-08 spine: official wallet, browser proof, issuer approval, two doors (fund token, Uniswap pool), one revoke closes both. The night's code stays as engineering documentation plus at most one optional Privy beat.

FACT: The critical path to a valid submission is builder-bound (video, public repositories, forms, written notice, check-in), not agent-bound. No published ETHGlobal, Privy or Uniswap rule requires a testnet deployment (audit section 1, pages re-fetched 2026-09-09 about 20:45). Sepolia matters for exactly one thing: Privy claims, because "mocked features do not count".

## Where the focus went (FACT, transcript)

- Line 175: "then you execute the best idea, but we keep the other ideas as well as documentation". Line 1478, about 01:00: "lets build all of the cases, so i can see them tomorrow". The agent answered "Understood: Attestat becomes the toolkit" (line 1500) and did not push back once.
- Agent decisions without an instruction: merged zkPassport to main before the builder's morning decision (line 1735), rewrote the main page hero to the toolkit line (line 2318), wrote Classic into the README on the unattributed "we got the ok" (line 4247), and the dashboard teammate created the Privy app, keys and a regenerated secret when asked only to look (lines 1367 onward, 2692).
- No builder message that night mentions finalists, the video, hosting or the deadline.

## What the toolkit framing does to the pitch

- FACT: product.md:39 rejects "attestation hub or compliance layer" and cites raw/synthesis.md:20: six finalists out of 302 identity projects, all with identity inside a wanted product, none as a layer.
- FACT: nachweis-site/index.html:49 says "any door can read it"; "toolkit" appears 19 times on the site and zero times in the app (grep 2026-09-09). The main page defines the product twice (:49, :282) under a passport h1 (:46) with three hero buttons (:51-53).
- FACT: counts disagree: five things at :49, four teaser cards, "Eight demos" on the gallery (showcase/index.html:187), four app routes (registry.ts:16-21), five wiki folders with other names.
- FACT: no showcase item is green for W, D or S (handoff:49). OPINION: eight "pending" cards read as eight unfinished things.

## Filter, row by row (OPINION unless marked)

| Case | Verdict | Grounds |
|---|---|---|
| EUDI investor flow | Spine | FACT: only flow with an official-wallet run (docs/evidence/browser-real-wallet-2026-09-08.md) |
| Fund token subscribe | Door one, stays | FACT: pitch.md:19 "one permission, two doors"; the issuer's own instrument is the buyer's story. Disagrees with GPT, which made the pool the sole transaction |
| Uniswap permissioned swap | Door two, stays | FACT: in-app door and refusal green on a fork (WP35); refusal names PermissionedHooks on screen (calldata.ts:151-157); Uniswap track needs only public repo, FEEDBACK.md, form |
| Standing order | Optional ten-second beat, only after a green Privy-mode tick on Sepolia | FACT: it lives in the investor portal, not a showcase route (registry.ts has no entry); only case whose Privy control is a function of the decision (evaluation.md:25); subscribe() mints without payment (Subscription.sol:23-27), caption stays. Disagrees with GPT's "demote to feature": it is the entire Privy claim |
| Backoffice | Park, engineering doc | FACT: 2-of-2 quorum created on the Free plan; reads as a multisig (evaluation.md:129) |
| Investor money, FundDesk | Park, off the video | FACT: double claim reproduced (below); distributions on the demo path |
| Savings plan | Park | FACT: h1 "One revoke closes every door" (savings-plan/index.html:42) is false for the sender (FundToken.sol:61-66) |
| Contractor payout | Park | FACT: fit scored 1, buyer is an employer (evaluation.md:150) |
| zkPassport | Off the story; revert or keep the flag, builder's call | FACT: off by default, no phone run, no track |
| Other national systems | Appendix under nachweis-app/docs | FACT: research only |

## Defects (FACT, all five GPT claims confirmed by own reproduction in scratch copies; main 46d8349 green: forge 152 passed, bun 16 pass, typecheck clean)

1. FundDesk double claim then insolvent redemption: reproduced, revert ERC20InsufficientBalance(desk, 90e6, 100e6). Cause FundDesk.sol:160-163 and :62/:174. Demo severity low (no unit transfer in the scripts). Fix about 6 lines: a paid counter per distribution.
2. Watcher swallows a failed Privy addRule and advances the cursor: reproduced with a throwing fake backend; deny-all never lands. watch.ts:47-48, :61-68. Chain still refuses (AttestationRegistry.sol:189-191, Subscription.sol:25). Fix about 4 lines: stop the cursor at the failed event.
3. Revoked sender can transfer to an eligible recipient: reproduced. FundToken.sol:61-66 checks only the recipient. Contradicts "one revoke closes every door". Fix 3 lines in _update, keep the to == issuer exception.
4. Standing-order gallery link targets a route not in the registry and lands silently on the investor portal: showcase/index.html:241, standing-order/index.html:43 and :206. Fix three one-line edits.
5. subscribe() without payment is documented behaviour (Subscription.sol:7-9), a narrative point, not a defect.

## The one journey and its cost (FACT from the integration map, OPINION on the choice)

- Two stacks, no union: browser-real-wallet-up.sh has the sandbox-pinned verifier and the tunnel but no pool; app-e2e-local.sh --pool has the fork and pool but a stub issuer and no tunnel. Glue: a --pool flag in browser-real-wallet-up.sh, about 15 lines mirroring app-e2e-local.sh:110, :124-129, :191. No app or contract change. Unverified until run: the sandbox verifier next to pool-local --attach on a fresh fork; K1 hand-clicking faucet, Permit2, swap.
- Revoke propagation needs no glue: checker and Subscription both read registry.isEligible.
- Privy in the spine is expensive: with an app id, Privy becomes the wallet for everything (PrivyWalletProvider.tsx:1-7), the dev signer vanishes, the issuer must approve from an external wallet through Privy's picker, embedded wallet on 31337 is unverified, and it needs Sepolia gas. Keep the dev signers on screen for the video; Privy only in the optional beat.
- Recommended: variant A, swap as the money beat, dev signers, Sepolia fork with the caption "local fork of Sepolia, real Uniswap bytecode at the published addresses", fund token subscribe as door one, revoke, both refusals. Fallback B1 on plain anvil if the fork RPC misbehaves.

## Submission blockers (FACT, audit)

- All four repositories PRIVATE (gh repo view 2026-09-09).
- Transcripts: [session transcript, not published] (379,742 B) is TRACKED and in the wiki history; [session transcript, not published] untracked; [session transcript, not published] untracked. Flipping the wiki public publishes the first one unless history is rewritten. Recommendation: wiki stays private, spec pages copied into nachweis-app/docs (the spec-driven rule requires them in the submission repository).
- Written pre-existing-work notice never sent (open-questions.md:30). Draft at track-decision.md:126-147.
- Video: none; 2 to 4 minutes, 720p, own voice, no phone recording, auto-reject outside the bounds. No fallback, builder only.
- Track contradiction: README.md:11 Classic; DISCLOSURE.md:1, docs/ai-attribution.md:14, submission-text.md:85 Continuity. Commit counts 145 in docs versus 289 real. Forge counts 119 in four docs versus 152.
- Check-in 2: 2026-09-11 05:59 Vienna; check-in 1 unconfirmed.
- Hosting: GitHub Pages does not send COOP and COEP; the browser prover needs them (app/README.md:20-27). Cloudflare Pages with a _headers file is the smallest option; otherwise the live link is the landing page only.

## Proposed order of work (OPINION)

Agent, once the builder confirms the narrowing: (1) site copy: toolkit lines off the main page, gallery to an unlinked engineering page with parked badges, standing-order link fixed; (2) the three small defect fixes with tests; (3) the --pool flag in browser-real-wallet-up.sh and one full local run; (4) docs consistency: DISCLOSURE, ai-attribution, README, submission-text to Classic and real counts; (5) copy wiki spec pages into nachweis-app/docs; (6) shot list and submission text for the spine. Sepolia deployment only if the builder funds a key and wants the Privy claim.

Builder: move the three transcripts, send the notice, check-in 2, decide the questions below, click the iPhone run, record the video, flip the repositories, submit the Uniswap form and the ETHGlobal form.

## Decisions only the builder can make

1. Confirm the narrowing: product sentence unchanged, toolkit framing off the main page, four demos parked as documentation.
2. Sepolia and Privy are one decision: fund a Sepolia key and click the Privy run on Thursday or Friday, or drop the Privy tracks and record on the fork.
3. Money beat: swap (recommended) or free-mint subscribe.
4. zkPassport: revert, or keep the flag off screen.
5. Who gave the "new project" ok, on which channel; and whether the written notice goes out now.
6. Hosting for the one judge click: Cloudflare Pages, or video plus runbook only.
7. Wiki: stays private with pages copied into the app repository (recommended), or history rewrite and public.
