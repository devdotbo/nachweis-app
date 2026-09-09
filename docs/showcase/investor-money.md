# Showcase, investor money: a fund desk for an investor who signs in with email

WP38, branch `wp38-investor-money`, case page `wiki/privy-cases/investor-money/case.md`. Status on 2026-09-10: class L green (local chain, no Privy app: `scripts/showcase-investor-money-local.sh` prints `SHOWCASE-INVESTOR-MONEY-LOCAL PASS`, and `--test` runs the browser spec green with the dev signer); class S (Sepolia with the builder's Privy app) not run. Nothing below with only local evidence is described as a Privy run or a deployment.

## 1. What it shows

A fund issuer takes a stablecoin subscription from, pays a distribution to, and redeems for an investor who has only an email address, because the investor's eligibility decision (EUDI evidence plus the issuer's approval) sits on chain against the wallet address and the desk checks it before every movement of money. The wallet is created at email sign-in (Privy embedded wallet, through the WP32 provider wiring); the money is a test stablecoin (mUSD, the repository's MockStable, 6 decimals) and demo fund units (NDF, 18 decimals, 1 mUSD per NDF). One revoke closes subscribe, claim and redeem; approve reopens them. The refusal is shown in plain words from a simulation with the investor's address, so nothing is signed for a transaction the chain would refuse.

Beats on screen (investor tab `/showcase/investor-money`, issuer tab `/issuer`): sign in; no decision yet, subscribe refused; present and approve on the investor portal (or the operator route); get 1,000 test mUSD; subscribe 100 mUSD (900 mUSD, 100 NDF); the issuer pays a distribution of 10 mUSD; claim (910 mUSD); redeem 50 NDF (960 mUSD, 50 NDF); revoke, then subscribe, claim and redeem refused with the reason; approve again, subscribe 100 mUSD (860 mUSD, 150 NDF: 50 from the desk's inventory, 50 minted).

Cut on purpose (lead's scope, 2026-09-09): the unit transfer beats and "Send stablecoin" from case.md section 5 (the FundToken hook is unchanged and tested), the Privy stretch (treasury as a Privy wallet under a policy), any onramp beyond a disabled, captioned button.

## 2. Parts

| Part | Where | What it does |
|---|---|---|
| FundDesk | `contracts/src/showcase/FundDesk.sol` (`onlyEligible` :82, `_eligible` :91, `subscribe` :119, `distribute` :146, `claim` :173, `claimAll` :183, `redeem` :203, `setToken` :72) | Deployed as the FundToken's `issuer`, so FundToken and Subscription are untouched. `subscribe` pulls mUSD and hands out NDF (desk inventory first, mint for the rest); `distribute` (owner only) pulls mUSD from the operator's treasury and records a per-unit payout over the units outstanding; `claim` and `claimAll` pay the caller's share; `redeem` takes units back at par. Every investor-facing function starts with `registry.isEligible(msg.sender, policyId, REQUIRED_BITS)` through the token. |
| Tests | `contracts/test/FundDesk.t.sol`, 19 tests | Eligible subscribe; no decision, evidence without approval, revoked and expired all refused with `NotEligible`; distribute only owner, no units outstanding; claim once, claim all, pro rata; the no-snapshot simplification named in a test; redeem math and inventory reuse; transfer to an unattested address refused by the token. |
| Deploy | `contracts/script/DeployFundDesk.s.sol` | Registry (or `REGISTRY_ADDRESS` to reuse the Sepolia registry with the proof verifier), MockStable (or `STABLE_ADDRESS`), FundDesk, FundToken with issuer = desk, `setToken`, ownership to `OPERATOR_ADDRESS`. Prints `AttestationRegistry:`, `MockStable:`, `FundDesk:`, `FundToken:`, `Operator:`. |
| Route and registry | `app/src/showcase/registry.ts` (main's list, one entry per demo), `app/src/showcase/ShowcaseRoute.tsx` (main's gallery and `/showcase/:slug`) | The entry `investor-money`; the page loads lazily and takes the investor wallet from `useWallet('investor')`. |
| Investor page | `app/src/showcase/investor-money/InvestorMoneyPage.tsx` | Sign in (the app's `ConnectCard`), eligibility from the registry, balances (mUSD, NDF, claimable), Get test mUSD, Subscribe, Claim, Redeem, receipts, captions. |
| Chain access | `app/src/showcase/investor-money/desk.ts` (`useDeskTx` :252, `send` :259, simulation :262, `refusalReason` :213) | Plain wagmi hooks; `VITE_DESK` is the only address, the desk reports its token and stablecoin. Each write is simulated with the caller's address first; the allowance is set once (max) when short. |
| Issuer panel | `app/src/showcase/investor-money/DeskPanel.tsx` (Pay distribution :55), mounted on the issuer console (`app/src/screens/IssuerScreen.tsx:90`) | Units outstanding, desk balance, distributions, the operator's treasury; Pay distribution 10 mUSD; Get test mUSD for the treasury. |
| Local run | `scripts/showcase-investor-money-local.sh` (`--keep`, `--app`, `--test`) | Section 4. |
| Browser spec | `app/e2e/showcase-investor-money.spec.ts` | The beats above, clicked with the dev signer; the operator's registry actions by `cast`; skipped on every other stack mode. |

Environment: `app/.env.example` gains `VITE_DESK` (optional). Unset: the route says so and the issuer console shows no desk panel. `VITE_PRIVY_APP_ID` and the rest are WP32's, unchanged.

## 3. Privy features used, with file and line references

Nothing was added to the Privy wiring; the desk reuses WP32 and the honesty facts in `docs/privy-standing-order.md` apply.

- Provider tree: `app/src/lib/PrivyBoundary.tsx` (`PRIVY_ENABLED` :14, `PrivyBoundary` :18) switches to `app/src/lib/PrivyWalletProvider.tsx` when `VITE_PRIVY_APP_ID` is set: `PrivyProvider` (:84) with `loginMethods: ['email']` (:87) and `embeddedWallets.ethereum.createOnLogin: 'users-without-wallets'` (:88), then `createConfig` from `@privy-io/wagmi` (:24). FACT (docs/privy-standing-order.md section 4): with the app id set, `@privy-io/wagmi` replaces the connector list, the dev signer disappears and the operator connects through Privy's wallet picker.
- Email sign-in: `app/src/lib/wallet.ts` option `privy-email` (:119 to :121, "Sign in with email, wallet by Privy"); disconnect is Privy's `logout()` (:163).
- Every investor write on the desk page goes through wagmi's `useWriteContract` (`desk.ts:254`, `:263`), which reaches the embedded wallet through the synced connector (`io.privy.wallet.<address>`, `wallet.ts:15`), so mint, allowance, subscribe, claim and redeem are each a confirmation in Privy's wallet UI. No second code path for Privy.
- Gas: gas sponsorship needs paid credits on the builder's app (dashboard fact of 2026-09-09), so the embedded wallet must hold Sepolia ETH; a builder step in section 5.
- Not used: Privy's swap, onramps (fail on testnets even in sandbox; the "Add funds by card" button is disabled and captioned simulated), Earn, the managed transfer action, signers and policies (WP32's case, not this one).

## 4. Local run (class L, no Privy app)

```
scripts/showcase-investor-money-local.sh          # about 5 s with the contracts built; prints SHOWCASE-INVESTOR-MONEY-LOCAL PASS
scripts/showcase-investor-money-local.sh --test   # browser spec with the dev signer, about 30 s; prints BROWSER SHOWCASE (investor-money) OK
scripts/showcase-investor-money-local.sh --app    # after the cast flow, starts the app for hand-clicking (URLs printed)
```

The cast flow: anvil on port 8552 (the port assigned to this demo; `ANVIL_PORT` overrides); `DeployFundDesk.s.sol` (operator and desk owner = anvil key 0); 1,000 mUSD each to the investor (anvil key 1) and the operator; subscribe refused before any decision (`eth_call`, `NotEligible`); `attestByOperator` with expiry chain time + 1 h; subscribe 100 (900 mUSD, 100 NDF); distribute 10 (claimable 10); claimAll (910); redeem 50 (960 mUSD, 50 NDF, desk inventory 50); revoke, then subscribe, claimAll and redeem refused with `NotEligible` and balances unchanged; approve, subscribe 100 (860 mUSD, 150 NDF, inventory 0, total supply 150). Record: `.e2e/showcase-investor-money/env.json` (addresses and every hash), `tx-N.json`, `deploy.log`; gitignored.

`--test` and `--app` also deploy `Deploy.s.sol` so the investor portal and the issuer console are configured (its registry is not the desk's; the app points at the desk's registry, where the investor is approved). Screenshots of the spec: `app/_preview/e2e/showcase-investor-money/01-refused-no-decision.png` to `06-reopened.png` (gitignored).

Measured 2026-09-10 on the builder's Mac (M3 Max): cast flow 4 s; browser spec 28 s. Caption for anything from these runs: "dev signer, local only"; never a wallet run, never a Privy run.

## 5. Runbook for the builder's Sepolia run (class S, hand-clicked)

Nothing below is done by an agent; values in angle brackets never go into a chat. Prerequisites: the Sepolia deployment of the product (handoff action 1: `Deploy.s.sol`, `DeployNoirVerifier.s.sol`, the bridge against Sepolia) and the browser flow working on Sepolia with the official test wallet.

1. Deploy the desk against the product's registry: `cd contracts && REGISTRY_ADDRESS=<registry> OPERATOR_ADDRESS=<operator> DEPLOYER_PRIVATE_KEY=<key> forge script script/DeployFundDesk.s.sol:DeployFundDesk --rpc-url sepolia --broadcast --verify`. The deployer must be the registry owner only if it deploys a fresh registry; with `REGISTRY_ADDRESS` the operator must already be set for the policy. Record the four addresses.
2. `app/.env`: `VITE_DESK=<FundDesk>` next to WP32's `VITE_PRIVY_APP_ID`, `VITE_CHAIN_ID=11155111`, the product addresses, `VITE_BRIDGE_URL`. Start the app (`bun run dev`, port 5173 is an allowed origin on the Privy app).
3. Investor tab, `/showcase/investor-money`: "Sign in with email, wallet by Privy", the email code; the card shows the embedded wallet address and "Embedded wallet by Privy". Send about 0.05 Sepolia ETH from the deployer to that address (gas sponsorship is not relied on).
4. Eligibility: on the investor portal (`/`) create the presentation request (the embedded wallet signs the session binding in Privy's modal, the bridge answers `address-proof` 200), present with the official test wallet, prove in the tab, attest. Issuer tab `/issuer`: "Connect operator wallet" (Privy's wallet picker, the extension with the operator key), Approve. Back on the desk: status "eligible". Record: session id, attest hash, approve hash. No email address in the record.
5. Get 1,000 test mUSD (one Privy confirmation). Subscribe 100 mUSD (two confirmations: allowance, subscribe). Expected 900 mUSD, 100 NDF. Record both hashes.
6. Issuer tab, Fund desk panel: Get 1,000 test mUSD for the treasury, Pay distribution 10 mUSD (allowance, distribute, from the operator wallet). Investor tab: claimable 10 mUSD; Claim (one confirmation): 910 mUSD. Record hashes.
7. Redeem 50 NDF (allowance, redeem): 960 mUSD, 50 NDF. Record hashes.
8. Issuer: Revoke. Investor: click Subscribe, Claim, Redeem; each shows "Refused by the chain: this wallet is not eligible, because the issuer revoked the decision for this address (manual revocation). Nothing was signed or sent." and Privy shows no modal. Record the sentence and the revoke hash.
9. Issuer: Approve. Investor: Subscribe 100 mUSD once more: 860 mUSD, 150 NDF. Record the hash.
10. Fill the evidence template (section 6) into `docs/evidence/showcase-investor-money-YYYY-MM-DD.md`.

Unverified until this run: `@privy-io/wagmi` 4.0.17 with the embedded wallet on Sepolia in this app (WP32 is also class L only); whether Privy's confirmation modal shows the decoded call; the wording of a Privy refusal if the wallet has no ETH.

## 6. Evidence template (class S)

Never an email address, never the app secret, never a dashboard screenshot with a secret visible.

| Field | Value | Label |
|---|---|---|
| Date and time (local) | | |
| Privy app id (not the secret), environment | | live |
| FundDesk, FundToken, MockStable addresses; registry reused | | live |
| Embedded wallet address | | live |
| Session id, attest hash, approve hash | | live |
| Mint hash; subscribe: allowance hash, subscribe hash; balances after | | live |
| Distribute: allowance hash, distribute hash; claimable read | | live |
| Claim hash; balance after | | live |
| Redeem: allowance hash, redeem hash; balances after | | live |
| Revoke hash; the refusal sentence verbatim for subscribe, claim, redeem; Privy modal shown: no | | live |
| Approve hash; second subscribe hash; balances after | | live |
| Number of Privy confirmations clicked in total | | live |
| Versions: `@privy-io/react-auth`, `@privy-io/wagmi`, bun, browser | | |
| Deviations from this runbook | | |

## 7. On-screen sentences touching identity or custody, verbatim

- Under the sign-in card, only with the Privy app id (`InvestorMoneyPage.tsx:20`): "Wallet by Privy: an embedded wallet created when you sign in with email, so you can hold the fund units and the stablecoin without a seed phrase. Privy describes it as self-custodial and never sees your identity evidence; it sees this address and the transactions you confirm. Sample identity from the official test wallet; testnet funds."
- Without the app id: "Dev signer or extension in this build (no Privy app id). With VITE_PRIVY_APP_ID set this step reads "Sign in with email, wallet by Privy" and the wallet is an embedded wallet created at sign-in."
- Eligibility card (`:23`): "No identity documents on chain, and nothing we could use to find you: the desk reads a policy id, predicate bits and an expiry against this address."
- The refusal after revoke (`desk.ts:213`): "Refused by the chain: this wallet is not eligible, because the issuer revoked the decision for this address (manual revocation). Nothing was signed or sent."
- Captions line: "official test wallet, sample identity; the proof is made in the browser tab on the investor portal; the distribution is paid per unit over the balance at claim time, without a snapshot (simulated); revocation is manual, by the issuer; the stablecoin is a test token anyone can mint; the desk keeps redeemed units as inventory and hands them out on the next subscription. Amounts are demo constants; the distribution is an amount, not a rate."
- The app's own connect card, when connected through Privy (`app/src/components/ConnectCard.tsx:43`, WP32): "Embedded wallet by Privy, created at email sign-in. Your identity evidence never goes to Privy. The signer never sees the wallet's private key (Privy's statement)."

No "first", no "only", no yield figure, no "KYC" anywhere on the page.
