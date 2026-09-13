---
type: handoff
title: Handoff 2026-09-13 final: the submission is in; what was done today, where everything stands, what is open
updated: 2026-09-13
status: Written after the deadline (18:00 Vienna) for the next session or another model. Self-contained; the earlier handoffs are history.
sources:
  - wiki/handoff-2026-09-13-evening.md (state at 17:00, the cut recipe)
  - wiki/handoff-2026-09-13.md (the morning state)
  - wiki/video-script.md (the planned script; the take did not follow it)
  - wiki/video-take-2026-09-13/ (take transcript, render script, output contact sheet)
  - wiki/reference-video-T0jY6BqNS3w/analysis.md (the ETHGlobal example video, analyzed after the deadline)
  - git in the four working trees at about 18:15 Vienna
---

# Handoff 2026-09-13 final

Rules for the next agent, from the builder: Fable models only, no Opus (high stakes); English in files; absolute paths; no em dashes, en dashes or double hyphens; never run rm; never read .env files or print secrets; never push anything the builder has not asked for; label FACT, CLAIM, OPINION.

## One paragraph

FACT: The ETHGlobal submission for Attestat was submitted by the builder on 2026-09-13 before 18:00 Vienna (builder's word: "ok, i submitted"). The app, landing page, relay and bridge are live on public domains; the contracts are on Sepolia since 2026-09-10. The video was recorded at the last minute as a freestyle pitch, not from the prepared script, and was cut by ffmpeg from 5:46 to 3:44. The builder's own verdict: "it was my mistake to do that last min." Everything else on the list is either done or is post-deadline housekeeping.

## What is live (FACT)

- https://attestat.dev, landing page, Vercel project attestat-site, auto-deploys from nachweis-site main.
- https://app.attestat.dev, the app, Vercel project attestat-app, prebuilt upload (recipe: nachweis-app/docs/hosting-app-vercel.md), cross-origin isolated so the browser prover works, MetaMask connect, no dev keys.
- https://relay.attestat.dev and https://bridge.attestat.dev on the builder's netcup NixOS server (module [local path, withheld], units attestat-relay and attestat-bridge, nginx with ACME; record in nachweis-app/docs/hosting-server.md). The collaboration stack on that server stays stopped on purpose; restore command in [local path, withheld]
- Contracts on Sepolia (deployment record nachweis-app/docs/deployments/sepolia-2026-09-10.md).

## Repositories (FACT, about 18:15 Vienna)

| Tree | Branch | Head | Notes |
|---|---|---|---|
| nachweis-app (devdotbo/nachweis-app, PUBLIC) | main | 7ef18b2 | app on app.attestat.dev, hosting record; clean |
| nachweis-app (worktree of the same repo) | hosted-services | 66d8ec3 | Privy passkey and silent-transaction work, docs; NOT merged into main |
| nachweis-site (devdotbo/nachweis-site, PUBLIC) | main | eaf07ba | landing links to app.attestat.dev; clean |
| the wiki repository (devdotbo/nachweis wiki, PRIVATE) | main | 660cf4c | uncommitted files listed below |

Uncommitted in the wiki repo (to commit, keep the repo private):
- wiki/form-paste-2026-09-13.md and wiki/form-techstack-2026-09-13.md (the form text the builder pasted from)
- wiki/handoff-2026-09-13-evening.md and this page
- wiki/reference-video-T0jY6BqNS3w/ (analysis, transcript, frames, sheets)
- wiki/video-take-2026-09-13/ (take transcript, render script, closing card, output contact sheet)
- submission-images/ (the images uploaded to the form)
- index.md and log.md (rows and entries for the above)
- Two exported transcripts wiki/2026-09-12-*-i-wrote-gpt-6-codex.txt stay untracked on purpose.

## The submission (FACT where stated, otherwise CLAIM)

- Form text source: wiki/form-paste-2026-09-13.md (project details, images, tech stack, prizes, video, future, final, and the Uniswap feedback form answers) and form-techstack-2026-09-13.md. Prize: Uniswap Foundation only; category Zero Knowledge; track Building from Scratch.
- CLAIM (not verified by any agent; the builder filled the form alone): the fields were pasted as drafted, the images from submission-images/ were uploaded, and one of the two cut videos below was uploaded as a file. Which of the two variants went in is not recorded; ask the builder.
- Not known: whether the description still carries "(read-only today)", and whether the Uniswap feedback form was sent (see Open).

## The video (FACT)

Raw material, both in [local path, withheld]
- GMT20260913-152806_Clip_Reza's Clip 09_13_2026.mp4, the Zoom take: 1920x1080, 30 fps, mono AAC, 5:46. Started 17:28:06 Vienna. Camera picture-in-picture bottom right throughout, Chrome shared.
- ScreenRecording_09-13-2026 17-31-17_1.MP4, the iPhone screen recording: 1320x2868, 120 fps HEVC, 1:30. Started 17:31:17, so phone clock equals Zoom clock minus 191 s.

What the take contains (transcribed with WhisperKit openai_whisper-large-v3, word timestamps; transcript at wiki/video-take-2026-09-13/take-transcript.srt):
- 0:00 to 3:02: freestyle pitch over the landing page (how many strangers keep a copy of your passport; Revolut and ID scan this month, 153 million; crypto fixed custodial money, identity never got its turn; zkPassport is great but exchanges cannot use it, liability and regulation; the EU rolls out the EUDI wallet, every member state must provide one; the EU has a zero-knowledge draft only; the crypto industry's work (zkPassport, S-Tech, Noir) connects to EUDI; usable in a Uniswap pool, KYC, ICO, exchange).
- 3:02 to 4:29: the app on app.attestat.dev: MetaMask connect, session signature, QR, scan with the official German test wallet on the phone (request, three fields, PIN), browser proof, "identity is there, we are over 18" with the attested chips.
- 4:29 to 5:46: "the time is a little bit over for the swap, but it's basically a gated swap from Uniswap", then a swap attempt that was refused by PermissionedHooks.beforeSwap because the issuer had not approved in this take. The builder: "I can't really show so much of the Uniswap stuff, it keeps breaking."

The take did not follow wiki/video-script.md. Spoken words on the script's forbidden list that are in the take: "KYC", "this month", "end of this year", and one profanity ("what a fucking liability"). The script's captions and cards were not used except the closing card.

The cut (ffmpeg, no editor; script at wiki/video-take-2026-09-13/render.sh, output contact sheet cut-contact-sheet.jpg in the same folder):
- Twelve segments re-encoded to identical settings (libx264 crf 18, yuv420p, 30 fps, AAC 160k mono 48 kHz), 30 ms audio fades at each seam, concatenated as MPEG-TS then muxed to mp4 with faststart. No speed change anywhere.
- Intro kept whole except: the profanity sentence (clean variant only), four pauses of 2 to 3 s, the filler "it's a great, they are great, the guys, it's because like, basically".
- App part: idle time after connect, after signing and before the QR cut; the phone recording overlaid as picture-in-picture on the left (930 px high, black border) from Zoom 204.6 s to 220.4 s, phone 13.6 s to 29.4 s, real time, phone audio muted; the sentence "I am also a European Union resident, otherwise I wouldn't have access to the EUDI" removed (the demo runs on a test wallet with a sample identity); one 6.5 s cut inside the proof wait; the take ends at "we are over 18" (Zoom 270.2 s). Nothing of the swap is shown.
- Closing: 5 s of cards.html card 3 (product sentence, "The pool never learned about EUDI. It read one record."), rendered by headless Chrome from video/cards.html?card=3&still=1, fade in and out, silent.
- Verified: streams 1920x1080 30 fps H.264 plus 48 kHz mono AAC; audio continuous (the only silence over 4 s is the closing card); plays end to end.

Outputs:
- [local path, withheld], 3:44, profanity removed (recommended, handed to the builder as such).
- [local path, withheld], 3:47, intro verbatim.

## The reference video (FACT, analyzed after the deadline on the builder's request)

ETHGlobal's own example demo video (web3torrent, HackMoney 2020, https://www.youtube.com/watch?v=T0jY6BqNS3w) was downloaded, transcribed and frame-analyzed: wiki/reference-video-T0jY6BqNS3w/analysis.md (timeline, numbers, side by side with the take, five rules), transcript.md, 19 named frames, three contact sheets; the mp4, info JSON and captions in [local path, withheld] Key numbers: product on screen at 42 s (the take: about 180 s), demo 47 percent of runtime (the take: about 20 percent), eight one-line slides as signposts (the take: none), no full-frame talking head. The five rules for a next video are in analysis.md; the short form: app on screen by 0:45, demo at least half the runtime with narration over every wait, every party in one frame, one-line slides in a fixed order, end on the artifact then the URL.

## Privy (FACT)

Not claimed, not deployed, not in the submission. Finding of 16:15: Privy's embedded-wallet iframe is blocked by the Cross-Origin-Embedder-Policy header the browser prover needs. The finding, the silent-transaction setting (showWalletUIs false) and passkey login are committed on hosted-services (a1f9cd2 through 66d8ec3) with two candidate fixes in nachweis-app/docs/hosting-app-vercel.md (credentialless iframe, or the prover in its own isolated top-level origin with a relay-mediated handoff). Builder's decision at 16:45: forget Privy for the submission.

## Open, in the order to do them

1. Ask the builder which video variant was uploaded and whether the Uniswap feedback form was sent; record both in decisions.md.
2. Commit the uncommitted wiki files listed above (private repo). Add the index rows and log entries if missing (the reference-video row and log entry exist; this page's row and entry are added with it).
3. Evidence record of the builder's public-app journey of 2026-09-13 afternoon (scan, browser proof, approve, subscribe, swap, revoke on app.attestat.dev): hashes from the bridge log on the server (`ssh cloud journalctl -u attestat-bridge`) and from the investor address on Etherscan; write nachweis-app/docs/evidence/sepolia-public-2026-09-13.md in the style of sepolia-phone-2026-09-12.md; re-verify hashes by public RPC. The take of 17:28 also left on-chain traces (investor 0xFC619...092ef, session signature, attestWithProof, one refused swap) that can be cited.
4. Fill the take commit into the shot list gate (wiki/video-shotlist-spine.md placeholder) and note that the take deviated from the script; write the take record.
5. Merge hosted-services into app main (docs and the Privy branch changes; run tsc and unit tests first), re-copy the wiki bundle (`bun scripts/wiki-copy.ts the wiki repository <wiki commit>`, update the pin and the Not-copied table in docs/wiki/README.md, run scripts/wiki-coverage.ts and scripts/check-doc-links.ts), push only when the builder says so.
6. Remove "Read-only against Sepolia today" from the landing page hero and "(read-only today)" from the description if it is still there; the journey works on app.attestat.dev.
7. Uniswap feedback form if not sent (answers in form-paste-2026-09-13.md, last section), and both receipts filed.

## Open, later

- Privy on the public origin (the two candidate fixes), then the standing-order run per nachweis-app/docs/privy-standing-order.md section 7.
- Privy CLI and agent access (scoped tokens approved in the browser): the builder's idea for an agentic angle; not started.
- Etherscan source verification (needs an API key).
- Hero text clipping at phone width on the landing page (pre-existing, cosmetic).
- A better video, if ETHGlobal allows a replacement or for the next event: follow the five rules in the reference analysis and the prepared script; record the phone leg and the browser in one frame; show approve, subscribe, swap and revoke with the issuer approval done before the swap.
- A conversation with an issuer that owns a document funnel: the business gate recorded in wiki/product.md.

## Lessons of the day (OPINION, for the builder and the next agent)

- The last-minute take cost the prepared script, the captions and the demo's second half. Next time the take is recorded in the morning of the deadline day, not the last hour, with one rehearsal against the teleprompter.
- The swap "kept breaking" in the take because the issuer approval step was skipped; the pool refused correctly. A demo checklist that names the order (approve before subscribe and swap) belongs on the teleprompter's first line.
- The freestyle pitch is strong on the problem and weak on the product: the app came at 3:02 of 3:44. The reference video puts the product at 0:42.
