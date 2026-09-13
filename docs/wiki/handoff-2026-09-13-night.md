---
type: handoff
title: Handoff 2026-09-13 night: submission in, contracts verified on Etherscan, what the judging looks like tomorrow, what is open
updated: 2026-09-13
status: Written 2026-09-13 evening after the Etherscan verification, for the next session or another model. Self-contained; handoff-2026-09-13-final.md is the source for the video and the form, this page supersedes its open list.
sources:
  - wiki/handoff-2026-09-13-final.md (state at 18:15 Vienna, the take, the cut, the form)
  - [local path, withheld] 2026_ Project Submissions are due in 24 hours!.eml (ETHGlobal mail of 2026-09-12 16:00 UTC, the judging process)
  - https://ethglobal.com/showcase/attestat-pg694 (the public showcase page, fetched 2026-09-13 evening)
  - nachweis-app/docs/deployments/sepolia-2026-09-10.md (section "Etherscan source verification (2026-09-13)")
  - nachweis-app/README.md (Sepolia section, verification line)
  - git in nachweis-app, nachweis-site, nachweis, 2026-09-13 evening
  - the builder's own words in the session of 2026-09-13 evening
---

# Handoff 2026-09-13 night

Rules for the next agent, from the builder: Fable models only, no Opus (high stakes); English in files; absolute paths; no em dashes, en dashes or double hyphens; never run rm; never read key values or print secrets; never push anything the builder has not asked for; label FACT, CLAIM, OPINION.

## One paragraph

FACT: Attestat is submitted to ETHOnline 2026 (deadline 2026-09-13 12:00 ET, 18:00 Vienna). Public showcase page: https://ethglobal.com/showcase/attestat-pg694, name "Attestat", short description "Show your EU ID wallet once, prove age in zero knowledge, get approved on chain. No passport copy.", source https://github.com/devdotbo/nachweis-app, demo link https://attestat.dev. The video is on the showcase page (builder's word). Per the builder, the video shows the QR scan with the official German test wallet and the browser proof, but no on-chain transaction on screen. The on-chain evidence is in the repository instead (README, "Sepolia deployment" and "Uniswap" sections; evidence record docs/evidence/sepolia-phone-2026-09-12.md). This evening all eight Attestat contracts on Sepolia were source-verified on Etherscan; README and the deployment record say so; nothing is committed or pushed yet.

## What ETHGlobal does next (FACT, from the mail of 2026-09-12)

- Two submission options existed in the form: (1) "Top Finalist & Partner Prizes" and (2) "Partner Prizes Only". Which one the builder ticked is NOT recorded anywhere in the wiki; ask the builder or read the hacker dashboard at https://ethglobal.com/events/ethonline2026/home.
- Option 1 is a two round process. Round 1: judges review every submission asynchronously (video, repository, description), no action by the team. Only projects that pass Round 1 go to Round 2, the live Finalist Judging session on Monday 2026-09-14. If the project passes Round 1, ETHGlobal emails the presentation details and the hacker dashboard shows the next steps. The mail does not name the platform of the live session (no "Zoom" in the text).
- Partner judging (the Uniswap Foundation prize) is asynchronous in both options. Nothing to do except having ticked the prize in the form, which form-paste-2026-09-13.md records as done ("Best Uniswap Stack Contribution", 3,000 USD pool).
- Judging and submission guidelines: https://ethglobal.com/events/ethonline2026/info/details.

## Tomorrow, 2026-09-14, in order (OPINION of this session, facts as marked)

1. Check the inbox and the hacker dashboard for a Round 1 result. No mail means no live round; then only the async partner judging remains and nothing is required.
2. If the project is in Round 2: present the README journey live, in this order: connect wallet on https://app.attestat.dev, QR scan with the German test wallet, browser proof (about 11 s), attestWithProof on Sepolia, issuer approve in the issuer console, then door one (subscribe) and door two (swap in the Uniswap v4 permissioned pool), then revoke and the refused swap. FACT from the take of 17:28: the swap is refused when the issuer approval is skipped; the approve step comes before subscribe and swap. Put that on the first line of the notes.
3. Fallback if the live proof or the phone fails: show the two Sepolia transactions of the 2026-09-12 phone journey, swap https://sepolia.etherscan.io/tx/0xda990178ec3a1a972244ab280415eabac693944ec7a6efd81e5317eb29facd4b (block 11688117, status 1) and the refused swap after revoke https://sepolia.etherscan.io/tx/0x85e554b8ffc73f617c25275a636d216e7bd0c9adf36e4a307e8355e8d957d9f9 (block 11688138, status 0, PermissionedHooks.beforeSwap), plus the evidence record. The contract pages now show source (next section), so the registry's isEligible and the checker's checkAllowlist can be read on Etherscan during the pitch.
4. Say in the first ten seconds that the repository keeps the former name Nachweis (README line 3 explains the rename of 2026-09-07).

## Etherscan source verification (FACT, done 2026-09-13 evening)

- The builder created an Etherscan API v2 key and put it into nachweis-app/.env as ETHERSCAN_API_KEY (line 4, gitignored; no agent read the value, the scripts source the file).
- Run from nachweis-app main 7ef18b2 with forge 1.7.1. FACT: no file under contracts/src changed since the deployment of 2026-09-10 (last source commit c5acdf1, 2026-09-09), so the current tree matches the deployed bytecode.
- `--guess-constructor-args` did not work (needs the creation receipt over RPC; the public RPC returned none), so the constructor args were ABI-encoded by hand from contracts/broadcast/*/11155111/run-latest.json. The compilation profile had to be named (`--compilation-profile honk` for ZKTranscriptLib, HonkVerifier, NoirPidVerifier; `default` for AttestationRegistry, FundToken, Subscription, MockStable, EudiAllowlistChecker); HonkVerifier with `--libraries src/noir/PidSdJwtUltraHonkVerifier.sol:ZKTranscriptLib:0x60FcC13D41eBd235c7c43D55DE5053d12e28AF13`. The first HonkVerifier attempt failed on a network error while forge fetched the solc release list; the retry passed.
- Result: all eight returned "Pass - Verified". Confirmed afterwards through the Etherscan API (getsourcecode): every address returns its contract name, compiler v0.8.28+commit.7893614a, optimizer runs 200 (default) or 1 (honk). The GUIDs and the arguments per contract are in nachweis-app/docs/deployments/sepolia-2026-09-10.md, section "Etherscan source verification (2026-09-13)". The PermissionsAdapter is Uniswap factory output and was not submitted.
- Edited, uncommitted, in nachweis-app: README.md (line 48 "source-verified on Etherscan since 2026-09-13"; the former "Not verified on Etherscan" bullet in the Sepolia section replaced) and docs/deployments/sepolia-2026-09-10.md (line 10, the status line under "On-chain verification", and the new section at the end).

## What is live (FACT, unchanged since the final handoff, app checked 2026-09-13 evening: HTTP 200)

- https://attestat.dev (landing, Vercel, from nachweis-site main), https://app.attestat.dev (the app, Vercel prebuilt upload, cross-origin isolated for the browser prover, MetaMask connect), https://relay.attestat.dev and https://bridge.attestat.dev (the builder's netcup NixOS server, units attestat-relay and attestat-bridge, record nachweis-app/docs/hosting-server.md).
- Contracts on Sepolia since 2026-09-10 (record above), now with source on Etherscan.

## Repositories (FACT, 2026-09-13 evening)

| Tree | Branch | Head | State |
|---|---|---|---|
| nachweis-app (devdotbo/nachweis-app, PUBLIC) | main | 7ef18b2 | README.md and docs/deployments/sepolia-2026-09-10.md modified, uncommitted, not pushed |
| nachweis-app (worktree) | hosted-services | 66d8ec3 | Privy passkey and silent-transaction work, docs; NOT merged into main |
| nachweis-site (devdotbo/nachweis-site, PUBLIC) | main | eaf07ba | clean |
| the wiki repository (wiki, PRIVATE) | main | 660cf4c | uncommitted: this page, wiki/handoff-2026-09-13-final.md, wiki/handoff-2026-09-13-evening.md, wiki/form-paste-2026-09-13.md, wiki/form-techstack-2026-09-13.md, wiki/reference-video-T0jY6BqNS3w/, wiki/video-take-2026-09-13/, submission-images/, index.md, log.md; the two exported Codex transcripts stay untracked on purpose |

The docs/wiki bundle inside nachweis-app is a copy pinned to an earlier wiki commit; it does not contain the 2026-09-13 handoffs until the bundle is re-copied (open item 4).

## The submission and the video (FACT where stated, otherwise CLAIM; details in handoff-2026-09-13-final.md)

- Form source: wiki/form-paste-2026-09-13.md. Category Zero Knowledge, track Building from Scratch, prize Uniswap Foundation only, Privy not claimed. CLAIM: pasted as drafted; the builder filled the form alone.
- Video: Zoom take of 5:46 (pitch over the landing page, then the app with MetaMask, QR scan, phone, browser proof, "we are over 18"; a swap attempt refused because approval was skipped), cut by ffmpeg to 3:44. Two output files in [local path, withheld] (attestat-pitch-2026-09-13-cut.mp4 recommended, profanity removed; the intro-uncut variant 3:47). NOT recorded: which variant was uploaded. The builder's own summary this evening: "our demo didn't show the tx, but we did the QR code".
- NOT recorded: whether the Uniswap feedback form (https://developers.uniswap.org/hackathon-feedback, answers in the last section of form-paste-2026-09-13.md, link to nachweis-app/FEEDBACK.md) was sent. README "Uniswap" section still lists it as the remaining builder step. Uniswap usually requires it for the prize; ask the builder first thing.

## Open, in the order to do them

1. Builder, tomorrow morning: Round 1 result (inbox, dashboard); which submission option was ticked; which video variant went in; whether the Uniswap feedback form was sent. Record all four in wiki/decisions.md.
2. Commit the two edited files in nachweis-app (README, deployment record; message "Etherscan source verification 2026-09-13"). Push only when the builder says so; the repository is public and judges may read it during Round 1, so a push of documentation-only changes is low risk, but it is the builder's call.
3. Commit the uncommitted wiki files (private repo), with index rows and log entries (this page's row and entry are added with it).
4. Re-copy the wiki bundle into nachweis-app (`bun scripts/wiki-copy.ts the wiki repository <wiki commit>`, update the pin and the Not-copied table in docs/wiki/README.md, run scripts/wiki-coverage.ts and scripts/check-doc-links.ts). After the README edit, run scripts/check-doc-links.ts once anyway (the edit added no link, but the gate is cheap).
5. Evidence record of the public-app journey of 2026-09-13 afternoon and of the take (investor 0xFC619...092ef, session signature, attestWithProof, one refused swap): hashes from the bridge log on the server (`ssh cloud journalctl -u attestat-bridge`) and from Etherscan; write nachweis-app/docs/evidence/sepolia-public-2026-09-13.md in the style of sepolia-phone-2026-09-12.md.
6. Fill the take commit into the shot list gate (wiki/video-shotlist-spine.md) and note that the take deviated from the script.
7. Merge hosted-services into app main (tsc and unit tests first).
8. Remove "Read-only against Sepolia today" from the landing hero and "(read-only today)" from the description if still present; the journey works on app.attestat.dev.
9. Uniswap feedback form, if not sent; file both receipts.

## Open, later (unchanged)

Privy on the public origin (COEP blocks the embedded-wallet iframe; two candidate fixes in nachweis-app/docs/hosting-app-vercel.md), then the standing-order run; Privy CLI and agent access; hero clipping at phone width; a better video per the five rules in wiki/reference-video-T0jY6BqNS3w/analysis.md (product on screen by 0:42, demo about half the runtime, approve before subscribe and swap); an issuer conversation (business gate in product.md).

## Known limits to carry into any judging conversation (FACT)

Official German test wallet with the sandbox sample identity; sanctions and other checks simulated; the proof is made in the browser tab on the investor's computer (the wallet does not prove yet); revocation is manual; the Privy standing order is a local showcase, not claimed; the SP1 Groth16 route ran on a Sepolia fork only; the operator fallback stores and approves in one transaction without a proof; no x5c chain, no status list, no freshness window on the Noir route; quote by slot0 and liquidity because the V4Quoter cannot quote the hooked pool; contracts verified on Etherscan but not audited.
