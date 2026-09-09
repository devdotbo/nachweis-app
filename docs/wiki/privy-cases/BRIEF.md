---
type: plan
title: Privy business-case brief (shared instructions for the case teammates)
updated: 2026-09-09
sources:
  - builder message 2026-09-09 night (Privy prize text pasted, decision that Attestat is a new project, request for business cases)
  - /Users/bioharz/git/ethglobal/nachweis/wiki/handoff-fable-2026-09-09.md
  - /Users/bioharz/git/ethglobal/nachweis/wiki/spec-privy.md
  - /Users/bioharz/git/ethglobal/nachweis/wiki/product.md
---

# Privy business-case brief

## Why this exists

The builder decided (2026-09-09 night, FACT): Attestat is a new project, not a Continuity entry; the Privy open tracks are in scope. The Uniswap pool alone is not enough as a demonstration. We want a business case, built with Privy, that shows something that is otherwise not possible: a product that exists only because a customer can bring EUDI identity evidence to a crypto wallet without the business ever holding an identity document, and Attestat carries the decision on chain.

Five teammates each write one unique case in their own directory under /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/<slug>/. An evaluator then scores all five, the best one is built this week, the others stay as documentation.

## What exists today (FACT, read the handoff for detail)

- Monorepo /Users/bioharz/git/ethglobal/nachweis-app (main 5f5ceb9): contracts (AttestationRegistry with evidence plus approval, FundToken, Subscription, Uniswap v4 permissioned pool checker, NoirPidVerifier, Sp1PidVerifier), service (Rust bridge), app (React 19, wagmi 2, viem 2, Vite; two screens: investor and issuer), circuits (Noir pid-sdjwt), companion (bun), prover-sp1, prover-android and prover-ios, scripts.
- Flow that is green with the official German EUDI test wallet on the iPhone: wallet answers the web app's relay request, the browser tab decrypts and proves (11 s), the bridge submits attestWithProof, the issuer approves, Subscribe mints 100 NDF, swap in the permissioned pool, revoke closes both doors. All on anvil; nothing is deployed on Sepolia yet (the builder holds the key; deployment is planned).
- No Privy dependency exists. No Privy dashboard account or app id exists on this machine (checked 2026-09-09 night). Any live Privy call needs the builder to create a Privy app in the morning; design so that everything else works without it and the Privy-dependent path is wired and switchable by one env var.
- Decision on chain: struct Decision {policyId, bits, tier, expiry, statusRef, revoked} per (subject, policyId); isEligible(subject, policyId, requiredBits) requires evidence plus approval, not revoked, not expired. Bits: 1 identity evidence, 2 over 18.

## Privy prize text (FACT, pasted by the builder 2026-09-09, matches the fetched page of 2026-09-09)

Best B2B financial product, 2,500 USD: "Build a product that helps businesses manage digital assets and financial operations with Privy. Projects might include treasury platforms, business accounts, payroll systems, spend management tools, payment operations, or shared organization wallets. Strong submissions will use Privy to create secure business workflows with features such as organization wallets, policies, team permissions, quorum approvals, intents, automated transactions, or event-driven operations." Requirements: integrate Privy as a core part; create or use at least one Privy wallet; demonstrate a business or organization use case; implement at least one functional B2B workflow (payment, approval, treasury operation, or wallet administration flow); use at least one Privy control (policies, signers, key quorums, or intents); working demo and source; clearly explain how Privy enables the product.

Best financial flow, 2,500 USD: "Build a seamless experience for funding, moving, trading, growing, or spending digital assets with Privy." Requirements: integrate Privy as a core part; create or use at least one Privy wallet; complete at least one functional financial flow using a generally available Privy feature (transfers, bridging, stablecoin conversions, swaps, self-service Earn vaults, onramps, or other supported wallet actions); working demo and source; clearly explain how Privy improves the user experience. Features requiring commercial or guided onboarding may be mocked but do not count as the required functional integration. Privy Cards require guided onboarding: a mocked card experience is allowed but another live Privy flow is required.

## The bar for a case

The case must answer, with evidence, "what becomes possible that is otherwise not possible". Not "nicer", not "cheaper": a workflow that a business cannot run today because it would have to collect and store identity documents, or cannot trust a wallet address, or cannot express a policy over identity without holding identity. EUDI evidence plus the on-chain decision is the enabling fact; Privy is the wallet, control and money-movement layer that makes the business workflow run.

Research is required, not optional. Use WebFetch and WebSearch on docs.privy.io (policies, signers, key quorums, intents, server wallets, session signers, embedded wallets, funding, transfers, swaps, Earn, webhooks, automated transactions, testnet support, pricing and self-serve limits), the Privy GitHub organisation (`gh` CLI, recipes and examples), and the EUDI or eIDAS material already in the wiki (/Users/bioharz/git/ethglobal/nachweis/wiki/narrative-zk.md, product.md, open-questions.md). For every Privy feature you rely on, record: is it generally available, self-serve in the dashboard, working on Sepolia or another testnet, which SDK and version, and the URL fetched with today's date. Mark anything you could not confirm as unverified. Never guess a feature into existence.

Read the repository code you rely on (paths and line numbers), via an opus subagent for inventories and greps; read ranges yourself only where the design depends on them.

## Page template (write exactly these sections, in this order)

Front matter as in every wiki page (type: plan, title, updated, sources with fetch dates). Then:

1. Sentence. One sentence in the form "<Business> can <do X> for <whom> because <EUDI fact>, with Privy providing <wallet, control or flow>."
2. Who buys and who uses. Buyer, user, the money that moves, why the buyer pays.
3. Otherwise not possible. The concrete reason this workflow does not exist today without EUDI evidence on a wallet, with a source (a regulation article, a product doc, a memo in raw/). Label FACT, CLAIM or OPINION.
4. Privy as core. Which Privy wallet type, which control or flow, why it is core and not decoration. Map each prize requirement line (both tracks) to a concrete artifact in the case; say which track is the primary target and whether the second is also met.
5. The flow, step by step, as it would appear in the demo video (who clicks what, what appears on screen, which chain transaction). Include the EUDI presentation, the proof, the on-chain decision, the Privy part, and a revoke or refusal beat.
6. What changes in the code. Files to add or change under nachweis-app (app/, service/, contracts/, scripts/), new dependencies with versions, env vars, what stays unchanged. Contracts changes only if unavoidable; say why.
7. Evidence plan. What can be green by 2026-09-12 with evidence class L (local), and what needs the builder's Privy app id or Sepolia. Acceptance tests, numbered, each with a pass condition.
8. Honesty check. Go through product.md's rules and state every on-screen sentence that touches identity, custody or Privy. Propose the verbatim on-screen sentence about Privy.
9. Size and review burden. Small, medium, large or XL. Number of files, decision points needing human judgment, risks, kill criteria.
10. Unverified. Everything you did not confirm.
11. Rejected variants. Two or three alternatives you considered inside your lens and why this one wins.

Keep the page under about 2,500 words. Put research notes (fetched facts with URLs and dates, quotes) in a second file research.md in your directory so the case page stays readable.

## Rules

- Wiki conventions: /Users/bioharz/git/ethglobal/nachweis/AGENTS.md (FACT, CLAIM, OPINION, COUNT labels; absolute paths; dated sources). English. No dashes as clause separators. No emojis.
- Do not write into any other wiki page and do not touch nachweis-app. The lead merges and logs.
- Do not send anything to ETHGlobal, Privy, or any external party. Do not create accounts.
- Quota: one bounded task, then return. Spawn opus subagents for inventories and greps; keep your own context small.
- Return format to the lead (under 400 words): the sentence, the primary track, size, the top risk, the one Privy feature the case stands on and whether it is confirmed GA and self-serve on a testnet, and the absolute path of your case page.
