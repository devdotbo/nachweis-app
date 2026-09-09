---
type: reference
title: Sponsors
updated: 2026-09-09
sources:
  - https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation (fetched 2026-09-08)
  - https://ethglobal.com/rules (fetched 2026-09-08 and 2026-09-09, partner-prize eligibility for Continuity)
  - https://ethglobal.com/events/ethonline2026/prizes/privy (fetched 2026-09-09, requirements verbatim in wiki/spec-privy.md)
  - /Users/bioharz/git/ethglobal/ethonline2026/wiki/ethonline2026-prizes.md (Privy 192-203, Chainlink 209-232; briefs fetched 2026-09-01 and 2026-09-06)
  - /Users/bioharz/git/ethglobal/nachweis/raw/2026-09-06-sponsor-integration.md
---

# Sponsors

Committed: Uniswap. Conditional: Privy (eligibility). Out: Chainlink (dropped 2026-09-07, not built), ENS, Arc, Hedera, World (decisions 2026-09-06 and 2026-09-07). Prize amounts are FACT from the ETHGlobal prize pages; requirements are quoted from the same pages.

## Uniswap Foundation, 5,000 USD total (committed)

FACT, prize page fetched 2026-09-08:

- Tracks: "Best Uniswap Stack Contribution", 3,000 USD, up to three teams at 1,000 USD each; "Best Uniswap Stack Contribution", 2,000 USD, Continuity track only, first place 1,000 USD and second place 1,000 USD. One brief for both. There is no permissioned-pools track.
- Scope: "Build on or integrate any part of the Uniswap stack, including the Uniswap API, the Uniswap AMM (v2, v3, or v4), CCA, or any other Uniswap protocol. This also includes new v4 hooks, extensions or improvements to official Uniswap repositories, and tooling or solutions built for the broader ecosystem."
- Qualification: a public GitHub repository featuring open-source code; a FEEDBACK.md file; completion of the Uniswap Developer Feedback Form at https://developers.uniswap.org/hackathon-feedback that includes the FEEDBACK.md link; the README "clearly points to the relevant contracts and lines of code so we can verify your integration". Submissions are reviewed and audited before winners are finalized. The page does not describe the form's fields beyond the FEEDBACK.md link.
- Continuity: the 2,000 USD pool is Continuity-only. The rules page says partner-prize eligibility for Continuity submissions "may vary"; for Uniswap the brief itself names a Continuity pool, so eligibility is on the page (FACT). The track is open as of 2026-09-09 (Classic with the verifier disclosed as the builder's public library, or Continuity "Extend Open Source"; wiki/track-decision.md); under Continuity the 2,000 USD pool is certain and the open 3,000 USD pool is the "may vary" case; under Classic only the open pool applies.

What we do (WP7, WP7b, both green for local evidence only): an IAllowlistChecker that reads the Attestat registry, plugged into the published PermissionsAdapterFactory on Sepolia (0xE6B0d96919334C33d06266d1420F97f6f434fA2B, PermissionedHooks 0x51247E2291d290d17C08813A175AC86465EdE8c0, FACT fetched 2026-09-06), pool init, liquidity mint, one swap through the permissioned Universal Router, one refused swap after revoke. All of it on a local Sepolia fork as of 2026-09-08; no broadcast. FEEDBACK.md holds 17 friction items and a status-of-evidence section (relabelled 2026-09-08). The Developer Feedback Form has 20 fields (FACT, https://developers.uniswap.org/hackathon-feedback fetched 2026-09-08: name, email, Telegram, hackathon, what you built, integration success, time to first integration, biggest blocker, two 1 to 5 ratings, support used, missing support, additional feedback, follow-up consent, terms) and no dedicated link field; the FEEDBACK.md link goes into the free-text fields (wiki/uniswap-feedback-form.md). The kycUrl field belongs to the separate step 7 routing request, not to this form; if that request is sent it carries the verifier URL and is the only place the word KYC appears.

Status against the qualification list on 2026-09-08: repository private (builder flips), FEEDBACK.md present, form not submitted (paste-ready answers in /Users/bioharz/git/ethglobal/nachweis/wiki/uniswap-feedback-form.md), README line references present and to be rechecked after WP16.

Open question (d): whether a checker on the published factory counts as a "Stack Contribution". OPINION: yes on the wording ("integrate any part of the Uniswap stack"); unconfirmed by Uniswap.

## Privy, 5,000 USD total (conditional on eligibility)

- Tracks: Best B2B financial product, 2,500 USD; Best financial flow, 2,500 USD. Two open tracks, no Continuity track, so none of Privy's money is Continuity-only.
- Best financial flow requirements: Privy as a core part of the product; create or use at least one Privy wallet; at least one functional financial flow using a generally available Privy feature (transfers, bridging, stablecoin conversions, swaps, Earn vaults, onramps); working demo plus source code; explain how Privy improves the UX. Features needing guided onboarding may be mocked but do not count.
- What we would do (WP8): the investor's embedded wallet, the address-binding signature, the subscription and the swap in the permissioned pool as the flow.
- Open question (c): whether the entry is eligible for Privy's open tracks. Not yet asked as of 2026-09-09 (correction: earlier versions of this page said "asked 2026-09-01"; the builder states no question was sent). The paste-ready notice that asks it, together with the track question, is in /Users/bioharz/git/ethglobal/nachweis/wiki/track-decision.md; the integration spec is /Users/bioharz/git/ethglobal/nachweis/wiki/spec-privy.md (proposed, size medium, build only after a yes). Rule text (https://ethglobal.com/rules, fetched 2026-09-08): "For Continuity-track submissions, eligibility for specific partner prizes may vary". Decision 2026-09-07: build Privy only if ETHGlobal confirms. Fallback: any EVM wallet for the binding signature; the flow is unchanged. The review of 2026-09-08 keeps it conditional: no qualifying integration exists.

## Chainlink, 3,000 USD total (dropped)

- Tracks: Best Confidential Workflow, 2,000 USD (up to two teams at 1,000); Best Chainlink-Powered Upgrade, 500 USD, Continuity only, needs a state change on chain through a Chainlink service; Automated Liquidation Protection Challenge, 500 USD, unrelated to us.
- Decision 2026-09-07: dropped from the privacy story (the privacy property comes from the proof route, not from a TEE). Nothing was built; the review of 2026-09-08 parks extra sponsor integrations. Not on the submission form.

## What each sponsor sees on screen

Only sponsors that are actually integrated appear in the video, the README and the site footer. Chainlink was removed from the site footer on 2026-09-07 (verified on disk); Privy stays until eligibility is answered.
