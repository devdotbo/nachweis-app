---
type: reference
title: Reference demo video analysis, ETHGlobal example (web3torrent, HackMoney 2020)
updated: 2026-09-13
sources:
  - https://www.youtube.com/watch?v=T0jY6BqNS3w (ETHGlobal channel, uploaded 2020-05-16, downloaded 2026-09-13 with yt-dlp to [local path, withheld], info JSON and YouTube auto captions next to it)
  - wiki/reference-video-T0jY6BqNS3w/transcript.md (WhisperKit openai_whisper-large-v3, word timestamps, 2026-09-13)
  - wiki/reference-video-T0jY6BqNS3w/sheet-01.png to sheet-03.png (contact sheets, one frame every 3 s, 6 per row, read by the agent)
  - wiki/reference-video-T0jY6BqNS3w/frame-01-*.png to frame-19-*.png (single frames at each slide or demo state change)
  - ffprobe scene detection on the mp4 (thresholds 0.25, 0.12, 0.04, 0.015), 2026-09-13, this Mac
  - The builder's own Attestat video as described by the lead on 2026-09-13 (3:44 freestyle, not re-watched by this agent: figures for it are as given by the lead)
---

# Reference demo video analysis: web3torrent (HackMoney 2020)

ETHGlobal published this video as "an example for HackMoney hackers to reference when creating their demo videos" (FACT, YouTube description, read 2026-09-13). The description's rules for that hackathon: maximum 3 minutes, on YouTube, must include a demo, recorded narration or live talk-over, played inside a 6 minute judging slot with the rest for Q&A. Note that the example itself runs 3:41, over its own stated cap (FACT, ffprobe). Whether ETHOnline 2026 has the same 3 minute cap: unverified here, see the builder's rules page.

## Metadata

| Field | Value |
|---|---|
| Title | web3torrent: HackMoney Demo Video (FACT, info JSON) |
| Channel | ETHGlobal (FACT) |
| Upload date | 2020-05-16 (FACT) |
| Length | 220.6 s (3:41) (FACT, ffprobe) |
| Resolution, fps | 1920x1080, 25 fps, H.264 in mp4 (YouTube format 614 + 140 audio) (FACT) |
| Views, likes at download | 6534 views, 44 likes (FACT, info JSON, 2026-09-13) |
| Team | Liam Horne (backend), Kartik Talwar (frontend), per the "Who Are We" slide (FACT, frame-02) |
| Recording form | Screen share of a video call: full-frame slides and screen recording, with the call's gallery strip (two faces stacked, each about 130 by 80 px) in the top right corner for the entire length (FACT, frames; PiP size measured from a 1080p crop at 60 s) |
| Transcription | WhisperKit CLI, model openai_whisper-large-v3 (not turbo), language auto-detected en, word timestamps, run 2026-09-13 on this Mac; YouTube auto captions used as cross-check for proper nouns |

## Timeline

Times in seconds from the start of the file. Slide changes are from ffprobe scene detection (FACT); what is said is a paraphrase of the transcript.

| Start | End | On screen | What is said (paraphrase) | Purpose |
|---|---|---|---|---|
| 0.0 | 8.6 | Orange title card "Web3Torrent, HackMoney 2020" (frame-01). Silence until 3.8 s. | We are team Web3Torrent, this is what we built for HackMoney. | hook, title |
| 8.6 | 14.2 | "Who Are We": two photos, names, roles (frame-02) | Liam, backend. Kartik, frontend. Each speaks his own line. | team |
| 14.2 | 21.1 | "What We Built": pay for torrents on the web through micropayments of ETH (using State Channels) (frame-03) | One sentence, read as written on the slide. | solution |
| 21.1 | 42.4 | "How It Works": four bullets (WebTorrent under the hood, channels through a hub, payments per section of bytes, messages encoded as signed state updates) (frame-04) | Reads the four bullets in his own words, then "let's jump into the demo" at 40 s. | tech, primer for the demo |
| 42.4 | 51.4 | Two browser windows side by side, localhost app "Upload a File" (frame-05); file picker opens at 44.9 s (frame-06). Silence from 41.0 to 50.3 s. | On the left a user uploads a file, we pick one. | demo, first click |
| 51.4 | 56.9 | Wallet modal (State Channels iframe): "Connect to Blockchain", button "Connect with MetaMask" (frame-07) | They connect MetaMask, a local one on Ganache. | demo |
| 56.9 | 66.5 | "App Budget" modal: send 0.001 ETH, receive 0.001 ETH, "Approve budget" (frame-08) | They set a budget with the in-app wallet, which opens a channel with the hub. | demo |
| 66.5 | 75.2 | MetaMask popup over "Deposit funds" (frame-09), then "waiting for your transaction to be mined" (frame-10) | The hub deposits in the background, the user makes their own deposit. | demo, wait narrated |
| 75.2 | 86.6 | Left window lists the file: poster-small.png, 4.7 MB, status Seeding; right window opened on the share link, "Download a File", button "Start Download" (frame-11) | Once the deposit is done the channel is created, ready for a leecher; take the generated link to the other window. | demo, second party enters |
| 86.6 | 101.7 | Right window runs the same wallet flow: connect, budget, MetaMask, deposit (frame-12). Silence 92.7 to 96.3 s. | Same process, connect MetaMask, make a channel with the hub. | demo |
| 101.7 | 142.0 | Right: progress bar (862 KB of 4.7 MB, ETA); both windows show a channel table with peer, data, funds in kwei and Mwei (frame-13) | For each increment of bytes the downloader pays a little ETH, about 1 Mwei per MB; the seeder earns it; total about 4.7; every signed update is a channel update. | demo, mechanism explained during the wait |
| 142.0 | 146.5 | Right: status Completed, "Save Download", funds minus 4.7 Mwei (frame-14); the downloaded poster image opened full size at 143 to 146.5 s (frame-15) | The channel closes, the file is downloaded, the other browser has it. "So that's the demo." | demo payoff |
| 146.5 | 187.0 | "How It's Made": three pieces hub, wallet, app; protocol from scratch; wrapper on the BitTorrent protocol without bloat; security model between wallet and app (frame-16) | Hub is a Node.js server, wallet in an iframe, app; protocol designed from scratch on top of BitTorrent's message transfer so it is fast enough for the browser; the app cannot reach the private key or the funds. | tech |
| 187.0 | 204.8 | "Future Work": go to mainnet, add DAI and USDC (frame-17). Silence 185.2 to 188.4 s. | Take it to mainnet, add stablecoins, which enables gas abstraction. | roadmap |
| 204.8 | 217.4 | "Check it out live", http://web3torrent.xyz (frame-18) | You can check this out live; we had fun; thank you for your time. | ask, close |
| 217.4 | 220.6 | "Thanks" slide (frame-19) | Thanks. | close |

## Numbers

All measured on the downloaded mp4 on this Mac, 2026-09-13, unless marked.

- Total words: 629 (WhisperKit word tokens, FACT). Speech runs from 3.8 s to 217.6 s.
- Words per minute: 171 over the full 220.6 s, 177 over the 213.7 s speech span (FACT).
- Talking head full frame: 0 s. The two faces are in the call's gallery strip for all 220.6 s, about 130 by 80 px each at 1080p (FACT, frames).
- Slides (title card included): 42.4 s before the demo plus 74.1 s after it, 116.5 s, 53 percent (FACT, scene detection).
- Product demo (screen recording of the app): 42.4 s to 146.5 s, 104.1 s, 47 percent; of that about 3.5 s shows the downloaded image in a viewer (FACT).
- Screen other than product or slides: 0 s.
- Cuts: 8 editorial cuts, all of them slide changes or the two slide-to-demo and demo-to-slide switches (8.6, 14.2, 21.1, 42.4, 146.5, 187.0, 204.8, 217.4 s) (FACT). Inside the demo no cut is visible; scene detection at threshold 0.25 fires at 51.4, 75.2, 86.6, 101.7, 143.0 and 145.7 s, and each of those is a modal overlay, a MetaMask popup or a window focus change, not an edit (FACT, frames checked). Whether the demo take was trimmed between clicks: unverified.
- Seconds until the product is first shown: 42.4 (FACT).
- Seconds until the first demo click: 44.9 (file picker visible; frames at 44.6 and 44.9 s compared) (FACT).
- Longest silences: 9.2 s (41.0 to 50.3, switching to the demo and opening the file picker), 3.6 s (92.7 to 96.3, second wallet flow), 3.3 s (185.2 to 188.4, slide change to Future Work) (FACT, word timestamps).
- Spoken sentences that are on a slide: the "What We Built" sentence and the four "How It Works" bullets are spoken almost verbatim (FACT, transcript vs frame-03 and frame-04).

## What makes it work

- FACT: The app is on screen at 42 s (19 percent into the video) and stays there for 47 percent of the runtime. Everything before it is 4 slides with 1 to 4 lines each.
- FACT: The order is fixed and every section has a slide title: who, what, how it works, demo, how it's made, future work, link, thanks. A judge who skips around lands on a labeled section.
- FACT: Both parties of the transaction are visible in one frame (uploader left, downloader right), and the numbers the narration cites (kwei earned, Mwei spent, 4.7 total) are on screen while they are said.
- FACT: The waits inside the demo (deposit mining, download progress) are filled with the mechanism explanation ("each increment of bytes the downloader pays"), so the tech section is partly delivered on top of the moving product instead of on slides.
- FACT: The demo ends with a visible artifact (the downloaded image opened full size) and the sentence "that's the demo" before the slides return.
- FACT: "How It's Made" is a separate section after the demo and names the components, what was written from scratch and the security boundary. That maps onto the judging question of what was actually built.
- FACT: The close is a URL slide plus thanks, 16 s in total. No summary, no repetition of the pitch.
- FACT: Production is minimal: a video-call recording, localhost, Ganache, tiny faces, no captions, no zoom, no music. ETHGlobal still chose it as the example.
- OPINION: The video works because it is a narrated walkthrough, not a pitch. Almost every sentence is either what it does, how it does it, or what the viewer is looking at right now. There is no market sizing, no problem framing, no competitor line.
- OPINION: The 21 s "How It Works" slide before the demo is what makes the demo readable: the viewer knows to look for the channel, the hub and the per-byte payments before they appear.
- OPINION: Weaknesses to not copy: the 9 s silence at the demo switch, the small UI text in two side-by-side windows at 1080p, wallet popups that flash by without a pointer highlight, and one slip ("the leecher is earning") that a scripted take would have avoided.

## Side by side with the builder's Attestat take (2026-09-13)

Builder figures are as reported by the lead; the take itself was not re-watched by this agent.

| Aspect | Reference (web3torrent) | Builder (Attestat, 3:44) |
|---|---|---|
| Length | 221 s | 224 s |
| Title card | Yes, 8.6 s, name and event | None |
| Time until the product is on screen | 42 s (19 percent) | about 180 s (80 percent) |
| Demo share of runtime | 104 s, 47 percent | about 44 s, 20 percent |
| What fills the time before the demo | 4 slides: team, one sentence, four bullets | Talking over the landing page for about 180 s |
| Tech explanation | Split: 21 s primer before the demo, 40 s "How It's Made" after it, mechanism narrated during waits | Delivered up front over the landing page (as reported) |
| Presenter on screen | Video-call strip, both members, about 130 by 80 px, whole length | One camera PiP, whole length |
| Parties in one frame | Both browser windows side by side | Sequential: browser, then phone PiP for the QR scan, then browser proof |
| Demo steps | pick file, connect, budget, deposit, share link, connect, budget, deposit, download, open file (10 states) | connect, sign, QR scan on phone, browser proof, "attested" (5 states) |
| Visible end artifact | Downloaded image opened full size | "attested" state in the browser, then a closing card |
| Close | URL slide (13 s) plus "Thanks" slide (3 s) | Closing card |
| Silences | One 9 s gap, two of about 3.5 s | unverified |
| Structure signposting | 8 slide titles | None reported |
| Words per minute | 171 | unverified |

Concrete differences in structure and pacing:

1. The reference front-loads 42 s, the builder front-loads 180 s; the reference's demo is longer than the builder's entire pre-demo section is short.
2. The reference has an explicit skeleton (title, who, what, how, demo, how made, future, link, thanks); the builder's take is one continuous talk with no section markers.
3. The reference explains the mechanism twice, briefly before (what to look for) and in depth after (what was built); the builder explains once, before, at length.
4. The reference shows cause and effect in one frame (two windows); the builder's flow crosses devices, which needs a phone PiP and costs the viewer a re-orientation at each switch.
5. The reference narrates through every wait; the builder's take: unverified.
6. The reference ends on the product's output plus a URL; the builder ends on a card.

## Five rules for the next Attestat video

1. Put the app on screen by 0:45: title card (5 s), one sentence what it is (7 s), one slide with at most four bullets on how it works (20 s), then the first click.
2. Give the demo at least half the runtime and narrate the mechanism (what is being signed, what the proof contains, what the contract reads) over every wait, so no silence runs longer than 2 s.
3. Keep every party in one frame: verifier browser and holder phone side by side for the whole flow, so the QR scan and its effect are visible without a device switch.
4. Signpost with one-line slides in a fixed order (who, what, how it works, demo, how it's made, limits and future work, link, thanks) and read each slide in its own words in under 25 s.
5. End on the artifact, then the URL: open the on-chain attestation in the explorer, cut to a slide with the live link, say thanks, all within 15 s, and land under the length cap that applies to ETHOnline 2026 (the reference overran its own 3 minute cap by 41 s, do not copy that).

## Files

- [local path, withheld] (video, 9.6 MB)
- [local path, withheld] (yt-dlp metadata)
- [local path, withheld] (YouTube auto captions)
- wiki/reference-video-T0jY6BqNS3w/transcript.md
- wiki/reference-video-T0jY6BqNS3w/sheet-01.png, sheet-02.png, sheet-03.png (contact sheets; tile k of a sheet is at 3 times (30 times sheet index plus k) seconds, no timestamps burned in because this ffmpeg build has no drawtext filter)
- wiki/reference-video-T0jY6BqNS3w/frame-01-1_0s-title-card.png through frame-19-218_0s-thanks.png (960 px wide, time in the filename)
