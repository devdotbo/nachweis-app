---
type: reference
title: Uniswap Developer Feedback Form, paste-ready answers
updated: 2026-09-09
sources:
  - https://developers.uniswap.org/hackathon-feedback (fields fetched 2026-09-08)
  - https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation (requirement fetched 2026-09-08)
  - /Users/bioharz/git/ethglobal/nachweis-app/FEEDBACK.md (main 46d8349, read 2026-09-09; 18 items since the swap door of 2026-09-09)
---

# Uniswap Developer Feedback Form

The prize page requires "completion of the Uniswap Developer Feedback Form ... that includes the FEEDBACK.md link" (FACT, fetched 2026-09-08). The form has no dedicated link field (FACT, fields fetched 2026-09-08, listed below), so the link goes into "What did you build?" and again into "Any additional feedback?".

Public URL of FEEDBACK.md once the repository is public: https://github.com/devdotbo/nachweis-app/blob/main/FEEDBACK.md. The repository is PRIVATE as of 2026-09-09 (FACT, gh repo view by the submission audit, review-fable-2026-09-09.md); the builder flips it before submitting the form, otherwise the link is dead for the reviewer. Submit after the Sepolia broadcast if it happens before the deadline, so the TODO lines in FEEDBACK.md are filled; otherwise submit with the fork evidence as labelled.

Builder-only fields (personal data, not written here): first name, last name, email, Telegram handle, terms checkbox.

## Answers per field

1. First name: builder.
2. Last name: builder.
3. Email: builder.
4. Telegram handle: builder.
5. Which hackathon did you participate in? ETHOnline 2026.
6. Did you complete a project during the hackathon? Yes (answer after the submission is in; if the form is sent earlier, the honest answer is the option closest to "in progress").
7. What did you build? Paste:

Attestat (repository nachweis-app): an issuer-side EUDI identity integration for token issuers. The official German EUDI test wallet presents a sample identity to the issuer's verifier; a zero-knowledge proof of "over 18, PID signed by the pinned issuer key, bound to this address" is verified on chain and stored in an AttestationRegistry as a record per (address, policy) without names or documents. The Uniswap part: an IAllowlistChecker (contracts/src/uniswap/EudiAllowlistChecker.sol) that reads that registry, plugged into the published PermissionsAdapterFactory and PermissionedHooks on Sepolia; pool init through the six onboarding steps, a liquidity mint through the PermissionedPositionManager, a swap through the permissioned Universal Router from the web app (Permit2 approvals, V4_SWAP calldata, an off-chain quote because the deployed V4Quoter cannot quote a permissioned pool), then a refused swap after the issuer revokes, decoded on screen from the ERC-7751 WrappedError. Evidence so far is a local Sepolia fork against the deployed Uniswap contracts (fork tests, scripts and a Playwright browser run); the broadcast status is stated in the file. Developer feedback with 18 items: https://github.com/devdotbo/nachweis-app/blob/main/FEEDBACK.md

8. Are you building an AI-powered or agentic project? No (the product is not agentic; the code was written with AI coding agents, documented in docs/ai-attribution.md).
9. Were you able to successfully integrate Uniswap into your project? Yes, on a local Sepolia fork against the deployed contracts; choose the option that matches the broadcast status at submission time.
10. How long did it take to get your first successful integration working? Pick the bucket matching the builder's recollection of 2026-09-07 (the checker, factory tests and fork onboarding were merged the same day, FACT commit dcf4f12 dated 2026-09-07; the mint and swap on the fork the same day, a190ac3). Do not overstate speed if the buckets are coarse.
11. What was the biggest blocker you faced? Paste:

The guide pins v4-periphery commit 3245c3c for forge install, but the contracts deployed on Sepolia are main (dce236d), verified by bytecode comparison; PermissionsAdapter at the pinned commit lacks updateAllowedHook, which step 5 of the guide calls. Second: the production PermissionedHooks source is not in v4-periphery (only the mock), and deployments.json points to v4-hooks-public, which does not contain it. Items 1, 2 and 14 in FEEDBACK.md.

12. If applicable: what was the hardest part of building an agentic app on Uniswap? Not applicable.
13. How helpful was the Uniswap documentation for your use case? Builder's rating. OPINION from FEEDBACK.md: the deploy and provide-liquidity pages were exact; the swap-without-Trading-API path and the dynamic-allowlist-token case were missing (items 3, 12, 16); a 3 or 4 is consistent with the file.
14. How would you rate the support Uniswap provided overall? Builder's rating. No support channel was used during the build (unverified whether the builder asked anything on Discord); rate accordingly or pick the neutral option.
15. Do you plan to continue building the project you started at this hackathon? Builder's answer. The wiki records a business gate after 2026-09-13 with no named operator yet (open-questions.md, item f).
16. What type of support did you use? Documentation; GitHub repositories (v4-periphery, v4-core, universal-router, permit2); deployments.json. Nothing else unless the builder used Discord or office hours.
17. What support was missing, or could have been better? Paste:

A "swap through a permissioned pool without the Trading API" code block (Permit2 approvals, V4_SWAP encoding with the six-field ExactInputSingleParams, the permissioned router address); a sizing paragraph on the provide-liquidity page (StateView.getSlot0, LiquidityAmounts, rounding margin); a "deployed from" commit in deployments.json records; the production hook source or a pointer to it; a note in step 3 for tokens whose transfer gate is a dynamic on-chain predicate rather than a static allowlist; a quoter for the permissioned set that passes the hook's msgSender() check, or a note that quotes on permissioned pools go through the Trading API only (item 18).

18. Any additional feedback? Paste:

Full write-up with 18 items and the evidence status: https://github.com/devdotbo/nachweis-app/blob/main/FEEDBACK.md. Things that worked well: the checker interface is the right size (one function, one bytes2, ERC-165); steps 1 to 6 are permissionless on Sepolia; deployments.json reproduces the deployed factory bytecode from main; ERC-7751 WrappedError names the hook and selector on a refused swap.

19. Can we follow up with you about your feedback? Builder's choice (yes is consistent with the grant framing in sponsors.md).
20. Terms of Service and Privacy Policy agreement: builder.

## Before sending

- Repository public; the FEEDBACK.md link opens without login.
- FEEDBACK.md TODO lines filled or explicitly left as "not broadcast".
- Keep the confirmation page or email; record the date in log.md as `run | Uniswap feedback form submitted`.
