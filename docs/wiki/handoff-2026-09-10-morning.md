---
type: handoff
title: Morning brief, 2026-09-10: what was done overnight, what to look at, what to decide
updated: 2026-09-10
status: Corrected 2026-09-10 after the builder's morning decisions and the independent review (review-morning-2026-09-10.md)
sources:
  - wiki/review-fable-2026-09-09.md (verdict)
  - raw/reviews-2026-09-09/ (three teammate reports)
  - wiki/handoff-fable-2026-09-10.md (last night's handoff, still valid for Privy facts, run table, secrets locations)
  - git in nachweis-app, nachweis-site, nachweis (2026-09-09 about 21:40 Vienna)
---

# Morning brief, 2026-09-10

Self-contained. The builder's instruction at about 21:00 (verbatim): "can you already indienly do some worth. even if we do the comemtant back and worts case we have to trough it away". So: everything below is on branches, nothing is merged to main, nothing is pushed, no key was used, no Sepolia, no external account. One branch delete discards any part.

Status 2026-09-10 morning (FACT, chat with the builder; recorded in decisions.md "2026-09-10 morning"): the builder accepted the narrowing of decision 1 (verbatim "ok"); check-in 2 is optional per the builder; the builder is preparing a Sepolia key in a local .env; Privy is undecided. The independent review is at wiki/review-morning-2026-09-10.md and corrects three points of the shot list and one claim of the submission text (both files edited 2026-09-10).

Status 2026-09-10 about 10:15 (FACT, lead): decision 1 executed. nachweis-app main is 9d5088c (merge of wp41-all 7f7df7e, gates green), nachweis-site main is 3bbd038 (merge of focus-spine 2086d66); nothing pushed. New on the app tree: the no-phone journey evidence on the exact commit (docs/evidence/browser-pool-journey-2026-09-10.md), the 1 mUSD bring-up probe, scripts/sepolia-deploy.sh with docs/sepolia-checklist.md, the complete docs/wiki copy at wiki 2381f0f. The branch table below is the overnight state and is superseded by log.md "[2026-09-10] update | Morning work packages done".

Status 2026-09-10 evening (FACT, lead's teammate): deployed on Sepolia. The builder funded the deployer (1.18 ETH from the PoW faucet), scripts/sepolia-deploy.sh ran (33 transactions, blocks 11676804 to 11676836, 0.0189 ETH gas, 0.05 ETH investor top-up), record nachweis-app/docs/deployments/sepolia-2026-09-10.md, not verified on Etherscan. nachweis-app main 40da07f carries the addresses (README, runbook, swap.md, FEEDBACK.md). Submission text: [Sepolia] variant selected, fork as fallback. Caption gate met later the same evening: the no-phone journey on Sepolia is recorded green in nachweis-app/docs/evidence/sepolia-journey-2026-09-10.md (app commit 7a2272d, 14 transactions: attest by operator, approve, subscribe 100 NDF, swap 100 mUSD for 90.65 NDF, revoke, subscribe refused NotEligible, swap refused PermissionedHooks.beforeSwap Unauthorized twice, re-approve; investor now 190.65 NDF, 100 mUSD, approved, 0.049 ETH). Beats 7 and 8 are captioned "Sepolia", the fork is the fallback, the swap and refused-swap hashes are in submission-text.md. The phone leg on Sepolia is still unverified. Decision 2 below is therefore answered for Sepolia; Privy remains undecided. Next brief: handoff-2026-09-11-morning.md.

## Read first (ten minutes)

1. The verdict: wiki/review-fable-2026-09-09.md (filter table, defects, the one journey, blockers, seven decisions).
2. The site branch, running now: http://127.0.0.1:8788/ (main page without the toolkit lines) and http://127.0.0.1:8788/showcase/ (engineering examples with parked badges). Serves nachweis-site (FACT, lsof 2026-09-10: the process on 8788 has that working directory); if the server is gone, `cd nachweis-site && python3 -m http.server 8788`. Correction 2026-09-10: port 8787 serves nachweis-site, the original toolkit site on main, not the focus branch (FACT, review-morning-2026-09-10.md, "Product and site", confirmed by lsof); the earlier version of this line pointed at 8787 by mistake.
3. The video run order: nachweis-app/docs/demo-runbook.md, subsection "Video run order (2026-09-10)".
4. The shot list: wiki/video-shotlist-spine.md (195 s without the Privy beat).

## Branches (FACT, git 2026-09-09 about 21:40)

| Worktree | Branch | Commits | What |
|---|---|---|---|
| nachweis-app | wp41-focus-fixes | 46601cb c5acdf1 8ef40f0 17c1544 | FundDesk paid cap per distribution; FundToken sender check (mint, issuer hand-out, return to issuer exempt); watcher stops at the first failed policy update and retries from that block; /showcase/standing-order route. forge 155 passed, 0 failed, 20 skipped (was 152); bun automation 19 pass (was 16); fork suites with the public RPC 12 passed, 0 failed, 7 skipped; investor-money, standing-order, savings-plan scripts PASS; investor-money Playwright 1 passed |
| nachweis-app | wp41-pool-flag | bdbe0e1 33ad319 e598249 | `browser-real-wallet-up.sh --pool`: anvil forks Sepolia at chain id 31337, pool-local.sh --attach on this stack's registry, VITE_POOL_* in the app env; verifier pin and tunnel unchanged. Subscribe refusal decoded ("Refused by Subscription.subscribe with NotEligible() ..."). Runbook paragraph and video run order |
| nachweis-app | wp41-docs-classic | 6c89457 fa3c487 261f781 d0cb56f 3f77278 0cb5a3f | DISCLOSURE to Classic with recounts (289 commits on main, relay branch 10 commits and 3,456 net insertions, commands recorded); ai-attribution corrected; README Uniswap line pointers rechecked; FEEDBACK TODOs replaced by facts plus bracketed builder lines; stale counts; .gitignore rule for exported transcripts; docs/wiki/ copy of 40 spec pages pinned to wiki 5f6271e with a withheld list |
| nachweis-app | wp41-all | merges of the three above, 7c4a3bc | Trial merge: no conflicts. Gates on the merged tree 2026-09-09 21:25: forge 155 passed, 0 failed, 20 skipped; fork suites 12 passed; automation 19 pass; app typecheck and build clean; tree clean |
| nachweis-site | focus-spine | 63dea3c 9ee9940 e194875 | Main page: toolkit paragraph, third hero button and nav item removed; teaser is two cards under the product sentence; gallery renamed "engineering examples" with badges product journey / candidate / parked / off by default / research; savings-plan "closes every door" claims corrected; 72 links checked, no console errors |
| the wiki repository (wiki, main) | main | 7603637 d59f0fd 61c468c 46485f6 bb3e16b 5f6271e and this page | review page, decisions proposal, submission-text for Classic with [fork]/[Sepolia] and [Privy claimed]/[not claimed] variants, video-shotlist-spine, check-in draft (197 words), Uniswap form, WP41 row, index block |

Unchanged: nachweis-app main 46d8349, nachweis-site main 693821e, nothing pushed anywhere, the three transcript files untouched.

## What the merged fork stack proved without the iPhone (FACT, pool-glue teammate, run dir docs/evidence/private/runs/20260909-211336-browser-pool in the pool worktree, gitignored)

Bring-up 162 s (130 s of it a cold cargo build), tunnel answered, pool attached to the same registry as the sandbox-pinned verifier. With dev signers K0 issuer and K1 investor: attestByOperator, approve, subscribe mined (100 NDF), swap of 100 mUSD through PermissionedHooks mined, revoke, subscribe reverted NotEligible() 0xf8eb54de, swap reverted Unauthorized() inside PermissionedHooks beforeSwap. Playwright e2e/swap.spec.ts on that stack: 1 passed. Stack torn down.

Unverified until you hold the phone: QR scan by the official wallet over the tunnel, relay pickup, bb.js proof in the tab, attestWithProof on the fork with the sandbox-pinned NoirPidVerifier. The runbook has a no-phone rehearsal via attestByOperator.

Decided for the camera (review-morning-2026-09-10.md, "The remaining demo gate"; shot list beat 8): the Subscribe button stays disabled while the door is closed (DoorsCard.tsx:41, two specs assert it). The camera films the greyed Subscribe control with status `closed` and the doors-closed caption "Approval withdrawn by the issuer (manual revocation). Both doors are closed until the issuer re-approves." (DoorsCard.tsx:33). The refusal on camera is the pool's decoded revert naming PermissionedHooks.beforeSwap, with the reverted transaction's hash. Subscribe is not made clickable; the decoded Subscribe refusal from wp41-pool-flag stays in the code and is at most a terminal-only backup via cast.

## Decisions (yours), in the order they unblock work

1. Narrowing: yes or no. ACCEPTED by the builder 2026-09-10 morning (verbatim "ok"). Yes means: merge wp41-all to app main and focus-spine to site main, record the decision, delete nothing else. No means: delete the branches; the defect fixes on wp41-focus-fixes are worth keeping either way.
2. Sepolia and Privy, one decision: fund a Sepolia key and click the Privy run on 2026-09-10 or Friday 2026-09-11, or drop Privy and record on the fork. State 2026-09-10 morning: key being prepared, Privy undecided. If yes, hand over a funded key in a local signer or a gitignored .env plus SEPOLIA_RPC_URL, never in the chat.
3. Money beat on camera: swap (recommended, refusal names the contract) plus subscribe as door one.
4. zkPassport: revert, or keep the flag off screen.
5. Who gave the "new project" ok, on which channel; send the pre-existing-work notice (draft in wiki/track-decision.md:126-147) or not.
6. Hosting: Cloudflare Pages with a _headers file for COOP and COEP, or video plus runbook only.
7. Wiki: stays private with docs/wiki copy (three core pages withheld for a secrets path; a one-line redaction lets them in), or history rewrite and public.

## Builder-only tasks that are open regardless

- Move the three transcripts out of the repositories: 2026-09-08-192458-we-did-a-lot-and-we-pivoted-many-times-check-sp.txt (tracked, in history), 2026-09-09-201235-from-lastet-agent.txt, nachweis-app/2026-09-08-205144-i-told-gpt-6-astra.txt.
- Check-in 2, OPTIONAL per the builder (2026-09-10 morning): due Friday 2026-09-11 05:59 Vienna (FACT, review-morning-2026-09-10.md: schedule item project-check-in-2-due at 2026-09-11T03:59:00Z; any "Thursday" shorthand for this deadline is wrong for Vienna). Draft if used: wiki/checkin-2026-09-11.md. Confirm check-in 1.
- Video: 2 to 4 minutes, 720p or better, own voice, no phone recording, no speedup.
- Repositories public before the deadline; Uniswap form after that; ETHGlobal form with Uniswap and, if green, the Privy tracks.

## What the lead does next once decision 1 is yes

Merge wp41-all and focus-spine, rerun the gates on main, update README deployment lines only if Sepolia happens, re-copy docs/wiki before submission, record the decisions and the ok's source in decisions.md and log.md, prepare the Cloudflare _headers file if decision 6 is yes.
