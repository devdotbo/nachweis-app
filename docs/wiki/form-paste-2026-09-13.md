---
type: reference
title: Form paste 2026-09-13
updated: 2026-09-13
sources:
  - wiki/submission-text.md (fields as drafted 2026-09-13 night)
  - wiki/submission-checklist.md (limits, rules)
  - wiki/sponsors.md (prize tracks)
  - wiki/uniswap-feedback-form.md (form fields, fetched 2026-09-08)
  - wiki/product.md (Why now, demand gate)
  - nachweis-app/FEEDBACK.md, DISCLOSURE.md, docs/ai-attribution.md, README.md, docs/ui/README.md, docs/hosting-app-vercel.md (main 7ef18b2, read 2026-09-13 15:40)
---

# Form paste 2026-09-13

Paste-ready. Bracketed notes were removed. Live links as of 2026-09-13 15:35.

Each H3 is one form field with its limit in parentheses. The plain text under it is the paste. "Check:" gives the count measured with `wc -m` (characters) or `wc -w` (words). Lines starting with "Note:" are for the builder and are not pasted. Every hash and number is copied from the sources named above; nothing was measured anew.

## Project details

### Project name (no limit recorded)

Attestat

Check: 8 characters.

### Category (pick one)

Zero Knowledge

Check: decided by the builder 2026-09-13.

### Emoji (pick one)

Builder's choice; not recorded in the wiki.

### If you have a demonstration, link to it here! (URL)

https://attestat.dev

Note: the app is at https://app.attestat.dev, read-only against Sepolia as of 15:35 (hosting record: nachweis-app/docs/hosting-app-vercel.md). The form takes one URL; the description names both.

### Short description (max 100 characters)

Show your EU ID wallet once, prove age in zero knowledge, get approved on chain. No passport copy.

Check: 98 characters (`wc -m`, including spaces and full stops).

Alternatives (pick one, all counted):

Your government ID wallet unlocks on-chain finance without handing anyone a passport copy. (90)

Prove you qualify with the EU digital ID wallet; a zero-knowledge proof, one on-chain decision. (95)

The EU digital ID wallet, proven in zero knowledge, as a permission any contract can read. (90)

### Description (min 280 characters)

Exchanges, launchpads and funds keep your passport copy. Attestat lets a token issuer accept the EU digital identity wallet (EUDI) once and apply its approval to the customer's crypto wallet, with no document on chain.

Demo: an investor connects her crypto wallet; her address is not permitted. The official German EUDI test wallet answers: given name, family name, over 18. Her browser tab proves in zero knowledge that it says over 18; only the proof reaches the registry. The issuer approves separately. Door one: the fund token reads the record; she subscribes. Door two: a Uniswap v4 permissioned pool reads the same record; she buys, no second presentation. One revoke closes both doors.

On chain: one record per address and policy (predicate bits, expiry); no name, no document; the address may still be linked to a person.

Limits: test wallet, sample identity; sanctions and other checks simulated; revocation manual; Sepolia. https://attestat.dev, https://app.attestat.dev (read-only today).

Prior work: the builder's public verifier library Klartext-ID/klartext-verifier (pre-event) is used; the Noir circuit adapts eid-privacy's swiyu circuit; see DISCLOSURE.md. Repositories keep the former name Nachweis.

Check: 1,221 characters, 180 words (paste text only, measured with Python len() and split(); `wc -m` and `wc -w` on the same text give the same counts).

Note: cut to the builder's length limit (180 words) on 2026-09-13 afternoon. Dropped from the form version, kept in submission-text.md: the incident sentence (IDScan.net, Revolut), the zkPassport adapter sentence, the relay detail. The disclosure paragraph is the "prior work disclosure (Classic)" field of submission-text.md, shortened to one sentence; the ETHGlobal rules require the disclosure "in your submission (repo history, video, and description)" and the form has no separate field for it.

### How it's made (min 280 characters)

Contracts (Foundry): AttestationRegistry: one decision per address and policy; evidence and approval separate, isEligible needs both; proof verifiers pluggable per policy; FundToken and the Uniswap checker read it. Tests: forge 155 passed (20 fork skipped), 8 app, 19 automation, 5 Playwright.

Proved: a holder-bound SD-JWT presentation (the wallet's signed credential format) from the pinned issuer key says over 18; its nonce commits to the crypto wallet address.

Browser route: the verifier relays the wallet's encrypted answer unopened; the investor's tab decrypts and proves with Noir UltraHonk (noir_js, bb.js). Sepolia: prove about 11 s, attest about 4.58 million gas.

Fallback: SP1 zkVM, Groth16 wrap; the server proves and submits and saw the presentation; we say so.

Identity: OpenID4VP from the official German test wallet into the builder's public verifier library. Unchecked: x5c chain to a trust anchor, status list, challenge freshness (Noir route).

Uniswap v4: Uniswap's permissioned-pool contracts as deployed on Sepolia, plus the 41-line EudiAllowlistChecker.sol: swap and liquidity allowed iff registry.isEligible. The portal quotes from slot0; the quoter cannot quote a permissioned pool.

eIDAS 2 asks for zero-knowledge proofs in the wallet, none selected yet, so our side proves today; a wallet proof would need a verifier adapter, not built.

Check: 1,370 characters, 200 words (paste text only, same method).

Note: cut to 200 words on 2026-09-13 afternoon; the full drafted text with measurements, hashes and inline citations stays in submission-text.md. Test counts are the 2026-09-13 line of docs/ai-attribution.md (main ac19956: 155 passed, 20 skipped; 8; 19; 5 specs). "41-line" is lines 27 to 67 of contracts/src/uniswap/EudiAllowlistChecker.sol, counted with sed. The Privy paragraph is omitted (Privy not claimed).

### GitHub Repositories (URLs)

https://github.com/devdotbo/nachweis-app
https://github.com/devdotbo/nachweis-site

Note: nachweis-app holds code, evidence and the spec bundle (docs/wiki); nachweis-site the landing page. Both are being flipped public now; the Final page below checks it. The pre-existing verifier library https://github.com/Klartext-ID/klartext-verifier is named in the description's disclosure paragraph; add it here only if the field accepts a third URL and the form does not read it as event work.

## Images

Upload three, in this order (all in nachweis-app/docs/ui, taken by the Playwright stack on anvil, states described in docs/ui/README.md):

1. nachweis-app/docs/ui/investor-10-anvil-browser-proved.png (1280 x 3899): the investor portal after the proof was made in the tab by bb.js and attested; shows the proof-origin caption.
2. nachweis-app/docs/ui/investor-12-anvil-swap-confirmed.png (1280 x 4102): the Swap door after the purchase through the permissioned pool, receipt with hash and gas.
3. nachweis-app/docs/ui/investor-13-anvil-swap-refused.png (1280 x 4338): the same swap after the revoke, door closed, the decoded WrappedError in words.

Alternate for the issuer side: nachweis-app/docs/ui/issuer-03-approved.png (1360 x 2183). These are full-page captures; if the form crops to a landscape thumbnail, take fresh viewport-sized screenshots from the app at https://app.attestat.dev instead: investor portal, issuer console, the "what the chain sees" card. No screenshot of the Sepolia state exists in the repository; the docs/ui set is anvil or mock mode, which is fine for images but not to be labelled Sepolia.

## Tech stack

Solidity 0.8.28, Foundry, OpenZeppelin, Noir, UltraHonk (bb.js), noir_js, SP1 zkVM, Groth16, Rust, axum, alloy, TypeScript, Bun, Vite, React, wagmi, viem, Playwright, Uniswap v4 permissioned pools, Permit2, OpenID4VP, SD-JWT, EUDI wallet sandbox, WebCrypto, Mopro

Check: 25 entries, each verified against README.md, contracts/foundry.toml (solc 0.8.28), app/package.json (@aztec/bb.js 5.0.0-nightly.20260324, @noir-lang/noir_js 1.0.0-beta.21, react, vite, wagmi, viem), service/Cargo.toml (axum, alloy, sp1-sdk 6.1.0), circuits/README.md (nargo 1.0.0-beta.21), DISCLOSURE.md (OpenZeppelin, mopro-ffi, Permit2).

Note: Privy and the zkPassport SDK are in the repository as a local showcase and an undemonstrated adapter; both left out of the list because neither is claimed.

## Select prizes

Tick: Uniswap Foundation, "Best Uniswap Stack Contribution" (the open pool, 3,000 USD, up to three teams; the 2,000 USD pool is Continuity-only and does not apply to a Building from Scratch entry).

Do not tick: Privy (not claimed; no Privy-mode run on Sepolia exists), Chainlink (not built), any other partner.

Note: sponsors.md records that there is no separate permissioned-pools track; the permissioned pool is what we built, the prize is the stack-contribution pool. Qualification for it: public repository, FEEDBACK.md in the repository, the Uniswap Developer Feedback Form submitted with the FEEDBACK.md link (last section of this page), README pointing to the contract and lines (README.md, section Uniswap).

## Video

<YouTube or Loom link, 2 to 4 min, 720p, own voice>

Note: rules recorded in submission-checklist.md: between 2 and 4 minutes, not below 720p, no speedup, no synthetic voice. Not recorded as of 15:35.

## Future

Next: a conversation with an issuer that gates a token behind its own onboarding today; no operator has yet said which step Attestat would replace, so we claim no partner. Timing: member-state wallets by 2026-12-24, private relying parties in listed sectors from 2027-12-24. Engineering: a hosted relay and bridge, the trust-boundary gaps, wallet-side proofs once a ZK scheme is selected.

Check: 388 characters, 60 words. Sources: product.md "Why now" (both reasons), "What it is not", open-questions.md item (f), README.md "What neither proof checks".

## Final

- [ ] https://github.com/devdotbo/nachweis-app is public (open it in a private window); LICENSE Apache-2.0 present; docs/wiki bundle present.
- [ ] https://github.com/devdotbo/nachweis-site is public.
- [ ] Video link filled in the Video field; the file is 2 to 4 minutes, 720p or more, own voice.
- [ ] Live link https://attestat.dev answers over HTTPS; https://app.attestat.dev answers (read-only against Sepolia unless the hosted relay and bridge went live this afternoon; the description promises neither).
- [ ] Uniswap Developer Feedback Form submitted with https://github.com/devdotbo/nachweis-app/blob/main/FEEDBACK.md; confirmation page or email saved.
- [ ] ETHGlobal submission receipt saved (screenshot or confirmation email) with the submission time.
- [ ] Written pre-existing-work notice to ETHGlobal: sent, or the description's disclosure paragraph stands as the written disclosure; record date and channel.
- [ ] Submit before 18:00 Vienna (16:00 UTC).

## Uniswap feedback form

Form: https://developers.uniswap.org/hackathon-feedback (20 fields as fetched 2026-09-08; no dedicated link field, so the FEEDBACK.md link goes into fields 7 and 18). FEEDBACK.md itself gives no form order; the field order below is wiki/uniswap-feedback-form.md, with fields 7 and 9 brought up to the Sepolia broadcast that FEEDBACK.md records.

1. First name: builder.
2. Last name: builder.
3. Email: builder.
4. Telegram handle: builder.
5. Which hackathon did you participate in? ETHOnline 2026.
6. Did you complete a project during the hackathon? Yes.
7. What did you build? Paste:

Attestat (repository nachweis-app): an issuer-side EUDI identity integration for token issuers. The official German EUDI test wallet presents a sample identity to the issuer's verifier; a zero-knowledge proof of "over 18, PID signed by the pinned issuer key, bound to this address" is verified on chain and stored in an AttestationRegistry as a record per (address, policy) without names or documents. The Uniswap part: an IAllowlistChecker (contracts/src/uniswap/EudiAllowlistChecker.sol) that reads that registry, plugged into the published PermissionsAdapterFactory and PermissionedHooks on Sepolia; pool init through the six onboarding steps, a liquidity mint through the PermissionedPositionManager, a swap through the permissioned Universal Router from the web app (Permit2 approvals, V4_SWAP calldata, an off-chain quote because the deployed V4Quoter cannot quote a permissioned pool), then a refused swap after the issuer revokes, decoded on screen from the ERC-7751 WrappedError. Checker, adapter, pool and liquidity were deployed on Sepolia on 2026-09-10 (docs/deployments/sepolia-2026-09-10.md, not verified on Etherscan), and the journey with the official wallet, including the swap, the revoke and the refused swap, ran on Sepolia on 2026-09-12 (docs/evidence/sepolia-phone-2026-09-12.md); everything before that was a local Sepolia fork against the deployed Uniswap contracts. Developer feedback with 18 items: https://github.com/devdotbo/nachweis-app/blob/main/FEEDBACK.md

8. Are you building an AI-powered or agentic project? No (the product is not agentic; the code was written with AI coding agents, documented in docs/ai-attribution.md).
9. Were you able to successfully integrate Uniswap into your project? Yes, on Sepolia (deployed 2026-09-10, swap and refused swap 2026-09-12).
10. How long did it take to get your first successful integration working? Builder's bucket; the checker, factory tests and fork onboarding were merged on 2026-09-07 (commit dcf4f12), the mint and swap on the fork the same day (a190ac3). Do not overstate speed if the buckets are coarse.
11. What was the biggest blocker you faced? Paste:

The guide pins v4-periphery commit 3245c3c for forge install, but the contracts deployed on Sepolia are main (dce236d), verified by bytecode comparison; PermissionsAdapter at the pinned commit lacks updateAllowedHook, which step 5 of the guide calls. Second: the production PermissionedHooks source is not in v4-periphery (only the mock), and deployments.json points to v4-hooks-public, which does not contain it. Items 1, 2 and 14 in FEEDBACK.md.

12. If applicable: what was the hardest part of building an agentic app on Uniswap? Not applicable.
13. How helpful was the Uniswap documentation for your use case? Builder's rating; FEEDBACK.md supports a 3 or 4 (deploy and provide-liquidity pages exact; swap without the Trading API and the dynamic-allowlist case missing, items 3, 12, 16).
14. How would you rate the support Uniswap provided overall? Builder's rating; no support channel was used during the build (unverified), so the neutral option is consistent.
15. Do you plan to continue building the project you started at this hackathon? Builder's answer; the wiki records a business gate after 2026-09-13 with no named operator yet.
16. What type of support did you use? Documentation; GitHub repositories (v4-periphery, v4-core, universal-router, permit2); deployments.json.
17. What support was missing, or could have been better? Paste:

A "swap through a permissioned pool without the Trading API" code block (Permit2 approvals, V4_SWAP encoding with the six-field ExactInputSingleParams, the permissioned router address); a sizing paragraph on the provide-liquidity page (StateView.getSlot0, LiquidityAmounts, rounding margin); a "deployed from" commit in deployments.json records; the production hook source or a pointer to it; a note in step 3 for tokens whose transfer gate is a dynamic on-chain predicate rather than a static allowlist; a quoter for the permissioned set that passes the hook's msgSender() check, or a note that quotes on permissioned pools go through the Trading API only (item 18).

18. Any additional feedback? Paste:

Full write-up with 18 items and the evidence status: https://github.com/devdotbo/nachweis-app/blob/main/FEEDBACK.md. Things that worked well: the checker interface is the right size (one function, one bytes2, ERC-165); steps 1 to 6 are permissionless on Sepolia; deployments.json reproduces the deployed factory bytecode from main; ERC-7751 WrappedError names the hook and selector on a refused swap.

19. Can we follow up with you about your feedback? Builder's choice.
20. Terms of Service and Privacy Policy agreement: builder.

Before sending: the repository is public and the FEEDBACK.md link opens without login; keep the confirmation.
