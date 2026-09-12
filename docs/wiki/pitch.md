---
type: reference
title: Pitch
updated: 2026-09-13
sources:
  - raw/build-plan.md (beats)
  - raw/front-door-brief-2026-09-02.md (front-door rules)
  - nachweis-site/index.html (landing copy, read 2026-09-07, renamed to Attestat 2026-09-08)
---

# Pitch

## The lines

- Spoken opening, first line of the video: "Your ID wallet should work where you invest."
- Hero question on the landing page (h1, nachweis-site/index.html): "How many strangers keep a copy of your passport?"
- Sub-line on the site: "Every exchange, launchpad and fund asks for your ID and keeps it. Attestat lets the state ID wallet on your phone do that job once, and puts only the issuer's decision on chain."
- Closing card: "Attestat helps token issuers accept EUDI identity evidence and apply their approval to customers' linked crypto wallets, without putting identity documents on chain." Below it: "no document on chain".
- Sentence a judge should repeat with the tab closed: a state test wallet showed three fields to a fund issuer, the issuer approved, the approval became a few bits on chain that a fund token and a Uniswap pool both read, and one revoke closed both.

## The seven beats (from build-plan.md, adjusted to the proof routes)

Under three minutes of content inside a 2 to 4 minute video. Voice is the builder. Screen is the live app, the phone, the explorer. No terminal first. One screen per beat.

1. The investor. A labelled investor whose onboarding with a demo fund issuer is complete opens the fund app from her own wallet. The address is not yet permitted. Caption: "identity evidence required".
2. The wallet. QR. The official test wallet presents the registered request: given name, family name, over 18. She taps once. Captions: "official test wallet, sample identity" and "names stay in the browser tab, not with the issuer, not on chain".
3. The issuer. The issuer's screen shows the verified presentation summary for this session (sample identity from the official test wallet, the claim paths, the bound address that signed the session); it does not claim a hidden name match, because the bridge returns no names (review 2026-09-08). Remaining checks are labelled "simulated". The proof lands first as evidence on chain ("evidence on chain, awaiting issuer approval", doors closed); then the separate Approve click, the `approve` transaction, doors open (WP16, enforced in the registry since 2026-09-08). Depending on the route, "PID verified, generating proof" with the measured time on screen (R1: proof by our verifier; client-side: proof on the Mac companion, phone optional). Etherscan shows predicate bits, tier, expiry, policy id, no name. Caption states where the proof was made.
3a. The binding. Her wallet signs a challenge with the Ethereum key; the presentation is bound to the address. Caption: "signed by the crypto wallet, not by the ID wallet".
4. Two doors. She subscribes to the demo fund token with test assets, then swaps in the Uniswap permissioned pool without a second presentation. Spoken: "One permission, two doors."
5. The exhibit, separately captioned, about ten to twenty seconds, only if WP11 is green: on-phone Longfellow proof from an open wallet into verifier-zk, then a plain document rejected. Caption: "test credential, open wallet, on-phone proof; the official wallet does not produce this proof today". If WP11 is not green, this beat is cut.
6. The revoke. The issuer withdraws approval manually. Fund and pool both refuse. Caption: "manual withdrawal".
7. Limits, then stop. Four lines on screen: official test wallet with a sample identity; simulated checks are stubs; the proof is made on the investor's computer by our companion (the server relayed the encrypted answer unopened), captioned; revocation is manual. Last spoken line: the closing card sentence.

## Front-door rules (from the brief of 2026-09-02, applied to Attestat)

- Title, h1 and first spoken line carry one claim a stranger repeats in 90 seconds. Lead with what happened and why it matters; technical evidence comes fourth, never first.
- One person (the investor), one decision (the issuer's approval), one interaction (present once), one result (two doors open, one revoke closes both), one proof (the on-chain record and the ZK proof).
- No "first", no "only". The site line "the first product to plug the state wallet into on-chain finance" violated this rule and was removed by the lead on 2026-09-07 (verified on disk).
- The sponsor list on screen must match the committed sponsors. The Chainlink chip was removed from the site footer by the lead on 2026-09-07 (verified on disk); Privy stays until question (c) is answered.
- Judging is asynchronous: a video, the description, at most one click on the live link. The one click must land on the flow, not on a console. Nothing routes a judge to a settings page or a table.
- Do not treat agreement among AI reviewers as a jury. Do not restyle into a generic hackathon look. Do not add a chatbot. Do not add sponsor integrations beyond the committed ones.
- Retired wording (build-plan.md): yield figures, "second KYC removed", "everyone has this wallet by 2027", KYC outside the kycUrl form field, "real state-issued identity", "the thing SPRIND is lacking", Spiko as a partner.

## What the video must not hide

If proving takes minutes, cut once and caption the real duration. If a step is simulated, the caption says simulated. If the phone run was on iOS with a birthdate fallback, the caption says which claim was shown.

## Incident evidence for the hero question (added 2026-09-12)

Two identity-document incidents in the twelve days before the deadline, researched and evidence-labelled in wiki/incidents-idscan-revolut-2026-09.md. Status 2026-09-13 night (lead, on the builder's overnight mandate, decisions.md "2026-09-13 night"): the question is closed, site yes and description yes, video no; the candidate sentences below are kept as the record and are superseded by the applied texts (the description sentence in submission-text.md, "The problem" paragraph, and the three site cards in the order Revolut, IDScan.net, Coinbase). The builder confirms or reverts in the morning (open-questions.md, "Incident evidence").

- Revolut, 2026-09-11 (EU and UK neobank): handed a "limited number" of customers' passport or driving-licence copies, onboarding selfies, addresses, IBANs and full transaction histories including bitcoin to a fraudulent request sent from a mailbox inside a real government agency's email domain. Systems and funds untouched. The copies were in the file because anti-money-laundering law makes the bank keep them for five to six years. Lead with this one: EU banking, document next to on-chain activity, retention by duty.
- IDScan.net, 2026-09-01 (US ID-scanning vendor for rental counters, retailers, dispensaries): a dark-web service advertised scans of more than 153 million driver's licences; the company confirmed unauthorized access to customer accounts on its cloud; its cloud portal keeps records by default ("Do not delete"). Second entry: it proves the word "strangers".
- Candidate sentences of 2026-09-12 (each obeys product.md's honesty rules: no "hacked", no victim counts, no "153 million people", no KYC, no prevention claim, no Revolut as partner). Superseded 2026-09-13 night by the applied texts: the two site cards were replaced by the canonical card copy (Revolut card with the big line "11 Sep", what line ending "Its own notice says the law requires it to keep the document copy."; IDScan.net card with the big line "153 million" and the note that the count is the seller's), and the description sentence by "In the twelve days before this submission, a vendor's licence scans surfaced on a dark-web service and a bank handed customers' passport copies to a fraudulent request (IDScan.net, 2026-09-01; Revolut, 2026-09-11)." The verb "leaked" and "the two weeks" are withdrawn: the vendor's data surfaced on a dark-web service and the bank handed copies over; neither account says the copies leaked from a breach of the bank.
  - Site breach card: "Revolut, September 2026. Customers' passports, onboarding selfies, addresses and bitcoin transaction histories handed to a fraudulent request from a real government email domain. The bank was required to keep the copies."
  - Site breach card: "IDScan.net, September 2026. A dark-web service advertised scans of more than 153 million driver's licences from an ID-scanning vendor whose cloud keeps every record by default."
  - Description, after "keeps a copy": "In the two weeks before this submission, a scanning vendor's cloud and a bank's onboarding file both leaked exactly those copies (IDScan.net, 2026-09-01; Revolut, 2026-09-11)."
  - Spoken, optional, beat 1: "This week a bank mailed its customers' passports to a stranger." REJECTED 2026-09-13 night (lead): the video carries no citations and outlives the news cycle; "this week" is false the day after upload, and "mailed" and "stranger" are not the companies' words. The incidents stay on the site and in the description only.
- What may not be said: that Attestat would have prevented either incident. What may be said: on the browser route the issuer never receives a document image, so there is no image to retain by default or to hand over; a decision and predicate bits remain, and those are personal data too.
