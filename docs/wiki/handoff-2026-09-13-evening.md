---
type: handoff
title: Handoff 2026-09-13 evening: everything but the video is submitted-ready; how to cut the video and close out
updated: 2026-09-13
status: Written by the lead at about 17:00 Vienna, one hour before the deadline, for the next agent session (the lead's context is near its limit)
sources:
  - wiki/handoff-2026-09-13.md (the morning state)
  - wiki/decisions.md "2026-09-13 night" and "2026-09-13 afternoon"
  - wiki/video-script.md (spoken lines, recording checklist, cut list)
  - nachweis-app/docs/hosting-server.md and docs/hosting-app-vercel.md (branch hosted-services)
  - git in the three repositories at about 17:00 Vienna
---

# Handoff 2026-09-13 evening

Deadline 2026-09-13 18:00 Vienna. Rules for the next agent: Fable models only, no Opus (the builder's instruction, high stakes); English; absolute paths; no em dashes, en dashes or double hyphens; never run rm; never read .env files or print secrets; never push anything the builder has not asked for; label FACT, CLAIM, OPINION.

## State (FACT, about 17:00 Vienna)

Live:
- https://attestat.dev landing page on Vercel (project attestat-site, auto-deploys from nachweis-site main; DNS at Porkbun set by API).
- https://app.attestat.dev the app on Vercel (project attestat-app, prebuilt upload; build recipe in docs/hosting-app-vercel.md on branch hosted-services), wired to the relay and bridge below; cross-origin isolated, so the browser prover works; no dev keys, MetaMask connect. The builder ran the full journey there with the phone on 2026-09-13 afternoon (scan, browser proof, approve, subscribe, swap, revoke); no evidence record written yet.
- https://relay.attestat.dev and https://bridge.attestat.dev on the builder's netcup NixOS server (module [local path, withheld], systemd units attestat-relay and attestat-bridge, nginx with ACME). Record: nachweis-app/docs/hosting-server.md. The collaboration stack on that server stays stopped on purpose; restore command in [local path, withheld]
- Contracts on Sepolia since 2026-09-10.

Repositories: devdotbo/nachweis-app PUBLIC (main at ee73ffc plus the branch hosted-services, not merged), devdotbo/nachweis-site PUBLIC (main at eaf07ba), devdotbo/nachweis (wiki) PRIVATE (main at 660cf4c plus uncommitted files listed below).

Privy: not claimed, not deployed. Tried at 16:15: Privy's embedded-wallet iframe is blocked by the Cross-Origin-Embedder-Policy header that the browser prover needs; the finding, the silent-transaction setting (showWalletUIs false) and passkey login are committed on hosted-services (commits a1f9cd2 through 66d8ec3) with two candidate fixes for after the deadline. The builder decided at 16:45: forget Privy for the submission.

Form: the builder is filling the ETHGlobal form from wiki/form-paste-2026-09-13.md and form-techstack-2026-09-13.md (both uncommitted). Images in submission-images/ (uncommitted). Prize: Uniswap Foundation only; category Zero Knowledge; track Building from Scratch; submission type Top 10 plus partner prizes.

Uncommitted in the wiki repo, to commit after the deadline: wiki/form-paste-2026-09-13.md, wiki/form-techstack-2026-09-13.md, wiki/review-brief-2026-09-13.md is committed, submission-images/, this page. Two exported transcripts stay untracked.

## The video, what is left (FACT and the plan)

Not recorded as of 17:00. The builder records on https://app.attestat.dev with MetaMask (a fresh investor account funded with about 0.02 Sepolia ETH; the deployer account for approve and revoke) using Zoom (camera on for the passport-cover intro, then the shared Chrome window, local recording, HD) and records the phone leg with the iPhone's own screen recording, AirDropped to the Mac. Spoken lines: wiki/video-script.md. Cards: video/cards.html. Teleprompter: video/teleprompter.html (serve the video directory with `python3 -m http.server 8790 --bind 127.0.0.1`).

Cut recipe for the next agent (ffmpeg on the Mac, no editor):
1. Input: the Zoom mp4 and the phone .mov in one folder the builder names. Probe both with `ffprobe` (resolution, fps, duration). Target output: 1920x1080, 30 fps, AAC audio, under 4:00, over 2:00, no speed change anywhere (speed-up disqualifies).
2. Transcribe the Zoom audio with the transcribe skill (Whisper) to get word timings; map the timings to the beats of video-script.md.
3. Cuts, from the script's cut list: trim each Sepolia block wait (after approve, subscribe, the four swap steps, revoke, the refused swap) to about 2 s, keeping the moment each chip turns green; one cut inside the proving stage with the caption "cut: <n> s from click to attested in this take" if the builder wants the caption, else a plain cut; never shorten beats 0, 2 and 10.
4. Phone leg: insert the phone recording at beat 3 (after the QR appears, before the portal shows pickup), scaled to fit inside 1080p with the portal visible if picture-in-picture is chosen (`overlay` filter), or as a full-frame cut. Mute the phone clip's audio; the narration continues from the Zoom track.
5. Cards: beat 0 (title) and beat 10 (limits, closing) can be re-shot as screen captures of cards.html if the Zoom take shows them poorly (`?card=N&still=1` for a static frame).
6. Concatenate with the concat demuxer after cutting each segment to identical codec settings; check the result plays end to end, the audio never drops, and the length is under 4:00. Export as mp4 (H.264, yuv420p).
7. The builder uploads the file on the Video page of the form (file upload, not a link).

## After the video (in order)

1. Evidence record of the builder's public-app journey of 2026-09-13: hashes from the bridge log on the server (`ssh cloud journalctl -u attestat-bridge`) and from the investor address on Etherscan; write docs/evidence/sepolia-public-2026-09-13.md in the app repo in the style of sepolia-phone-2026-09-12.md; re-verify hashes by public RPC.
2. Fill the take commit into the shot list gate (wiki/video-shotlist-spine.md, the placeholder); write the take record.
3. Merge hosted-services into app main (docs and the Privy branch changes; check tsc and unit tests), re-copy the wiki bundle (`bun scripts/wiki-copy.ts the wiki repository <wiki commit>`, update the pin and the Not-copied table in docs/wiki/README.md, run scripts/wiki-coverage.ts and scripts/check-doc-links.ts), push.
4. Remove "(read-only today)" from the description if the form still carries it, and the "Read-only against Sepolia today" line from the landing page hero, since the journey works on app.attestat.dev (verified by the builder, record pending).
5. Commit the form files, the images and this page to the wiki; keep the wiki private.
6. Uniswap feedback form (answers in form-paste-2026-09-13.md, last section) and both receipts.

## Open, after the deadline

- Privy on the public origin: the two candidate fixes in docs/hosting-app-vercel.md (credentialless iframe, or the prover in its own isolated top-level origin with a relay-mediated handoff); then the class S standing-order run per docs/privy-standing-order.md section 7.
- Privy CLI and agent access (scoped tokens approved in the browser): the builder's idea for an agentic angle; not started.
- Etherscan source verification (needs an API key).
- The hero text clipping at phone width on the landing page (pre-existing, cosmetic).
- A conversation with an issuer that owns a document funnel: the business gate recorded in product.md.
