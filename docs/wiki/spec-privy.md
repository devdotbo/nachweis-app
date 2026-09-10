---
type: plan
title: Privy integration spec (proposed, conditional on eligibility)
updated: 2026-09-09
sources:
  - https://ethglobal.com/events/ethonline2026/prizes/privy (fetched 2026-09-09)
  - https://docs.privy.io/basics/react/setup (fetched 2026-09-09)
  - https://docs.privy.io/basics/react/quickstart (fetched 2026-09-09)
  - https://docs.privy.io/wallets/using-wallets/ethereum/sign-a-message (fetched 2026-09-09)
  - https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction (fetched 2026-09-09)
  - https://docs.privy.io/wallets/using-wallets/ethereum/ethereum-provider.md (fetched 2026-09-09)
  - https://docs.privy.io/wallets/connectors/ethereum/integrations/viem.md (fetched 2026-09-09)
  - https://docs.privy.io/basics/react/advanced/configuring-evm-networks (fetched 2026-09-09)
  - https://docs.privy.io/wallets/actions/swap/overview.md, transfer/overview.md, earn/overview, wallets/funding/add-funds.md, financial-flows/payments (fetched 2026-09-09)
  - https://www.privy.io/pricing (fetched 2026-09-09)
  - nachweis-app/app/src/lib/WalletProvider.tsx, wallet.ts, devSigner.ts, chain.ts, app/src/bridge.ts (opus inventory 2026-09-09, read-only)
  - wiki/track-decision.md
---

# Privy integration spec

Status: proposed. Nothing is built; no Privy dependency exists in nachweis-app (FACT, inventory 2026-09-09: `@privy-io/*` in no package.json; three comments mention Privy as a possible replacement for the body of app/src/lib/WalletProvider.tsx). Decision: the builder decides after ETHGlobal answers the notice in wiki/track-decision.md. Dependency on that answer: this package is worth building only if the entry is eligible for Privy's open tracks; both are open tracks with no Continuity pool (FACT, prize page).

## What the prize asks (FACT, https://ethglobal.com/events/ethonline2026/prizes/privy, fetched 2026-09-09)

Best Financial Flow, 2,500 USD. "Build a seamless experience for funding, moving, trading, growing, or spending digital assets with Privy." Requirements, verbatim: "Integrate Privy as a core part of the product"; "Create or use at least one Privy wallet"; "Complete at least one functional financial flow using a generally available Privy feature" (eligible flows: "transfers, bridging, stablecoin conversions, swaps, self-service Earn vaults, onramps, or other supported wallet actions"); "Provide a working demo and access to the project's source code"; "Clearly explain how Privy improves the user experience". Mocking rule: "Features requiring commercial or guided onboarding may be mocked, but they do not count as the required functional Privy integration."

Best B2B Financial Product, 2,500 USD, needs "at least one Privy control, such as policies, signers, key quorums, or intents" and a business workflow. Not targeted here: the issuer's Approve is a business workflow, but adding a Privy policy or quorum around it is a second integration with its own unknowns. OPINION: one track, Financial Flow, is the honest minimum; the B2B track is a stretch item listed at the end.

## The smallest honest integration

Two pieces, both on the investor side of the web app:

1. Privy embedded wallet as one investor option next to "bring your own wallet". The investor logs in with email (Privy `useLoginWithEmail`, quickstart) and gets an embedded Ethereum wallet created on login (`embeddedWallets: {ethereum: {createOnLogin: 'users-without-wallets'}}`, setup page). The injected connector stays for investors who bring a wallet. The dev signer stays for the scripts and Playwright (build-time constant, unchanged).

2. The financial flow, in this order of preference:
   - Subscribe: the investor calls Subscription.subscribe from the Privy wallet (`useSendTransaction` from `@privy-io/react-auth`, or wagmi's `useWriteContract` over the Privy EIP-1193 provider). This is "other supported wallet actions" in the prize wording: a transaction from a Privy wallet that moves the fund token to the investor. It is what the app already does (app/src/lib/chain.ts:204 to 207 writes `subscribe`).
   - Swap in the permissioned pool: the same call path against the permissioned Universal Router (scripts exist, contracts/script/SwapPermissioned.s.sol; no Swap door in the app yet, WP8 note). Stronger fit to "trading", larger change.
   - Privy's own Swap action (docs: "Enable swaps in the Privy Dashboard and configure gas sponsorship", testnets include Sepolia and Base Sepolia): rejected for this build. It routes through Privy's aggregator, not through our permissioned pool, so the eligibility gate would not be exercised; it also needs dashboard enablement and gas credits (unverified whether available to a hackathon app).
   - Onramp (`useAddFunds`, fiat sandbox environment documented, testnet support unverified) and Earn (self-serve set in the dashboard, more vaults via sales): not used. Earn on a testnet is unverified; anything needing sales contact falls under the mocking rule and does not count.

The EIP-191 session signature: the bridge requires `personal_sign` of `nachweis:session:<session_id>` (FACT, app/src/bridge.ts:128 to 129 and :141; service/src/chain.rs:101). With Privy, `useSignMessage().signMessage({message}, {address})` uses `personal_sign` (docs, sign-a-message page), so the bridge code is unchanged. Alternatively the Privy wallet's EIP-1193 provider (`wallet.getEthereumProvider()`) is handed to wagmi through `@privy-io/wagmi`, and the existing `useSignMessage` in app/src/lib/wallet.ts:80 signs as before. OPINION: use `@privy-io/wagmi` so that wallet.ts, chain.ts and the screens do not change; Privy becomes a connector source, not a second code path.

Chain: the app runs on anvil 31337 locally and Sepolia 11155111 for the deployment (app/src/lib/WalletProvider.tsx:21 to 30). Privy's testnet list includes Ethereum Sepolia by default (configuring-evm-networks page); a custom chain for anvil 31337 goes into `supportedChains` via `defineChain` (unverified whether Privy's embedded wallet signs on an arbitrary local chain id; the Playwright path keeps the dev signer, so this only matters for a hand-clicked local demo). The demo with Privy is on Sepolia after the deployment (Task order in the handoff).

## What changes in app/ (FACT for the current code, OPINION for the change)

- app/package.json: add `@privy-io/react-auth` and `@privy-io/wagmi` (exact versions pinned at install; unverified today). Install with bun, never npm.
- app/src/lib/WalletProvider.tsx (lines 34 to 39 build the connector list; the file's own header comment names this replacement): wrap with `PrivyProvider appId={VITE_PRIVY_APP_ID}` and `WagmiProvider` from `@privy-io/wagmi`; keep `injected()` and the dev signer connectors in the wagmi config. If `VITE_PRIVY_APP_ID` is unset, render the current provider unchanged (no Privy at build time, scripts and CI unaffected).
- app/src/config.ts: parse `VITE_PRIVY_APP_ID` (optional). app/.env.example: document it.
- app/src/lib/wallet.ts (`useWallet(role)`, connect at :62 to :65): add a "Sign in with email (Privy embedded wallet)" connect option for the investor role only; the issuer role keeps injected and dev signer. Disconnect calls Privy `logout` in addition to wagmi disconnect.
- One new component or a branch in app/src/components (the connect card): two buttons, "Bring your wallet" and "Email sign-in, wallet by Privy", plus the on-screen sentence below.
- No change: app/src/bridge.ts, app/src/lib/chain.ts, app/src/lib/devSigner.ts, the screens' subscribe and approve logic, service/, contracts/, scripts/.

## Honesty rule on screen

Sentence under the connect card, verbatim proposal: "Wallet by Privy: an embedded wallet created at email sign-in, so an investor without a crypto wallet can hold the fund token. Your identity evidence never goes to Privy; Privy sees an address and the transactions you sign. Sample identity from the official test wallet; testnet funds." Never say "no seed phrase means no custody question" or any claim about Privy's key management beyond what the docs say (embedded, self-custodial per Privy's own wording, CLAIM). Sponsor mention in the video only if this package is green (product.md rules); the README's Privy section cites the files and lines of the integration in the same way as the Uniswap section.

## Acceptance tests

1. Hand-clicked, Sepolia (evidence class S, needs the deployment): a fresh email address signs in, an embedded wallet appears with an address; the investor binds the session (bridge accepts the EIP-191 signature from the Privy wallet, `address-proof` 200); the official test wallet presents, the browser proves and the bridge attests; issuer approves; Subscribe from the Privy wallet confirms and the balance shows 100 NDF. Record in docs/evidence with transaction hashes, no email address in the record.
2. Local, Playwright (evidence class L): the existing app-e2e specs still pass with `VITE_PRIVY_APP_ID` unset (dev signer path untouched): sp1-mock, noir, browser-prover.
3. Refusals unchanged: subscribe before approval is refused; after revoke the Privy wallet's subscribe is refused (same assertions as scripts/real-proof-local.sh, exercised by hand once with the Privy wallet).
4. Typecheck and production build pass with and without the app id.
5. README section "Privy" with file and line references and the on-screen sentence; submission text names the flow as "subscribe from an embedded wallet" (transfers wording only if a token transfer is actually shown).

## Kill criteria

- ETHGlobal answers that the entry is not eligible for Privy's open tracks: do not build; remove Privy from the site footer and the sponsor list (pitch.md rule).
- No answer by the time the Sepolia flow is recorded and the video shot list is frozen: do not build; the Uniswap track and the Finalist path stay the targets.
- The chosen flow needs a Privy feature that is not self-serve on Sepolia (dashboard enablement refused, sales contact, gas credits unavailable): per the prize page such a feature "may be mocked, but [does] not count"; a mocked flow is not built and not shown.
- `@privy-io/wagmi` breaks the existing connectors or the Playwright specs and the fix is not obvious within one bounded teammate task: stop, keep the branch, no merge.
- The embedded wallet cannot sign `personal_sign` for the bridge (unexpected per the docs): stop.

## Size

Medium. Two dependencies, four files changed in app/, one new component, one env var, one README section, one hand-clicked Sepolia run with a record. Review burden: the connector wiring (one decision: `@privy-io/wagmi` versus a separate Privy code path), the on-screen sentence, and the evidence record. Nothing in contracts, service or scripts changes. The Privy dashboard app id is a builder step (account, app, allowed origins for localhost and the deployed app URL); free tier covers it (FACT, pricing page: Core, free up to 499 MAU, 50K signatures per month).

## Stretch (not proposed for this week)

B2B track: a Privy server wallet with a policy for the issuer's Approve. Would need `@privy-io/node`, a policy definition, and a second evidence run. Size large; skip unless the Financial Flow package is green early and ETHGlobal's answer is yes.

## Unverified

- Exact current versions of `@privy-io/react-auth` and `@privy-io/wagmi`.
- Whether Privy's embedded wallet signs on an arbitrary local chain id (anvil 31337).
- Testnet support for `useAddFunds` (onramp) and for Earn.
- Whether Privy's Swap action needs paid gas credits for a hackathon app.
- Privy prize judging criteria beyond the requirement list (no numbered criteria on the page).
