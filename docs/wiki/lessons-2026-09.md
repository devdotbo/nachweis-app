---
type: retrospective
title: Lessons 2026-09: what worked, what went wrong, and what agents and the product take from the ETHOnline 2026 build
updated: 2026-09-13
status: Written the evening of the deadline by a Fable teammate on the lead's instruction, for the possible finalist round and the next event. Every item one paragraph, evidence by path or quote.
sources:
  - wiki/handoff-2026-09-13-final.md, handoff-2026-09-13-night.md, handoff-2026-09-13-evening.md, handoff-2026-09-13.md
  - wiki/decisions.md (2026-09-09 to 2026-09-13)
  - wiki/review-brief-2026-09-13.md, product.md, pitch.md, video-script.md, incidents-idscan-revolut-2026-09.md
  - [session transcript, not published] and [session transcript, not published] (exported transcripts, builder's words quoted verbatim)
  - wiki/video-take-2026-09-13/take-transcript.srt (the take, WhisperKit large-v3)
  - nachweis-app/docs/hosting-app-vercel.md, hosting-server.md; nachweis-app/docs/ai-attribution.md
  - [local path, withheld] (the builder's standing rules for agents)
  - the lead's brief to this teammate of 2026-09-13 evening (items marked CLAIM where no file carries them)
---

# Lessons 2026-09

Labels: FACT (read at the source, cited), CLAIM (lead or reviewer, not in a file), OPINION (synthesis), unverified.

## 1. What worked

The honesty rules as a filter. FACT: wiki/product.md:44 to :48 fixes what may be said (official test wallet, sample identity; where the proof is made; simulated is captioned; no "first", no "only", no KYC outside one form field). Every review round used them as the test: the Revolut card kept its retention sentence only "scoped and attributed", and "the only way to hold less" was struck from product.md:23 (decisions.md, 2026-09-13). OPINION: a written list of forbidden sentences beats any reviewer; it makes a rejection cheap to explain and impossible to argue by taste.

The review tournament. FACT: four external models (xAI Grok, Z.ai GLM 5.3, a modified GLM 5.3, OpenAI Codex Astra) plus the lead reviewed one brief, and wiki/review-brief-2026-09-13.md classified every ask as applied, applied differently or rejected, with file and line. The lead's ranking [session transcript, not published]:536 to :588): "the useful answers came from models that opened files, and the least useful came from models that reasoned over the transcript. Harness mattered more than model." OPINION: a reviewer without file access is an editor.

The evidence-record discipline. FACT: nachweis-app/docs/evidence/sepolia-phone-2026-09-12.md:7, "Every hash in this file was re-read on 2026-09-12 with cast receipt and cast tx against the public RPC"; the refused swap was replayed with eth_call and decoded to PermissionedHooks.beforeSwap Unauthorized (:42). OPINION: the record is the strongest artefact of the submission and the fallback for a failed live demo; the video is the weakest.

The one-journey narrowing of 2026-09-10. FACT: decisions.md "2026-09-10 morning": the builder accepted ("ok") dropping the toolkit plus showcase pitch of 2026-09-09 night for the product sentence and one recorded journey; gallery unlinked, Privy cases parked, zkPassport off the story. Every later review confirmed it (transcript 164057:703, "Four of the five agree on the frame").

The last-day hosting. FACT (handoff-2026-09-13-evening.md; hosting-server.md:17 to :20): attestat.dev on Vercel from main, app.attestat.dev as a prebuilt upload without dev keys, relay and bridge as two systemd units on the builder's netcup NixOS server behind nginx, DNS at Porkbun set by API; the full journey ran on the public origin the same afternoon.
The canonical-copy file. FACT: video-script.md's front matter cites the scratchpad file canonical-copy.md (C2, C3, C5, C6, C11, C16, forbidden words), and decisions.md "2026-09-13 night" refers to C1 to C16 by number; four teammates edited three repositories in parallel from it. OPINION: numbered items end wording disputes ("C6 won over the shot list"). Next time the file lives in the wiki, not in a scratchpad.

## 2. What went wrong

The toolkit and SDK framing came back three times. FACT: 2026-09-09 night the builder reframed to "the toolkit that plugs into the EUDI wallet" with five Privy cases and a gallery (decisions.md, "Showcase reframe"); 2026-09-10 morning he accepted the narrowing; 2026-09-12 evening he wrote "i want ot pitch that overall as a zk sdk for enable anykind of kyc process" (transcript 164057:157) and the round rejected it again. Root cause in the lead's words (164057:379): "The SDK framing feels good because it names no buyer, which is why it returns at night and dies under review in the morning." Fix: no framing change without a named customer asking for it; the buyer question stays open in product.md:21.

Hosting decided on the last day although the domains existed for a week. FACT: attestat.dev, .app and .xyz were bought by 2026-09-08 (name-and-domains.md:24 to :29); on 2026-09-12 "attestat.dev is unhosted (Porkbun parking, TLS handshake fails)" (decisions.md); the Vercel project was created 2026-09-13 15:03 (hosting-app-vercel.md). Root cause: hosting sat under "not decided, the builder's" in three handoffs without an acceptance test. Fix: a live URL is a work package with a gate on day one (pitch.md, front-door rules: the judge's one click lands on the flow).

Privy tried at 16:15 on deadline day, blocked by COEP. FACT (hosting-app-vercel.md, "Privy on the public origin: blocked by COEP (2026-09-13, 16:40)"): the embedded-wallet iframe from auth.privy.io returned ERR_BLOCKED_BY_RESPONSE under Cross-Origin-Embedder-Policy: require-corp, and the header stays because bb.js needs crossOriginIsolated for the browser proof; the builder decided at 16:45 (lead's session record: "option 1 is too slow, then we have to use MetaMask again, let's forget about Privy"). Both features had run for days on localhost; one early deploy with both on would have found the conflict. Fix: that deploy in the first half of the week; the two candidate fixes (credentialless iframe, prover on its own isolated origin) are in the same file.

The video script was rejected twice. FACT: the first draft read the captions aloud and the builder said "it just doesn't sound like a pitch, it's super mechanical" (video-script.md, rewrite note). The second draft (400 words, teleprompter, cards) was not used either: the take of 17:28 was a freestyle over the landing page, the app appeared at about 3:02 of 3:44, and the builder's verdict was "it was my mistake to do that last min" (handoff-2026-09-13-final.md). FACT (lead's session record, 2026-09-13, export pending as [local path, withheld]): the builder said of the second draft "that pitch is even worse than mine to be honest"; the lead wrote a nine-line skeleton at 17:15 (verbatim in finalist-prep-2026-09-14.md, section b) and the take freestyled from it. Root cause: agents wrote in their own register, the speaker never rehearsed, the take was in the last hour. Fix: the speaker writes the skeleton, agents fill facts under it; the take in the morning after one rehearsal; the five rules in wiki/reference-video-T0jY6BqNS3w/analysis.md (product on screen by 0:45, demo half the runtime).

The operator wallet drained by the lead's own funding transfer. FACT (lead's session record, 2026-09-13, export pending): at 17:05 the lead funded the first take wallet 0x7424Cb930C6fF5d40ab95E0A1622B081E392cF87 with 0.02 ETH from the deployer (tx 0x3c5b9514224aab7759185df7959b46945999d31539ea9120bd235a542f2eb72d), leaving the deployer, also the bridge's attestWithProof signer (sepolia-checklist.md:6), at 0.000037 ETH; at about 17:20 the builder's attestWithProof on app.attestat.dev failed with "-32003 insufficient funds for gas * price + value", no decision written; the builder refilled the operator to 0.24 ETH by hand (0.185 ETH at 18:27, cast balance). Fix: operator and investor balances are the first line of the pre-take checklist, and investors are funded from a wallet that is not the operator.

Count drift between pages. FACT: the script's word count was 357, then 395, then 400 (review-brief-2026-09-13.md:117 names the stale 357; video-script.md now says 400); beat 10 was 20, 30, 35 and 40 s across four pages. Root cause: numbers live in several pages. Fix: one page owns each number, the others cite it by path.

Form fields written long, cut on the last afternoon. FACT: the description in submission-text.md is 525 words (:23); the form took 180 words and how it's made 200 (form-paste-2026-09-13.md:70, :90, "cut to the builder's length limit on 2026-09-13 afternoon"). FACT (lead's session record): the drafts were 650 and 844 words at 15:45, cut at 16:00 on the builder's instruction "that is so much text, insane, tone it down, think about the jury". Fix: write for the judge's minute from the start; the long version is a separate record page.

The Privy standing order never ran in Privy mode although it was a sponsor track. FACT: docs/privy-standing-order.md status line, "class S (Sepolia with the builder's Privy app) not run"; decisions.md 2026-09-10, "Privy: undecided"; the form did not tick Privy (form-paste-2026-09-13.md, "Do not tick: Privy"). Root cause: the sponsor decision stayed conditional for four days, so nobody owned the run. Fix: a sponsor track is committed with a dated run or dropped by mid-week; "conditional" is not a status.

The transcripts collapsed in the terminal export. FACT: review-brief-2026-09-13.md:39, "163 lines hidden" and "96 lines hidden", so GLM's and part of Astra's texts had to be cited as CLAIM from the lead's summaries. Fix: save every external review as its own file in raw/ when it arrives.

Nine confirmation prompts on camera. FACT (lead's session record, from the 2026-09-12 hashes): one signature, six investor transactions (subscribe, faucet, approve, Permit2, execute, refused swap), approve and revoke from the operator account; the dev signer cannot ship in a public page (hosting-app-vercel.md). FACT: the take's swap was refused because approve was skipped (handoff-2026-09-13-final.md). Fix: approve before the camera rolls and count the prompts in a rehearsal; the take is never the first run of the day.

## 3. Process lessons for agents

Fable-only on deadline day was the builder's call. FACT: every 2026-09-13 handoff opens with "Fable models only, no Opus (high stakes)"; [local path, withheld], "Exception, high stakes": reading and searching stay on Fable "because a missed detail there is a wrong answer that looks right". OPINION: right for copy and evidence; the price was context (the lead's "near its limit" by 17:00).

Teammates as bounded workers. FACT: CLAUDE.md, "Teammates are workers, not residents: one bounded task with a stated return format, then close"; the builder's rule of 2026-09-09: "close every teammate as soon as it is idle" (decisions.md).

Never fund from the operator wallet: it is the bridge's signer, and an empty operator stops attestWithProof for every visitor (section 2).

Read files before ruling. FACT: the lead retracted three of its own verdicts after reviewers read the circuit and the shot list ("any predicate the wallet can present", the thesis in the first twenty seconds, "the EU lacks ZK"; transcript 153234:355 to :372, recorded in decisions.md "2026-09-13 night").
One canonical copy file, in the wiki, numbered items, forbidden list at the top (section 1).

Test on the public origin early (section 2, hosting and Privy).

A pre-take checklist: operator and investor balances by cast; the caption on screen ("What Approve confirms"); COOP and COEP headers on the public origin; the phone reaches relay.attestat.dev; a fresh investor with no decision; approve before subscribe and swap.

## 4. Product lessons

The open position is the acceptance clock plus the incidents, not "the EU lacks ZK". FACT: "the EU lacks ZK" was retracted as falsifiable (narrative-zk.md:55, decisions.md); the surviving claim is timing (ARF v3.0.0: no ZK scheme selected, wallet-side support after launch) and the conditional Article 5f duty (product.md:21: listed sectors, at the user's request, from 2027-12-24, small enterprises exempt). The problem side is the two September incidents, with the caveat that the compliance file stays (incidents page, item 6).

The buyer conversation is the next step. FACT: product.md:21, "No named operator has yet said which step Nachweis would replace; that is the business gate after 2026-09-13"; the lead (164057:381): "No fifth opinion fills that gap. One conversation with a tokenized fund issuer or transfer agent after the deadline does."

Wallet-side proofs need an adapter. FACT: "Future wallet-generated proofs could use the registry interface through a compatible verifier adapter. That integration is not implemented or demonstrated here." (site index.html:245, review-brief-2026-09-13.md C1 item 3). The circuit covers one predicate: German PID, over 18.
