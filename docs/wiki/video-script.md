---
type: reference
title: Video script, spoken words per beat
updated: 2026-09-13
sources:
  - wiki/video-shotlist-spine.md (beats 0 to 10, seconds, screens, captions, printed lines; read 2026-09-13 before the same-day edit by another agent)
  - canonical copy decided by the lead on 2026-09-13 (scratchpad file canonical-copy.md: C2 spoken line, C3 product sentence, C5 privacy wording, C6 spoken form, C11 closing card line, C16 issuer caption, forbidden words)
  - wiki/pitch.md (the lines, the seven beats, front-door rules, what the video must not hide)
  - wiki/narrative-zk.md:70 (the 40-word ZK line)
  - nachweis-app/docs/evidence/sepolia-phone-2026-09-12.md (timings cited by the shot list: prove 11.0 s, pickup to attested 40 s)
---

# Video script, spoken words per beat

The spoken words for the take, in the builder's voice. "We" is the team, "she" is the investor, as in the shot list. Pace 140 to 150 words per minute; the runtime figures below use 145 words per minute (2.42 words per second). The seconds per beat are the shot list maxima; the screen action, not the words, fills the remainder of each beat. Beat 9 (standing order, Privy) is conditional and is not recorded: it is omitted here, and Privy appears nowhere in the script, the captions or the cards.

Totals (FACT, counted from the lines below with a script on 2026-09-13): 395 spoken words, 2:43 of speech at 145 words per minute; beat budgets 212 s, that is 3:32 of runtime without beat 9, inside the 2 to 4 minute rule and inside the 2:45 to 3:30 target. Beat 10 is budgeted at 35 s, not the shot list's 20 s, because the closing card gained C11 and the four limit lines plus the product sentence plus C11 are 65 words (26.9 s); nothing else moves.

Rules applied: no "first", no "only", no yield figures, no KYC, no incident, no date and no "this week" is spoken. The 40-word ZK line is spoken in beat 4 and nowhere else. Where the shot list's spoken column and the canonical copy differed, the canonical copy won (beats 4, 5 and 10).

Rewrite, 2026-09-13 morning (lead, after the builder heard the first draft: "it just doesn't sound like a pitch, it's super mechanical"): the spoken lines were rewritten for a voice. The captions on screen keep the exact wording of the shot list and the app; the spoken lines carry the story in plain sentences and paraphrase the captions instead of reading them. Substance unchanged: official test wallet with a sample identity, proof in the browser tab, separate manual approval, simulated checks, manual revocation, the verifier adapter not built. Beat 0 is 14 s and beat 10 is 35 s to hold the new lines; total budget 212 s, speech 395 words.

## The beats

### Beat 0, intro, 14 s

Spoken (28 words, 11.6 s):

Every fund and exchange you sign up for keeps a copy of your passport. Your ID wallet should work where you invest. Here is what that looks like.

On screen: cards.html card 1 (title "Attestat", then the C2 line fades in); no app yet.

Caption visible: Your ID wallet should work where you invest.

### Beat 1, the investor, 10 s

Spoken (22 words, 9.1 s):

Meet the investor. She opens a fund with her own crypto wallet, and the fund says no. It doesn't know her yet.

On screen: the investor portal in the one app tab: connect card with the investor address, eligibility card reading `not permitted`, doors card with both doors closed. No click beyond connecting.

Caption visible: identity evidence required

### Beat 2, the binding, 8 s

Spoken (16 words, 6.6 s):

Her crypto wallet signs. Whatever follows is tied to this address, not just to a person.

On screen: click "create presentation request"; the crypto wallet signs `nachweis:session:<id>`; the portal shows the session id.

Caption visible: signed by the crypto wallet, not by the ID wallet

### Beat 3, the wallet, 25 s

Spoken (43 words, 17.8 s):

She scans with the official German test wallet, a sample identity. It shows exactly what the fund asked for: given name, family name, over eighteen. One tap. Those names never reach the issuer and never reach the chain. They stay in her browser.

On screen: portal with "In this browser" selected and the QR; the QuickTime window with the phone: the official test wallet shows the request, one tap; portal stage chips `requesting`, `waiting`, `pickup`.

Captions visible: official test wallet, sample identity (on the QR shot); names stay in the browser tab, not with the issuer, not on chain (on the phone shot); phone leg: recorded 2026-09-12, docs/evidence/sepolia-phone-2026-09-12.md

### Beat 4, the proof, 35 s

Spoken (68 words, 28.1 s):

Now her browser builds a zero-knowledge proof. The EU asks for proofs like this inside the wallet itself. It hasn't picked how yet. So today the proof is made here, on her computer, from the wallet's ordinary answer. When wallets can prove for themselves, an adapter would take their proof. That adapter isn't built. What lands on chain: an address, a policy, over eighteen, an expiry. No name.

On screen: no click; the stage chips run `checking`, `witness`, `init`, `proving`, `verifying`, `submitting`, `submitted`; then the "what the chain sees" card (subject, issuer key hash, over 18 = 1, expiry) and `attested from this browser`. Speak the ZK sentences during `proving`; keep rolling through the wait; the one cut goes inside `proving` in the edit.

Captions visible: Proof made in this browser tab. The relay passed the wallet's encrypted answer through unopened; the tab decrypted it, proved and dropped it. (the app's own caption); on the cut: cut: <n> s from click to attested in this take; on the chain card: evidence on chain, awaiting issuer approval

Note (OPINION, for the lead): the shot list's 40-word line ends "When wallets prove, the registry accepts that proof instead." That sentence is the "plugs in when one ships" wording that C6 replaces, so the script speaks sentences one and two of the 40-word line (31 words) and then the C6 spoken form (19 words). If the lead wants all 40 words kept verbatim before C6, insert "When wallets prove, the registry accepts that proof instead." after "presentation."; the beat then has 75 words (31 s) and still fits 35 s, with no margin for the wait.

### Beat 5, the issuer, 20 s

Spoken (42 words, 17.4 s):

The issuer still decides. It never received her document; it received evidence. It approves in its own step. The other checks are stubs, and the screen says so. Now the chain says: eligible under this policy, until this date. Still no name.

On screen: header navigation (Issuer link in the top bar, same tab, no reload) to the issuer console; the pending presentation with the "What Approve confirms" text; click Approve; registry events show `Approved`; header navigation back to the investor portal: eligibility turns approved, both doors open.

Captions visible: the C16 text on the pending item: What Approve confirms: the registry holds evidence for this session that its proof verifier accepted (on the browser route the investor's tab made the proof from the official test wallet's answer, sample identity); the bound address signed the session; the issuer approves eligibility for that address. Sanctions and other checks: simulated in this build. Also: approval: manual, a separate on-chain step; Checks beyond identity evidence and age are simulated in this build.

Note: the Approve transaction waits for a Sepolia block; 20 s is the spoken budget, the wait may push the beat to about 30 s. That overrun is absorbed in the edit (cut list below), not by speaking faster.

### Beat 6, door one, 15 s

Spoken (28 words, 11.6 s):

Door one. She subscribes to the fund's own token. Its transfer check reads that one record and lets her in. A hundred units, no payment in this demo.

On screen: investor portal, click Subscribe; the receipt; holdings show `100 NDF`; the history line.

Captions visible: door one: the issuer's fund token reads the record; demo fund: subscribe mints 100 NDF without payment

### Beat 7, door two, 25 s

Spoken (39 words, 16.1 s):

Door two. A Uniswap permissioned pool. Its hook asks our checker, the checker asks the registry. She buys fund tokens through the pool. No second scan, no second proof. This is Sepolia, so every step waits for a block.

On screen: the Swap tile: pool line NDF/mUSD, the "You receive" quote for 100 mUSD (whatever the portal quotes in the take, do not script the figure), the three answers (registry, checker, adapter); click Swap; step chips faucet, approve, Permit2, execute; `swap confirmed` with hash and gas; open the swap hash on sepolia.etherscan.io from the app's link.

Captions visible: Sepolia; door two: Uniswap v4 permissioned pool, the allowlist checker reads the same record

### Beat 8, the revoke, 25 s

Spoken (34 words, 14.1 s):

Then the issuer changes its mind. One click, by hand: revoked. The fund door closes. She tries the pool anyway. The pool refuses, and tells her which contract said no. One revoke, both doors.

On screen: header navigation to the issuer console; click Revoke; registry events show `Revoked`; header navigation back to the portal: eligibility `revoked`, the doors-closed note, the fund door `closed` with the greyed Subscribe control (rendered disabled, do not try to click it); click Swap: `swap refused`, "Refused by PermissionedHooks.beforeSwap", the reverted hash; open that hash on sepolia.etherscan.io from the app's link.

Captions visible: Sepolia; manual revocation; fund door: closed, Subscribe disabled by the app; pool refuses: PermissionedHooks.beforeSwap

### Beat 9, standing order: not recorded

Conditional on a green Privy run on Sepolia and the builder's explicit yes; neither is on record. Omitted. Privy is not mentioned anywhere in the take.

### Beat 10, limits, then stop, 35 s

Spoken (75 words, 31.0 s):

What this is not. Not a real identity: the official test wallet, with a sample person. Sanctions and the other checks: simulated. The proof runs in her browser; the relay never opened her answer. Revocation is manual. What it is: an issuer accepts the EU identity wallet once, and carries its approval everywhere it controls on chain, without ever holding a copy of your passport. The pool never learned about EUDI. It read one record.

On screen: cards.html card 2 (the four limit lines) while the four lines are read; then card 3 (the product sentence, then C11 fades in below it) for the last two sentences. Hold card 3 for two seconds of silence, then stop.

Captions visible: the four limit lines verbatim from the shot list: official German test wallet, sample identity; sanctions and other checks: simulated; proof made in the browser tab on the investor's computer; the verifier relayed the encrypted answer unopened; revocation: manual. Then the product sentence (C3) and below it: The pool never learned about EUDI. It read one record.

## Per-beat budget table

| Beat | Seconds | Words | Speech at 145 wpm | Share of budget |
|---|---|---|---|---|
| 0 | 14 | 28 | 11.6 s | 83 % |
| 1 | 10 | 22 | 9.1 s | 91 % |
| 2 | 8 | 16 | 6.6 s | 82 % |
| 3 | 25 | 43 | 17.8 s | 71 % |
| 4 | 35 | 68 | 28.1 s | 80 % |
| 5 | 20 | 42 | 17.4 s | 87 % |
| 6 | 15 | 28 | 11.6 s | 77 % |
| 7 | 25 | 39 | 16.1 s | 64 % |
| 8 | 25 | 34 | 14.1 s | 56 % |
| 10 | 35 | 75 | 31.0 s | 89 % |
| total | 212 s (3:32) | 395 | 2:43 | |

Beat 10 has no click to wait for, so its high share is fine; the two sentences of the closing card are read over card 3 without a pause between them.

## Recording checklist

Before the take:

- One Chrome tab for the app at the Vite port the stack prints, currently http://127.0.0.1:62953 (the port changes when the stack restarts; read it from the stack log). No second window, no reload from beat 1 to beat 8; a reload empties the pending presentation and the history lines and the take restarts at beat 1.
- The investor 0xD5a3AeD26885169fdC924EC1129b66353F8D33b8 must be fresh: no decision in the registry for this policy and no pending session. Check the eligibility card reads `not permitted` and both doors are closed before pressing record; if a decision exists, use a fresh investor address and note it.
- Beat 5 caption: open the issuer console once in a rehearsal and confirm the pending item shows the new C16 text ("What Approve confirms: the registry holds evidence for this session that its proof verifier accepted ..."). If the old sentence ("verified by the issuer's verifier") is still on screen, the app tree is not the one to record from; stop and rebuild before the take.
- Phone: connected by cable; QuickTime Player, File, New Movie Recording, camera source set to the iPhone; the QuickTime window sits next to the browser and is inside the recorded area at readable size (test one screen recording of 5 s and look at it before the take; this mirroring is unverified on this Mac).
- Etherscan: sepolia.etherscan.io reachable in the same Chrome; the app's per-hash links open in a new tab (that is fine, the app tab stays alive), used in beats 7 and 8 for the swap hash and the refused-swap hash. Close the Etherscan tab after each look and return to the app tab; never close the app tab.
- Cards: serve video with `python3 -m http.server 8790 --bind 127.0.0.1` and open http://127.0.0.1:8790/cards.html in a separate Chrome window, full screen, for beats 0 and 10 (they can be recorded before or after the app take; see the video README).
- Teleprompter: http://127.0.0.1:8790/teleprompter.html on a second display or a phone; it holds exactly the lines above.
- Recorder: QuickTime screen recording or the macOS shortcut at native display resolution; export 1080p; 720p is the floor. Own voice through the built-in or an external microphone; no text-to-speech, no speedup, no music over the voice.
- Stack: `scripts/browser-real-wallet-up.sh --deployment docs/deployments/sepolia-2026-09-10.md`; every click in beats 4 to 8 waits for a Sepolia block (about 12 s each); the investor and issuer signers must hold Sepolia ETH.

During the take:

- If the proof stage takes longer than 35 s: keep rolling and keep silent after the ZK sentences; do not restart. The cut goes inside `proving` in the edit and the caption states the measured click-to-attested time of this take.
- If a transaction is slow, keep rolling; pauses are cut in the edit. A reload or a wrong address restarts the take; nothing else does.
- Read the caption on the beat it belongs to; the caption list above is what the check before uploading looks for.

Before uploading: duration between 2:00 and 4:00, resolution at least 720p, voice is the builder's, every caption above appears at its beat, no Privy, no incident, no date on screen or in the audio.

## Cut list for a 2:30 to 3:00 edit

The raw take will be longer than 3:25 because of the Sepolia waits. Cuts, in this order, until the edit lands between 2:30 and 3:00:

1. Beat 4, one cut inside `proving`: keep the chips `checking` and `witness`, cut from about 3 s into `proving` to about 2 s before `verifying`, caption "cut: <n> s from click to attested in this take" with the measured figure. This is the one planned cut; it removes about 8 to 12 s.
2. Beat 5, the Approve block wait: cut the dead time between the Approve click and the `Approved` event; keep the click and the event on screen (about 8 s saved).
3. Beat 7, the four transaction waits (faucet, approve, Permit2, execute): cut each wait to about 2 s, keep every chip turning green in order (about 20 to 30 s saved). The spoken line "This is Sepolia, so each step waits for a block" stays; it explains the chips.
4. Beat 8, the Revoke block wait and the refused-swap wait: same treatment as beat 5 (about 10 s saved).
5. Beats 7 and 8, the Etherscan looks: hold each Etherscan page for 3 s, no longer.
6. If still over 3:00: shorten beat 3 by trimming the wallet's loading time before the request appears on the phone (keep the request screen and the tap).

Beats that absorb overrun without cuts: beat 1 (3 s spare), beat 3 (10 s spare), beat 7 and beat 8 (10 s spare each after the cuts above). Beats that must not be shortened: beat 0 (the C2 line must be heard in full), beat 2 (the signing is the binding argument), beat 10 (the limits are read in full; the closing card holds two seconds after the last word).
