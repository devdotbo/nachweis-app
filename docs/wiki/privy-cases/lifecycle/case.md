---
type: plan
title: Privy case, lifecycle lens: the attested savings plan (one decision, recurring purchases, several doors, one revoke)
updated: 2026-09-09
sources:
  - /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/BRIEF.md
  - /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/lifecycle/research.md (every Privy URL with fetch date 2026-09-09)
  - /Users/bioharz/git/ethglobal/nachweis-app main 5f5ceb9 (opus inventory 2026-09-09, read-only)
  - /Users/bioharz/git/ethglobal/nachweis/raw/2026-09-06-product-pitch-legal.md, 2026-09-06-live-gated-products.md
  - /Users/bioharz/git/ethglobal/nachweis/wiki/spec-privy.md, product.md, narrative-zk.md
---

# The attested savings plan

## 1. Sentence

A fund issuer can run a recurring savings plan into its tokenized fund, and let a second issuer's instrument and a permissioned pool accept the same customer, for a retail investor who keeps one self-custodial wallet, because one EUDI-backed eligibility decision on chain is re-checked at every purchase, expires with the credential and is revoked in one transaction, with Privy providing the embedded wallet she keeps, the issuer's delegated signer under a policy limited to the subscribe call, and the token transfer to another attested wallet.

## 2. Who buys and who uses

Buyer: the fund issuer or transfer agent that today reaches savings-plan customers only through custodial brokers and gates its token behind its own allowlist. Second buyer, later: another issuer that wants the same customer on day one without its own allowlist relayer.

User: the retail investor with an email, the official test wallet on her phone, and no crypto wallet. After email sign-in she has a Privy embedded wallet. She proves once, the issuer approves once, and her plan buys fund tokens on a schedule while she is offline.

Money that moves: the recurring subscription into the fund token (in this build `Subscription.subscribe()` mints the demo amount and takes no payment, captioned "demo subscription, no payment"; FACT, Subscription.sol:23 to 28), the transfer of fund tokens to another attested person, the swap in the permissioned pool, and the redemption by transfer back to the issuer (FACT, FundToken.sol:62 exempts `to == issuer`).

Why the buyer pays: recurring retail inflows without operating custody and without a per-purchase eligibility re-check against a stored identity record. Every execution is gated by the chain.

## 3. Otherwise not possible

FACT, code: a recurring purchase from a self-custodial wallet needs a signer that acts while the user is away. With an EOA that means the business holds the key or the user clicks every time. FundToken gates every receipt on `registry.isEligible(to, ...)` (FundToken.sol:61 to 66); isEligible requires approval, not revoked, not expired (AttestationRegistry.sol:187 to 191). The same gate stops a plan execution, a receipt from a second issuer, a swap, and a person-to-person transfer, with nothing running in the issuer's back office.

COUNT, market: 0 live products where an on-chain portable attestation is consumed on chain by more than one independent app; ERC-3643 cross-issuer reuse in production: none found; Spiko's allowlist is per issuer and run by its own relayer (live-gated-products memo :18, :33, :40, :175). 5 of 5 core EU exchanges store their own verified address and 0 accept another VASP's proof (:22). Today a second venue re-verifies, holds its own file, and runs its own revocation loop; a revocation at venue A does not reach venue B.

FACT, regulation: eIDAS 2 Art 5a(9) obliges revocation of the wallet at the user's request, on compromise, or on death; Art 5a(8) obliges free validation mechanisms for wallet validity (eur-lex, fetched 2026-09-09). ARF v3.0.0 Topic 53 lists validity and non-revocation predicates among ZKP_01 to ZKP_09 (product-pitch-legal memo :117). The regulation gives the credential a lifecycle; without an on-chain decision that lifecycle stops at the verifier's database and never reaches the token, the pool, or the plan.

CLAIM, legal boundary that shapes this case: "an attestation reused by a second venue does not transfer that venue's duty" (product-pitch-legal memo :140, OPINION on AMLR Art 22 and Art 77). So the doors that reuse the decision are eligibility doors: the same issuer's second instrument, the permissioned pool, and a second issuer's instrument that accepts the decision as its on-chain gate while keeping its own customer file. Age and jurisdiction predicates without a due-diligence relationship are the rows the memo marks "Yes" (:125 to 126). This case does not claim onboarding reuse.

OPINION: what becomes possible is a plan and a set of doors that fail closed on a decision the customer carries, revoked or expired in one place, with no business holding her document and no business holding her key.

## 4. Privy as core

Wallet type: Privy embedded wallet created at email sign-in (Sepolia is in Privy's default chain list; research.md 1.1). It is the wallet she keeps: the plan, the second instrument, the pool and the transfer all run from this one address, so revocation of the decision bound to it closes everything.

Control: a signer on her wallet. The issuer's authorization key (its "key quorum ID" from the dashboard) is added by the investor with `useSigners().addSigners({address, signers: [{signerId, policyIds}]})`, removable with `removeSigners` (FACT, docs and Privy's own example, research.md 1.2). Attached policy: ALLOW `eth_sendTransaction` only where `to` equals the Subscription contract and `ethereum_calldata.function_name` equals `subscribe`, on chain id 11155111 (template: the "Allow WETH deposit" example, research.md 1.3). The issuer's runner then sends `subscribe()` from her wallet on schedule via `privy.wallets().ethereum().sendTransaction(walletId, {caip2: 'eip155:11155111', ...})` (FACT, research.md 1.2). Two bounds on the delegation: Privy's policy bounds what the issuer may sign, the chain bounds whether it lands.

Flow: the subscribe transaction from the embedded wallet and the ERC20 transfer of fund tokens to a second attested wallet. Privy's transfer action lists Sepolia and custom ERC20 tokens (FACT, research.md 1.5).

Why core: without the signer there is no plan (the user clicks monthly or the issuer holds her key); without the embedded wallet the retail user has no address to bind; without the policy the delegation is unbounded on Privy's side.

Primary track: Best B2B financial product. Mapping: "integrate Privy as a core part" (wallet, signer, policy, runner); "create or use at least one Privy wallet" (embedded wallet at sign-in); "business or organization use case" (issuer operations running plans); "functional B2B workflow" (payment operation: scheduled execution; wallet administration: revoke, policy set to DENY, the investor's `removeSigners`); "at least one Privy control" (signers plus the policy); "automated transactions" (the runner). Webhooks are free in development and Enterprise in production, so they stay optional.

Second track, Best financial flow, is also met: the subscribe transaction from the Privy wallet ("other supported wallet actions") and the token transfer to another attested wallet; the user experience gain is one email sign-in, no seed phrase, no monthly click.

## 5. The flow, as in the video

1. Investor screen: "Sign in with email" (Privy modal). An embedded wallet address appears with the sentence from section 8.
2. Bind: she signs `nachweis:session:<id>` with the embedded wallet (personal_sign, bridge check unchanged, spec-privy.md).
3. QR; she scans with the official test wallet on the iPhone; the tab decrypts and proves (11 s on the M3 Max, WP30); the bridge submits attestWithProof. On screen: "evidence recorded, awaiting approval".
4. Issuer screen: Approve, confirmed. Decision card shows bits 3, expiry (the credential's own expiry, bound by the proof, FACT service/src/api.rs:564 to 572), status "eligible".
5. Investor screen, card "Savings plan": "Allow the issuer to buy on my behalf, only `subscribe()` on the Subscription contract". Click Allow; Privy consent; `addSigners` returns. Card: "plan active, next run in 60 s (monthly in production)".
6. Runner log on screen: run 1 confirmed, 100 NDF; run 2 confirmed, 200 NDF. She is not clicking.
7. Door two: Issuer B's instrument (FundTokenB, same registry and policyId, its own deploy script). Issuer B screen: "mint 50 NDF-B to the investor", confirmed, because isEligible reads the same decision. Caption from section 8.
8. Door three: swap in the permissioned pool (SwapPermissioned.s.sol, hash on screen).
9. Transfer: 20 NDF to a friend's wallet that the operator attested for the demo, confirmed; 20 NDF to a non-attested address, reverted on the recipient check.
10. Revoke: Issuer A clicks Revoke. Runner run 3 reverts, Issuer B's mint reverts, the swap reverts, a transfer to her reverts. One transaction, four doors. The issuer then sets the Privy policy to DENY; the plan card shows "plan stopped by issuer"; she can also `removeSigners` herself.
11. Expiry, local only: on anvil, `evm_increaseTime` past the credential expiry; the runner's run reverts with Expired; captioned.
12. Re-attestation: a fresh proof after revoke is refused by attestWithProof (:170); the operator's attestByOperator reopens (captioned manual, FACT :106 to 110).

## 6. What changes in the code

App (/Users/bioharz/git/ethglobal/nachweis-app/app/):
- package.json: add `@privy-io/react-auth` 3.40.0 and `@privy-io/wagmi` 4.0.17 (bun add; versions FACT, npm 2026-09-09).
- src/lib/WalletProvider.tsx: wrap with PrivyProvider and the `@privy-io/wagmi` WagmiProvider when `VITE_PRIVY_APP_ID` is set; unchanged provider otherwise (design from spec-privy.md).
- src/config.ts and .env.example: `VITE_PRIVY_APP_ID`, `VITE_PRIVY_SIGNER_ID`, `VITE_FUND_TOKEN_B`.
- src/components/ConnectCard.tsx: "Sign in with email" option for the investor role.
- New src/components/PlanCard.tsx: Allow and Stop buttons (`useSigners`), the runner log (polls the runner's status endpoint), the sentence from section 8.
- src/components/DoorsCard.tsx: a "Transfer 20 NDF" input and button (wagmi writeContract on FundToken transfer; Privy's transfer action is an alternative if the watchlist step is quick).
- src/screens/IssuerScreen.tsx: a "Plan" panel with "Stop plan (policy DENY)" calling the runner's admin endpoint; an "Issuer B" panel with the mint button.

Scripts (/Users/bioharz/git/ethglobal/nachweis-app/scripts/):
- New scripts/plan-runner.ts (bun): loop every `PLAN_INTERVAL_SECS`; `PLAN_SIGNER=dev` signs `subscribe()` with a local key (anvil, Playwright, no Privy); `PLAN_SIGNER=privy` calls `@privy-io/node` 0.34.0 with the app id, app secret, authorization key and wallet id; exposes `/status` and `/stop`; logs the revert reason; sets the policy to DENY through the same SDK.
- contracts/script/DeploySecondIssuer.s.sol: deploys FundTokenB with the existing registry and policyId and a second issuer key; script only.
- scripts/browser-real-wallet-up.sh: start the runner in dev mode.

Service: unchanged. Contracts src: unchanged (FundToken and Subscription already take registry and policyId as constructor arguments; a second issuer is a deployment, not a code change).

Env vars, new: VITE_PRIVY_APP_ID, VITE_PRIVY_SIGNER_ID, VITE_FUND_TOKEN_B, PLAN_SIGNER, PLAN_INTERVAL_SECS, PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTHORIZATION_KEY, PRIVY_WALLET_ID, PRIVY_POLICY_ID; secrets in gitignored .env files.

## 7. Evidence plan

Green by 2026-09-12 with evidence class L (anvil, dev signer, Playwright):
1. Plan runs: runner in dev mode executes two `subscribe()` calls 60 s apart from the investor address; balance 200 NDF. Pass: two Subscribed events, balances match.
2. Second door: FundTokenB mint to the attested investor confirms; mint to a non-attested address reverts. Pass: one receipt, one revert with the registry reason.
3. Transfer: NDF transfer to an operator-attested second address confirms; to a non-attested address reverts. Pass: same.
4. Revoke closes four doors: after revoke, runner run reverts, FundTokenB mint reverts, SwapPermissioned reverts, transfer to the investor reverts. Pass: four reverts in one log, one Revoked event.
5. Expiry: `evm_increaseTime` beyond the decision expiry; runner run reverts with Expired. Pass: revert reason contains Expired.
6. Re-attestation: attestWithProof after revoke is refused; attestByOperator reopens; subscribe confirms. Pass: revert then receipt.
7. Existing suites unchanged: forge 97 passed, app-e2e specs pass with VITE_PRIVY_APP_ID unset.

Needs the builder's Privy app id (dashboard: app, authorization key, policy, allowed origins) and Sepolia (class S):
8. Email sign-in creates an embedded wallet; bind signature accepted by the bridge (`address-proof` 200).
9. `addSigners` succeeds with the policy id; Privy dashboard shows the wallet as delegated.
10. Runner in privy mode: two `subscribe()` hashes on Sepolia from the embedded wallet while the tab is closed. Pass: hashes in docs/evidence, no email address in the record.
11. A `subscribe()` attempt to a different contract from the runner is refused by Privy's policy (log the API error). Pass: refusal recorded.
12. Revoke on Sepolia, runner run reverts; policy set to DENY; `removeSigners` from the investor screen succeeds.

## 8. Honesty check

On-screen sentences touching identity, custody or Privy:
- "Official test wallet, sample identity." (product.md rule)
- "No identity documents on chain, and nothing we could use to find her." (verbatim rule)
- "Proof made in your browser tab on this computer." (browser route, WP30)
- "Demo subscription: mints fund tokens, no payment." (Subscription takes no payment)
- "Second investor attested by the operator for the demo." (attestByOperator, no EUDI evidence)
- "Expiry demonstrated on a local chain." (time warp is not possible on Sepolia)
- "Manual: issuer revokes; issuer reopens." (product.md: manual withdrawal captioned manual)
- "Issuer B accepts the eligibility decision as its on-chain gate; its own customer file is its own duty." (legal memo :140)
- Sponsor on screen only if this package is green (product.md).
- No "first", no "only", no yield figure, no "KYC".

Proposed verbatim Privy sentence, under the connect card: "Wallet by Privy: an embedded wallet created at email sign-in, so an investor without a crypto wallet can hold the fund token. Your identity evidence never goes to Privy; Privy sees an address and the transactions you sign or allow. Sample identity from the official test wallet; testnet funds."

Under the plan card: "Savings plan: you allow the issuer's key to send only `subscribe()` from your wallet, bounded by a Privy policy and re-checked on chain at every run. Stop it here at any time; the issuer's revoke stops it too. Privy's docs say the signer never sees your key (their statement, not ours)."

## 9. Size and review burden

Large. About 12 files: 7 in app/, 1 runner, 1 deploy script, 1 shell script, 2 env examples, plus a README section and one evidence record. Decision points: (1) whether the policy add-on is self-serve; if not, do not ship a signer without an override policy (the delegation would be unbounded on Privy's side and the on-screen sentence false); (2) gas for the embedded wallet on Sepolia (builder funds it; Privy sponsorship on Sepolia unverified); (3) transfer beat via Privy's transfer action or plain writeContract (plain is safe); (4) the wording of the Issuer B door.

Risks: Privy's execution cannot reach a local anvil, so the privy-mode runner is Sepolia only (dev mode covers class L); the react-auth and wagmi provider wiring may collide with the dev signer connectors; policy calldata decoding for a no-argument function is untested by us.

Kill criteria: no Privy app id by 2026-09-11 morning (ship dev mode only, no Privy on screen); policy engine not self-serve (drop the runner, keep the wallet and the transfer beat, financial flow track only); `addSigners` fails on Sepolia within one bounded teammate task (same fallback); any Privy step needing sales contact (a mock does not count; do not show it).

## 10. Unverified

- Whether "Policy engine" (pricing: "Available as add-on") is self-serve in the dashboard for a free Core app, and its price.
- The exact `@privy-io/node` constructor option for the authorization private key.
- The React hook name for Privy's transfer action, and whether the asset watchlist accepts a Sepolia ERC20 quickly.
- Privy gas sponsorship on Sepolia.
- Whether a signer added on Sepolia can execute on a custom chain id (anvil is unreachable by Privy's servers regardless).
- Whether a new attestWithProof after expiry (not revoked) clears `approved` (the re-attestation beat uses attestByOperator to avoid depending on this).
- The "subscriptions and portfolio rebalancing" wording on Privy's session signers overview (seen only in a search snippet).
- Global wallet provider access (gated, "Request access"); not relied on.

## 11. Rejected variants

- Global wallet across two businesses (Attestat as provider, Issuer B as requester with `toPrivyWallet`). Rejected as the core: provider access is gated ("Request access", production app, cookie domain, logo; research.md 1.7), so it cannot be green this week. The chain-level reuse does not need it, because Issuer B's contract reads the same address.
- Intents and a key quorum for the issuer's Approve and Revoke. Rejected: key quorums are "an advanced integration" ("reach out" on Slack, "Available as add-on"); intents expire in 72 hours and their use on user wallets is unverified; it would duplicate the on-chain approve, which is the product's own control.
- Redemption payout from an issuer server wallet under a policy. Rejected: FundToken has no burn or redeem function, so a payout leg needs a contract change and a stablecoin, and it shows the issuer's key, not the customer's lifecycle. The savings plan puts the same Privy controls on the customer's own wallet, where the decision lives.
