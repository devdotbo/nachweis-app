---
type: plan
title: Privy case, investor money: subscribe, distributions and redemption in stablecoin to an email-only investor
updated: 2026-09-09
sources:
  - /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/BRIEF.md
  - /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/investor-money/research.md (all docs.privy.io pages fetched 2026-09-09, URLs there)
  - /Users/bioharz/git/ethglobal/nachweis/wiki/handoff-fable-2026-09-09.md, product.md, spec-privy.md
  - /Users/bioharz/git/ethglobal/nachweis-app (opus inventory 2026-09-09, read-only, main 5f5ceb9)
  - /Users/bioharz/git/ethglobal/nachweis/raw/2026-09-06-product-pitch-legal.md, raw/2026-09-06-live-gated-products.md
---

# Investor money: the fund desk for an investor who only has an email address

## 1. Sentence

A fund issuer can take stablecoin subscriptions, pay distributions and pay redemptions to an investor who signed in with an email address and never held a seed phrase, because the investor's EUDI identity evidence and the issuer's approval sit on chain as a decision bound to that wallet address and every money movement checks it, with Privy providing the embedded wallet that is created at sign-in, receives the fund units and the stablecoin, and signs each transaction.

## 2. Who buys and who uses

Buyer: the issuer of a gated fund token (fund issuer, transfer agent, launchpad), the same buyer as product.md. Today its primary market is "issuer KYC with a wallet whitelist for mint and redeem" (FACT, live-gated-products memo :186). It pays because the desk replaces its document funnel and a whitelist that is only as fresh as its last manual edit.

User: the investor, with an official test wallet (sample identity) on her phone and an email address; no browser extension, no exchange account. She signs in with email and gets an address (Privy embedded wallet). The money that moves: a test stablecoin (mUSD, the repository's MockStable, 6 decimals) into the desk at subscription; NDF fund units to her wallet; mUSD distributions and redemptions back; mUSD out to any address she names. Every movement of NDF or mUSD from the desk is refused unless `isEligible(wallet)` is true at that block.

## 3. Otherwise not possible

FACT (live-gated-products memo :186): in every live tokenized product the eligibility decision sits with the issuer's own onboarding, and the wallet whitelist for mint and redeem is built from documents the issuer collected and stores. An investor without a crypto wallet is on no whitelist; an issuer that wants her as a customer must collect and retain her identity documents and must obtain from her a wallet address it can trust.

FACT (product-pitch-legal memo :41): Regulation (EU) 2023/1113 Art 14(5) and 16(2) require a CASP, for transfers above EUR 1,000 to or from a self-hosted address, to assess "whether that address is owned or controlled by" the customer; EBA/GL/2024/11 paragraph 83(d) accepts a message signed with the key of that address. AMLR Art 40 extends this from 2027-07-10.

What is new: the address is created at email sign-in (Privy), the investor's crypto key signs the session binding (EIP-191, app/src/components/PresentCard.tsx:35) and the EUDI presentation carries `sha256(address || challenge)` inside the key-binding JWT (app/src/lib/handoff.ts:82), so address ownership and the identity predicate are proven in one act without the issuer holding a document. The desk, the fund token and the pool read that decision. CLAIM: no issuer can run "pay distributions only to currently eligible wallets" today without a private database kept in sync with its document file; here the chain refuses. OPINION: this is the prize's "funding, moving, trading, growing, or spending" applied to a regulated instrument, possible only because a wallet can be issued to an email address and evidence bound to it.

Limit, stated: a predicate does not replace customer due diligence for an obliged entity (AMLR Art 22(1)(a), Art 77; memo :138); the issuer keeps its compliance file off chain, as product.md says.

## 4. Privy as core

Wallet type: embedded wallet, created on login (`createOnLogin: 'users-without-wallets'`), non-custodial configuration, TEE-backed key shares (FACT, research.md section 1). Flow: transactions signed and confirmed in Privy's wallet UI from that wallet on Sepolia, including Privy's documented stablecoin transfer pattern (`useSendTransaction` with `encodeFunctionData(erc20Abi)`, recipe send-usdc). The app keeps wagmi and reaches the Privy wallet through `@privy-io/wagmi` (`createConfig`, `WagmiProvider`), so the existing `useWriteContract` hooks in app/src/lib/chain.ts drive the Privy wallet without a second code path.

Why core: without the embedded wallet the investor in this case has no address to bind evidence to and no place to receive units or stablecoin. Every money step in section 5 is a signature from the Privy wallet.

Prize requirement mapping, Best financial flow (primary target):

| Requirement | Artifact |
|---|---|
| Privy as a core part | PrivyWalletProvider.tsx wraps the app when `VITE_PRIVY_APP_ID` is set; all investor writes go through the Privy wallet |
| Create or use at least one Privy wallet | embedded wallet created at email sign-in, address shown in ConnectCard |
| One functional financial flow using a GA feature | stablecoin transfers out of the embedded wallet (subscribe pays 100 mUSD into the desk; "Send stablecoin" pays mUSD to an address the investor names) and claim and redeem receipts into it, all signed and broadcast by the Privy wallet on Sepolia. Confirmed GA and free tier: embedded wallets and `eth_sendTransaction` signatures (pricing page); Sepolia documented on the send-transaction page |
| Working demo and source | scripts/desk-local.sh (anvil, evidence L) and the hand-clicked Sepolia run (evidence S) |
| Explain how Privy improves the user experience | README section "Privy" and the on-screen sentence in section 8 |

Best B2B financial product: not met by the base case, which uses no Privy control. The stretch in section 9 (the issuer's distribution treasury as a Privy wallet owned by an authorization key, with a policy that only allows `FundDesk.distribute` on the desk address and chain 11155111) would meet it, but policies need TEE execution and their availability on the free plan is unverified (research.md section 6). Say "financial flow" in the submission; claim B2B only if the stretch is green.

Not used: Privy's swap action (bypasses the permissioned pool, needs funded gas credits), card onramps (docs: "Stripe's onramp does not support testnets, so testnet chains fail even in sandbox mode"; a mock does not count), Earn (mainnet vaults, no testnet vault named, no yield figures allowed), the managed transfer action (server-side API needing a signer on the user's wallet).

## 5. The flow, as in the demo video

Investor tab left, issuer tab right, Privy modal in front at each signature. All amounts are demo constants.

1. Sign in. "Sign in with email, wallet by Privy": email, one-time code. Privy creates the embedded wallet; the card shows the address and the sentence from section 8.
2. Fund. Card "Your money": mUSD 0. "Get 1,000 test mUSD" calls `MockStable.mint` from the Privy wallet (first Privy confirmation modal). Caption: "test stablecoin, anyone can mint; on mainnet this is a card or bank deposit". A disabled "Add funds by card" button is captioned "simulated: card onramps do not support testnets".
3. Present and approve. Existing beats: QR, official test wallet on the iPhone, the tab proves, the bridge submits `attestWithProof`; issuer clicks "Approve". Captions: "official test wallet, sample identity; proof made in this browser tab".
4. Eligible. Status card flips to eligible; the money card unlocks.
5. Subscribe. "Subscribe 100 mUSD": two Privy modals (approve mUSD to the desk, `FundDesk.subscribe`); the desk checks `isEligible`, pulls 100 mUSD, mints 100 NDF. mUSD 900, NDF 100.
6. Distribution. Issuer: "Pay distribution 10 mUSD" (`FundDesk.distribute`). Investor: "Distribution 1 claimable: 10 mUSD", "Claim" from the Privy wallet; the desk checks `isEligible`, pays. mUSD 910.
7. Transfer, refused then allowed. "Send 20 NDF to" an address without a decision: the fund token's hook reverts `NotEligible(to)` (contracts/src/FundToken.sol:61 to :66), shown from simulation before any signature. The same 20 NDF to the second attested wallet (the dev-signer investor, attested by the operator route, captioned "simulated presentation"): confirmed.
8. Revoke. Issuer: "Revoke". Investor: "Claim" and "Redeem" close; a click shows `NotEligible` from simulation. Caption: "manual revocation; one decision closes subscribe, claim, redeem and the pool".
9. Re-approve and redeem. Issuer: "Approve". Investor: "Redeem 50 NDF" (`FundDesk.redeem`): the desk takes 50 NDF back and pays 50 mUSD. NDF 30, mUSD 960.
10. Money leaves. "Send stablecoin": 100 mUSD to an address she types, Privy's ERC-20 transfer pattern. Caption: "stablecoin is not the gated asset; the decision gates the fund units and the desk". Explorer links for every hash in the event log.

## 6. What changes in the code

Contracts (unavoidable: no money moves today, `Subscription.subscribe` mints for free at contracts/src/Subscription.sol:23 to :27, and nothing pays out):

- New contracts/src/FundDesk.sol (Ownable, owner = issuer operator): `subscribe`, `distribute`, `claim(id)`, `redeem(units)`; 1 mUSD (6 decimals) per NDF unit (18 decimals). Each investor-facing function starts with the `isEligible(msg.sender)` check and reverts `NotEligible`. `claim` pays the caller's current balance times the per-unit amount, once per (id, wallet); no snapshot (demo simplification, captioned). `redeem` pulls the units into the desk with `transferFrom` and pays stablecoin.
- FundToken unchanged: the desk is deployed as the token's `issuer` (constructor argument), so it may mint (contracts/src/FundToken.sol:55) and may receive units on redemption (:61 to :66). Subscription.sol unchanged and not deployed in the desk layout.
- New contracts/script/DeployDesk.s.sol: registry, setOperator, MockStable, FundDesk, FundToken with issuer = desk (address precomputed or a one-shot `setToken`). Deploy.s.sol unchanged, so every existing script and test keeps passing.
- New contracts/test/FundDesk.t.sol: eligibility on subscribe, claim and redeem; claim once; refusals after revoke and expiry; transfer to an unattested address refused; distribute only owner; decimal scaling.

App (behind one env var, `VITE_PRIVY_APP_ID`; unset means the current provider unchanged):

- New app/src/lib/PrivyWalletProvider.tsx: `PrivyProvider` (email login, `embeddedWallets.ethereum.createOnLogin: 'users-without-wallets'`, `supportedChains: [chain]`, `defaultChain: chain`), then `QueryClientProvider`, then `WagmiProvider` and `createConfig` from `@privy-io/wagmi` with today's chain and transport. app/src/lib/WalletProvider.tsx:47 to :55 picks it when the app id is set.
- app/src/lib/wallet.ts:55 to :90: investor connect calls Privy `login()` when the app id is set; disconnect calls Privy `logout()` (wagmi's `useDisconnect` is not supported with Privy). Issuer role keeps the dev signer or injected wallet.
- New app/src/components/MoneyCard.tsx (balances, "Get test mUSD", "Subscribe 100 mUSD", "Claim", "Redeem 50 NDF", "Send 20 NDF to", "Send stablecoin", disabled "Add funds by card"); DoorsCard.tsx hides its Subscribe when `VITE_DESK` is set; IssuerScreen gets "Pay distribution".
- app/src/lib/chain.ts: three new reads (stable balance, claimable, distribution count) and eight writes (mint stable, approve, subscribe, distribute, claim, redeem, transfer units, transfer stable); mock twins in mockChain.ts; ABI files FundDesk.json and MockStable.json.
- app/src/config.ts and app/.env.example: `VITE_PRIVY_APP_ID` (optional), `VITE_DESK`, `VITE_STABLE`.
- New dependencies: `@privy-io/react-auth` 3.40.0, `@privy-io/wagmi` 4.0.17 (npm 2026-09-09); wagmi ^2.19.5 and viem ^2.56.3 stay.

Scripts and docs: new scripts/desk-local.sh (anvil, DeployDesk, operator attest for two wallets, the ten beats, prints `DESK-LOCAL PASS`); scripts/browser-real-wallet-up.sh gains `DESK=1` (about ten lines at :134 to :164 and :178 to :188). docs/spec-fund-desk.md, README section "Privy", evidence record. Unchanged: service/, circuits/, companion/, provers, registry and verifier contracts, the Uniswap checker.

## 7. Evidence plan

Green by 2026-09-12 with evidence class L: contracts, tests, DeployDesk, desk-local.sh, MoneyCard with the dev signer, a Playwright spec for the desk beats. Needs the builder: a Privy app (app id, allowed origins, email login) and the Sepolia deployment with the funded key. The Privy path is then hand-clicked on Sepolia (evidence class S); an anvil run through Privy is tried first and recorded only if it works.

Acceptance tests:

1. `forge test` on main plus FundDesk.t.sol: all pass; the count is recorded in the log (today 97 passed, 10 skipped).
2. scripts/desk-local.sh prints `DESK-LOCAL PASS` with balances 900/100 after subscribe, 910 after claim, `NotEligible` on the transfer to an unattested address, `NotEligible` on claim and redeem after revoke, 960/30 after re-approve and redeem.
3. Playwright with `VITE_PRIVY_APP_ID` unset: the existing specs (sp1-mock, noir, browser-prover) pass unchanged; a new desk spec passes with the dev signer.
4. `tsc --noEmit` and the production build pass with and without the app id.
5. Hand-clicked Sepolia run with the Privy app id: a fresh email signs in, an embedded wallet address appears; the bridge accepts the EIP-191 session signature from that wallet (`address-proof` 200); the official test wallet presents; attest, approve, mint mUSD, subscribe, distribute, claim, refused transfer, revoke, refused claim, re-approve, redeem, send stablecoin: every hash in docs/evidence, no email address in the record.
6. Refusals asserted by the same script: subscribe before approval, claim and redeem after revoke.
7. README "Privy" section with file and line references and the on-screen sentence; submission text names the flow as "stablecoin subscription, distribution and redemption from an embedded wallet".

## 8. Honesty check

Product.md rules applied to every on-screen sentence:

- "Official test wallet, sample identity" on the present beat; never "real state-issued identity".
- "No identity documents on chain, and nothing we could use to find her" on the status card; never "nothing about you on chain".
- "Proof made in this browser tab" (WP30 route); measured seconds carry the machine name in the record.
- "Simulated" captions: the second attested wallet (operator route), the disabled card onramp, the per-unit distribution without snapshot. "Manual" caption on revoke.
- No "first", no "only", no yield figure (the distribution is "10 mUSD", never a rate), no "KYC" in the app.
- Custody: the app states only what the docs say and attributes it to Privy. Never "no seed phrase means no custody question".
- Privy appears on screen only if this package is green (product.md rule).

Proposed on-screen sentence, verbatim, under the sign-in card: "Wallet by Privy: an embedded wallet created when you sign in with email, so you can hold the fund units and the stablecoin without a seed phrase. Privy describes it as self-custodial and never sees your identity evidence; it sees this address and the transactions you confirm. Sample identity from the official test wallet; testnet funds."

## 9. Size and review burden

Large. About 14 files: 1 contract, 1 test file, 1 deploy script, 1 shell script, 6 app files (provider, wallet hook, money card, chain hooks, mock twins, config), 2 ABI files, env example, README section, spec page, evidence record.

Decision points needing human judgment: (1) desk as the fund token's issuer versus a second minter in FundToken (this case keeps FundToken untouched); (2) distribution without snapshot, captioned, versus a snapshot token (too large); (3) Privy on anvil or Sepolia only; (4) the custody sentence.

Risks: `@privy-io/wagmi` changing connector behaviour for the dev signer and injected paths; the Privy iframe refusing anvil (fallback: Sepolia only); the Privy app and the Sepolia deployment arriving after the video freeze (then the desk ships with the dev signer, evidence L, and Privy is not shown).

Kill criteria: no Privy app id when the shot list is frozen; `@privy-io/wagmi` breaks existing specs and the fix is not obvious in one bounded task; the embedded wallet cannot produce the EIP-191 session signature; ETHGlobal answers that the entry is not eligible for Privy's open tracks.

Stretch, only if the base is green early: the issuer's distribution treasury as a Privy wallet owned by an authorization key (`@privy-io/node` 0.34.0) with a policy allowing only `FundDesk.distribute` on chain 11155111; that would meet the B2B control requirement. Needs TEE execution and the policy engine on the builder's plan (unverified).

## 10. Unverified

- Whether a new self-serve Privy app is TEE-enabled by default, and whether the policy engine is on the free plan (pricing matrix tick marks unreadable; docs silent).
- Whether the embedded wallet signs and broadcasts on anvil 31337 (custom chain without a block explorer, http RPC from the Privy iframe).
- Whether wagmi's `injected()` and the dev signer connectors coexist with `@privy-io/wagmi`'s connector state.
- Testnet behaviour of `useAddFunds` with the `crypto` deposit-address option.
- Whether the embedded wallet's `personal_sign` passes the bridge's address-proof check unchanged (expected yes; it is in Privy's signature list).
- Whether testnet gas sponsorship is free; not needed here (the investor pays Sepolia gas from faucet ETH, a builder step).
- Privy judging criteria beyond the requirement lists.

## 11. Rejected variants

- Subscribe only from the Privy wallet (spec-privy.md's minimum). Rejected: no money moves, the prize wording is met only by "other supported wallet actions", and the decision gates one step instead of every step. Kept as the fallback if the desk is cut.
- Privy's managed transfer action for the redemption payout from the issuer's wallet (`usdc` on `ethereum_sepolia`, REST). Rejected: the eligibility check would sit in our server before the API call, not on chain, which contradicts "the chain refuses"; it also needs an authorization key setup and the dashboard asset watchlist for NDF.
- Onramp-first story (card to stablecoin to subscription). Rejected: card onramps fail on testnets even in sandbox (docs), so the live part would be a mock that does not count; Circle's Sepolia USDC faucet (20 USDC per address every 2 hours) is real but slow for a demo, so the desk uses MockStable with a captioned one-click mint.
