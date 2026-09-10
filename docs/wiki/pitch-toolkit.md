---
type: reference
title: Pitch, toolkit framing (gallery and main page)
updated: 2026-09-09
sources:
  - wiki/showcase-brief.md (the reframed pitch, builder decision 2026-09-09 night)
  - wiki/product.md and pitch.md (product sentence, spoken line, honesty rules)
  - wiki/architecture.md (Decision struct, proof interface, consumers)
  - wiki/work-packages.md (evidence states per package, read 2026-09-09)
  - wiki/zkpassport.md (second route, candidate sentences)
  - wiki/identity-standards.md (17 systems, verdicts, the "Sentences we may use" section quoted verbatim in the evidence lane and the "beyond the EU" row)
  - wiki/privy-cases/README.md and evaluation.md section 1 (the five cases, tracks)
  - nachweis-site/showcase/index.html and index.html (the pages themselves, written 2026-09-09)
---

# Pitch, toolkit framing

The main page keeps its product pitch (the passport question, the wallet, the walkthrough, two doors, the honesty strip, where the proof lives, why now). Two things were added on 2026-09-09: the line that Attestat is the toolkit and the showcase shows what is built on it, and a gallery page at /showcase/ with a system map, the demos, the use cases and its own honesty strip. Pages: nachweis-site/index.html and nachweis-site/showcase/index.html (committed to nachweis-site main (a4dda6f, b5b273d) as of this page; the lead commits).

## The lines on the pages, verbatim

Main page hero, under the spoken line (new paragraph, class `toolkit`):

Attestat is the toolkit: the wallet plugs in, the proof is made, one decision lands on chain, and any door can read it. The showcase shows what is built on it: a fund token, a Uniswap pool, a standing order, a compliance desk, a payout desk.

Main page, teaser section "Showcase" (h2 "What people build with it."), body:

Attestat is the toolkit. Attestat helps token issuers accept EUDI identity evidence and apply their approval to customers' linked crypto wallets, without putting identity documents on chain. These are demos built on it, not live products.

Gallery hero (h1 "What people build with Attestat."), lede:

Attestat is the toolkit. It plugs into the EUDI wallet, optionally into zkPassport, and into other national identity systems where they are compatible. It proves the statement in zero knowledge, writes one eligibility decision on chain, and lets any consumer read that decision: a fund token, a Uniswap permissioned pool, a payout contract, a Privy policy.

Gallery hero, framing line under the lede:

The pages below are demos built on the toolkit. None of them is a live product, and no named company uses one.

Gallery, system map intro (h2 "One decision in the middle."):

Evidence comes in from the left. A proof turns it into predicate bits. The issuer approves. The decision sits on chain, and everything to the right only reads it. Everything below can close it.

Gallery, use-case table close: the product sentence from product.md, unchanged.

Unchanged on the main page: h1, sub-line, spoken line, the walkthrough and its disclaimer, the honesty strip, the proof section, the "not" list, the sponsor chips. The hero gained a third button "See the showcase" and the top bar a "Showcase" link.

## Gallery structure (/showcase/index.html)

1. Hero: eyebrow, h1, lede, framing line, two buttons (See the demos, How the pieces fit).
2. System map, five lanes drawn in CSS grid with connectors, one reveal animation outward from the decision:
   - Evidence in: EUDI wallet (OpenID4VP, SD-JWT PID, official test wallet with a sample identity), passport chip via zkPassport (not eIDAS evidence, stated), Swiss e-ID swiyu (supported now for the Beta-ID stack with one adapter change, no vector run yet), other national systems (mDLs in Apple and Google Wallet, Taiwan, GOV.UK, and the list of systems that hand out no verifiable credential). The swiyu and other-systems texts are verbatim sentences from the section "Sentences we may use" of wiki/identity-standards.md (2026-09-09); the page itself is not linked from the public site because the wiki is private.
   - Proof: browser tab (prove 11.0 to 11.3 s, click to attested 42.8 s with the official wallet, M3 Max, Chrome 152), laptop companion (bb prove 3.96 s warm, attested in 8.2 s, M3 Max), phone provers (Android emulator 6.7 s, Chromebook Android container 47 to 49 s, iPhone 16 Pro Max simulator 5.2 s, no physical phone), server route SP1 (Groth16 about 270 s native, about 280k gas on a Sepolia fork, boundary sentence on screen). All numbers FACT from work-packages.md rows WP5, WP5-android, WP12, WP26, WP28, WP30, WP2b, WP9b.
   - The decision: the Decision struct from IEligibility.sol, plus written by (attestWithProof or attestByOperator), counts only with the issuer's approve, read by isEligible, closed by expiry or one revoke.
   - Consumers: fund token transfer check, Uniswap v4 permissioned pool checker, GatedPayout (payout desk, in progress), Privy policies mirrored from the decision (standing order).
   - Controls: issuer approve and revoke (manual, captioned), Privy signers and policies, key quorums (2-of-2 in the back office case).
   - Legend: green means green locally per the evidence table; in progress; pending.
3. Demos, eight cards, each with preview image or drawn placeholder, an evidence badge, one sentence, the prize track, links (landing page, demo route in the app, repository, runbook where one exists). States as written on 2026-09-09 (FACT, work-packages.md and log.md):
   - EUDI investor flow: green locally with the official wallet (WP30); hand-clicked Sepolia pending. Track: Best Uniswap Stack Contribution (the pool is the second door). Preview: a crop of nachweis-app docs/ui/investor-10-anvil-browser-proved.png copied to showcase/assets/eudi-investor-flow.png.
   - Uniswap permissioned pool swap: scripts green on a local Sepolia fork (WP7b); in-app door in progress (WP35); Sepolia broadcast pending. Track: Best Uniswap Stack Contribution. Drawn placeholder.
   - Standing order: green locally (STANDING-ORDER-LOCAL PASS, WP32, not yet merged); hand-clicked Sepolia pending. Tracks: Best B2B financial product, also Best financial flow.
   - Savings plan and investor money: landing page done; demo pending until the WP32 wiring lands on main (WP38).
   - Back office and payout desk: landing page done; demo in progress (WP38 branches wp38-backoffice, wp38-payout-desk).
   - zkPassport route: mock passport green on anvil; phone run pending; builder decides on 2026-09-10 whether it stays (WP33). No prize track. Card text is candidate sentence 1 from zkpassport.md, shortened; "The issuer still approves" added.
4. Use cases: one table, columns who buys, what becomes possible, demo. Eight rows (fund issuer, the same issuer for recurring inflow, compliance desk, issuer with wallet-less investors, company paying contractors, second issuer or pool operator, issuer with investors outside the EU wallet's reach, and "beyond the EU" with the swiyu, Taiwan, mDL and "no demo used a live national wallet" sentences verbatim from identity-standards.md). Closes with the product sentence.
5. Honesty strip, seven cells: official test wallet; where the proof is made (browser tab or companion; server route saw the presentation; zkPassport third-party app on the phone); simulated; manual revocation; Sepolia by hand; on chain (the verbatim "nothing we could use to find her" sentence plus the personal-data caveat); demos, not products.
6. Footer: main page, code and runbook, "no document on chain".

Files: showcase/index.html, showcase/gallery.css, showcase/gallery.js (one IntersectionObserver for the map), showcase/links.js, showcase/assets/eudi-investor-flow.png, showcase/preview.png (1440 by 900 viewport shot).

## The app origin, one place

The demo routes (/, /issuer, /showcase/<slug>) live in the product app (nachweis-app/app), not on the static site. nachweis-site/showcase/links.js holds `DEFAULT_ORIGIN = "http://localhost:5173"`. Every demo link on the showcase pages carries `data-app-path="/route"`; links.js writes the href from the origin, sets a title, and while the origin is the local default appends a small note "runs locally: http://localhost:5173/route" after each button link (inline text links carry `data-app-note="inline"` and get no note; `data-app-note-off` suppresses it on one link). A page can override the origin with `<html data-app-origin="https://...">`. To point every page at a hosted app: change the constant in links.js. The five case pages were edited minimally: the demo hrefs (two per page, plus one inline link in standing-order) and one `<script src="../links.js">` line before the page's own script.

## Open items

- App host: none. The app is not deployed (WP8 "deployed URL" pending, hosting is the builder's). Until then every demo link says "runs locally". When a host exists, change DEFAULT_ORIGIN in links.js and remove nothing else.
- Screenshots: the Uniswap swap card and the zkPassport card have drawn placeholders (no in-app swap door yet, no phone run). The five case landing pages each carry a screenshot placeholder for the Sepolia run. The EUDI card uses a mock-mode app screenshot from docs/ui, not the official-wallet run (that run's screen recording is private evidence).
- Identity standards: the map's evidence nodes and the "beyond the EU" table row quote identity-standards.md; if that research is published (a docs page in nachweis-app or a site page), link it from the "Other national systems" node.
- Badges are hand-written from the wiki on 2026-09-09; they do not update themselves. Whoever records a Sepolia run or merges WP38 must edit the card badge and the map node.
- Prize track names on the cards are the sponsor page names (Best Uniswap Stack Contribution; Best B2B financial product; Best financial flow). Privy eligibility is still an open question (open-questions.md (c)); the cards state the track addressed, not eligibility.
- The main page now has three hero buttons; if that is one too many for the video's first frame, drop "See the showcase" (the toolkit paragraph already links to the gallery).
