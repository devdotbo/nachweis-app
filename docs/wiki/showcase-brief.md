---
type: plan
title: Showcase brief (toolkit pitch, one landing page and one demo per case)
updated: 2026-09-09
sources:
  - builder message 2026-09-09 night ("build all of the cases", "a landing page that is also a pitch", "gallery with all the functions, demos and use cases", "our main product is the toolkit that plugs into the EUDI (optional zkPassport) and those other systems and has ZK")
  - /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/ (five cases, evaluation)
  - /Users/bioharz/git/ethglobal/nachweis/wiki/product.md, pitch.md
---

# Showcase brief

## The reframed pitch (builder, 2026-09-09 night, FACT as a decision)

Attestat is the toolkit: it plugs into the EUDI wallet (and optionally zkPassport, and other national identity systems where compatible, see wiki/identity-standards.md when it exists), proves the statement in zero knowledge, writes one eligibility decision on chain, and lets any consumer read it: a fund token, a Uniswap permissioned pool, a payout contract, a Privy policy. The five Privy business cases, the Uniswap pool and the EUDI investor flow are the showcase: "look, this is what people build with Attestat". Each case gets a working demo and a landing page that is also its pitch. A gallery page lists every function, demo and use case.

The product sentence stays (product.md). The showcase adds: "Attestat is the toolkit; these are demos built on it." Never claim a demo is a live product or that a named company uses it.

## Landing page rules (nachweis-site)

- Site repository: /Users/bioharz/git/ethglobal/nachweis-site (main 3727280). The current page is index.html with style.css, app.js, fonts/. Read it first; the case page must be as impressive as the current page or better and must feel like the same family (same fonts, same colour system, same tone), not a template.
- Load the frontend-design skill (Skill tool, name frontend-design:frontend-design) before designing. No emojis, no stock illustrations, no dashes as clause separators in copy.
- Location: /Users/bioharz/git/ethglobal/nachweis-site/showcase/<slug>/index.html with its own CSS inline or in showcase/<slug>/style.css; shared assets from ../../fonts and ../../style.css may be reused. Relative links only. Must render from a plain static server (bunx serve or python3 -m http.server) with no build step.
- Content order: hero with the case sentence in plain words and one visual of the flow; who buys and who uses; "otherwise not possible" in three sentences with the source named; how it works (EUDI presentation, ZK proof, on-chain decision, the Privy part, the refusal or revoke beat) as a diagram or stepper drawn in HTML and CSS or inline SVG; what the chain sees (the Decision struct, no name); the demo (a link to the demo route and a captioned screenshot placeholder if no screenshot exists yet); the honesty box (official test wallet, sample identity; where the proof is made; simulated checks; manual revocation; "no identity documents on chain, and nothing we could use to find her"); footer linking to the gallery (../index.html) and the main page (../../index.html).
- Every sentence obeys product.md's honesty rules. Sponsors named only where integrated (Privy, Uniswap). No "first", no "only", no yield figures, no "KYC".
- Do not commit; the lead commits. Do not edit index.html at the site root or any other case's directory.

## Demo rules (nachweis-app)

- Each demo is a route in the product app under /showcase/<slug>, with its code in app/src/showcase/<slug>/ and one line added to app/src/showcase/registry.ts (title, slug, one sentence, the component). Contracts specific to a case live in contracts/src/showcase/<Slug>.sol with tests; services in showcase/<slug>/ at the repository root (bun TypeScript, @privy-io/node when a server wallet is needed). The Privy provider wiring and the automation service pattern from WP32 are reused, never duplicated.
- Every demo runs locally on anvil in a dev or local mode without a Privy app (evidence class L) with a script scripts/showcase-<slug>-local.sh that prints SHOWCASE-<SLUG>-LOCAL PASS, and has a privy mode for Sepolia that the builder clicks by hand. Same env-file rules as WP32: secrets only in .env files that are gitignored, never in chat.
- Existing suites stay green: app typecheck and build, app-e2e sp1-mock, forge, cargo.
- Each demo ships docs/showcase/<slug>.md: what it shows, how to run, the Privy features used with file and line references, the evidence template.

## Return format for every showcase teammate

Under 400 words: what was built, paths, how to run and what it prints, test counts, the on-screen sentences touching identity or custody verbatim, what is left.
