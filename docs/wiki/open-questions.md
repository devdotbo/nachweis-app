---
type: question
title: Open questions
updated: 2026-09-09
---

# Open questions

Unanswered as of 2026-09-09. Each: who can answer, by when it matters, and the wording used until then. Closed items are kept for one revision with the closing date.

## Jury questions, carried (positions.md and turns 10 to 11)

(a) Name plus age is not a unique identifier. How does the issuer match the investor to its onboarding record? Owner: builder and lead. Updated 2026-09-08 by the review: the bridge returns public values without names, so the issuer card must not describe a hidden name match; WP16 makes the issuer approve an explicitly established demo customer record. Until then: the README says a production issuer would match on a customer identifier established at onboarding or on more disclosed claims.

(b) The address binding is signed by the investor's EVM key, not by the EUDI wallet. Owner: lead; wording. Until then: caption "signed by the crypto wallet, not by the ID wallet"; the nonce ties the presentation to the address through sha256(address || challenge) inside the KB-JWT.

(c) Privy eligibility for the open tracks. Not yet asked as of 2026-09-09 (correction 2026-09-09: this page said "asked 2026-09-01"; the builder states the question was never sent). Owner: builder, by sending the notice in wiki/track-decision.md (it asks the track question and the Privy and Uniswap open-track question in one message); also in the check-in 2 text. Until then: Privy not built (spec in wiki/spec-privy.md); any EVM wallet for the binding.

(g) Track, new 2026-09-09: Classic with the verifier disclosed as the builder's own public open-source library, or Continuity "Extend Open Source"? Owner: builder, after ETHGlobal answers the same notice. Matters before the submission form. Until then: the submission text keeps both wordings ready; nothing public says "Continuity" as decided.

(d) Does a Uniswap checker deployment on the published factory count as "Stack Contribution"? The brief says "Build on or integrate any part of the Uniswap stack ... This also includes new v4 hooks, extensions or improvements to official Uniswap repositories, and tooling" (FACT, prize page fetched 2026-09-08). OPINION: a checker plus a pool on the published permissioned factory is an integration of the v4 stack and qualifies on the wording. Not confirmed by Uniswap; owner: builder via the feedback form or Discord. Until then: the README names the exact interface and lines.

(e) "We hold no data" versus names going to the issuer. Owner: lead, wording. Updated 2026-09-08: WP17 defines per route who sees what; the sentence on camera must match that contract.

(f) No named operator has said which step this replaces. Business gate, after 2026-09-13. Owner: builder. Until then: no partner claims.

## Submission questions (new 2026-09-08)

- Was the check-in of 2026-09-08 05:59 Vienna submitted? Unverified. Owner: builder. Matters now: the log needs the date and the 2026-09-11 draft builds on it.
- Was the written pre-existing-work notice sent to ETHGlobal? Not as of 2026-09-09 (builder). Updated 2026-09-12 (builder, chat): asked who gave the Classic "ok" and on which channel, the builder answered "just be ok with that"; recorded as the builder's decision to proceed on the builder's own statement, no written notice drafted or sent by agents (decisions.md "2026-09-12"). OPINION (lead): the general rules ask for written disclosure; the DISCLOSURE.md in the public repo is the disclosure the submission carries. Owner: builder. Matters before the deadline; the rules require it in writing. Text: the 196-word notice at the bottom of wiki/track-decision.md (supersedes "DISCLOSURE.md sections 1 and 2" as the text to send; DISCLOSURE.md stays the full record).
- How are the spec-driven artifacts published: the wiki repository devdotbo/nachweis made public, or a copy under nachweis-app/docs? Owner: builder. Matters before the deadline. Until decided, docs/ai-attribution.md names the wiki repository and its read order.
- Are the agent session transcripts published? They are on the builder's Mac, not in a repository. Owner: builder. OPINION: not required by the wording ("spec files, prompts, and planning artifacts"); the handoff pages are the prompts.
- Relay branch publication: the patch series in nachweis-app/vendor/verifier-relay-patches (2026-09-08) gives a public source once nachweis-app is public. Whether to also push branch nachweis-relay to Klartext-ID/klartext-verifier is the builder's call; not required for the submission.
- Repository visibility: nachweis-app is PRIVATE (FACT, gh repo view 2026-09-08). Owner: builder, before the deadline and before the Uniswap form (the form needs the public FEEDBACK.md URL).
- Submission title and form text say Attestat; the repository stays nachweis-app (decision 2026-09-08). GitHub organisation "attestat": no visible profile on 2026-09-08 (handoff); claiming it is optional.

## Narrative questions (new 2026-09-08)

- Whether the official German test wallet can produce a ZK proof today: unverified, no source either way (narrative-zk.md). Until then: "the wallet presents an ordinary selective-disclosure SD-JWT".
- The ARF ZKP refinement window (2026-09-23 to 2026-11-18 in the product-pitch-legal memo): unverified. Until then: "no scheme selected as of ARF v3.0.0; wallet-side support expected after launch".

## Build questions

- G0 (WP0): passed 2026-09-08 (FACT, nachweis-app/docs/evidence/g0-2026-09-08.md), and the same wallet ran the full journey on Sepolia on 2026-09-12 (FACT, nachweis-app/docs/evidence/sepolia-phone-2026-09-12.md). Before the G0 run the registered minimal request had never completed end to end from the official wallet to this verifier. The gates that only the run could answer (see the G0 record for what it observed): does the iOS wallet present the nested age claim (birthdate fallback decided but not implemented across the request and proof path, FACT per the review), does it encrypt the response to a client-supplied key in client_metadata.jwks, what aud string it sends, the real age object shape and vct literal, the sandbox issuer key hash. WP18 writes the runbook; the decision point follows the run.
- If the client-key round trip fails: the documented SP1 fallback with the server plaintext boundary stated (handoff 2026-09-08).
- Sepolia deployment: needs the builder's funded deployer key in a local signer; the lead deploys under the builder's authorization after WP16 and WP17 merge. No key in chat.
- Hosting for attestat.dev: DNS is on Porkbun nameservers, no HTTPS service answered on 2026-09-08. Owner: builder (hosting choice), WP20 prepares the copy and the redirect instructions.
- Physical-device proving (Pixel, iPhone): optional after the main route passes (decision 2026-09-08). No Pixel is available.
- Browser bb.js proving: unverified; not on the critical path.
- WP4 attribution: whether the GPT agent "Astra" contributed code to the circuit adaptation is unverified from git (one author identity). Owner: builder's recollection; matters for docs/ai-attribution.md accuracy.

## Closed since 2026-09-07

- Domain: closed 2026-09-07 and 2026-09-08, four Attestat domains registered at Porkbun (name-and-domains.md). No nachweis.dev purchase.
- Verifier endpoints for bridge mode: closed 2026-09-07 by WP3c (the review found the result handler returns names by default; that is WP17, not a missing endpoint).
- Mobile not built: closed 2026-09-07 by WP5-android (emulator) and WP12 (simulator); physical devices remain optional.
- SP1 adapter and gas: closed 2026-09-07 by WP2b; the live transaction belongs to the Sepolia deployment.
- Path of klartext-verifier: closed 2026-09-08. It is the GitHub repository of the verifier workspace (Klartext-ID/klartext-verifier, FACT git remote -v in klartext-verifier (local checkout)); no separate front-end checkout exists on the Mac.
- Site corrections: Chainlink chip and "first" claim removed 2026-09-07. Privy stays in the footer pending (c). Name rename in copy runs under WP20.
- Android proving time: emulator measured 2026-09-07 (6.7 to 6.9 s); device measurement dropped from the main path (decision 2026-09-08).
