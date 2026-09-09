---
type: reference
title: Pitch
updated: 2026-09-08
sources:
  - /Users/bioharz/git/ethglobal/nachweis/raw/build-plan.md (beats)
  - /Users/bioharz/git/ethglobal/nachweis/raw/front-door-brief-2026-09-02.md (front-door rules)
  - /Users/bioharz/git/ethglobal/nachweis-site/index.html (landing copy, read 2026-09-07, renamed to Attestat 2026-09-08)
---

# Pitch

## The lines

- Spoken opening, first line of the video: "Your ID wallet should work where you invest."
- Hero question on the landing page (h1, /Users/bioharz/git/ethglobal/nachweis-site/index.html): "How many strangers keep a copy of your passport?"
- Sub-line on the site: "Every exchange, launchpad and fund asks for your ID and keeps it. Attestat lets the state ID wallet on your phone do that job once, and puts only the issuer's decision on chain."
- Closing card: "Attestat helps token issuers accept EUDI identity evidence and apply their approval to customers' linked crypto wallets, without putting identity documents on chain." Below it: "no document on chain".
- Sentence a judge should repeat with the tab closed: a state test wallet showed three fields to a fund issuer, the issuer approved, the approval became a few bits on chain that a fund token and a Uniswap pool both read, and one revoke closed both.

## The seven beats (from build-plan.md, adjusted to the proof routes)

Under three minutes of content inside a 2 to 4 minute video. Voice is the builder. Screen is the live app, the phone, the explorer. No terminal first. One screen per beat.

1. The investor. A labelled investor whose onboarding with a demo fund issuer is complete opens the fund app from her own wallet. The address is not yet permitted. Caption: "identity evidence required".
2. The wallet. QR. The official test wallet presents the registered request: given name, family name, over 18. She taps once. Captions: "official test wallet, sample identity" and "names go to the issuer, not to the chain".
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
