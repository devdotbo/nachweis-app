# Screens

Screenshots of the app's main states (WP31, product UI). Taken with `app/e2e/ui-shots.ts` against a mock-mode dev server (`VITE_MOCK=1`: in-memory verifier, bridge and chain, fake delays, mock wallet), except the files named `anvil-…`, which the Playwright stacks took (anvil, verifier-service, bridge with PROOF_MODE=mock, dev signer; the `swap` files on an anvil fork of Sepolia with the Uniswap permissioned pool, `docs/swap.md`).

| File | State |
|---|---|
| investor-01-connect | investor portal, nothing connected: every later section locked with its empty state |
| investor-02-connected | wallet connected, present step current |
| investor-03-presenting | session created and signed, QR and openid4vp link |
| investor-04-attested | evidence on chain, awaiting issuer approval; doors closed; proof-origin caption |
| investor-05-permitted | issuer approved; permitted; Subscribe open |
| investor-06-subscribed | subscribe receipt, holdings row, history |
| investor-07-revoked | issuer withdrew approval; both doors closed; rail marks the approval step failed |
| investor-08-mobile | 390 px viewport, revoked state |
| investor-09-anvil-sp1-mock-permitted | the Playwright stack on anvil after the issuer approved |
| investor-10-anvil-browser-proved | the browser-mode stack on anvil: proof made in the tab by bb.js, attested |
| issuer-01-locked | issuer console before the operator wallet is connected |
| issuer-02-queue | queue with one session attested and awaiting approval, decisions table, event history |
| issuer-03-approved | after Approve: receipts, decisions row approved, both doors open, Approved event |
| issuer-04-revoked | after Revoke from the decisions table |
| issuer-05-mobile | 390 px viewport |
| issuer-06-anvil-sp1-mock-approved | the Playwright stack on anvil after Approve |
| investor-11-anvil-swap-open | the Playwright stack on an anvil fork of Sepolia with the permissioned pool (`--pool`): the Swap tile open, the estimate, the three answers of registry, checker and adapter, the pool panel |
| investor-12-anvil-swap-confirmed | after Swap from the dev-signer wallet: receipt with hash and gas, sent and received amounts, the four steps; rail marks Swap done; History lists the swap |
| issuer-07-anvil-revoked-for-swap | the issuer console after Revoke by address, the Revoked event |
| investor-13-anvil-swap-refused | the same Swap after the revoke: door closed, the three answers no, `swap refused` with the reverted transaction's hash and the decoded WrappedError in words |

Regenerate: start `VITE_MOCK=1 bun run dev -- --port 5199` in `app/`, then `APP_URL=http://127.0.0.1:5199 bun run e2e/ui-shots.ts`.

## Showcase demos (WP40)

Taken with `app/e2e/showcase-shots.ts` at 1440 px wide (full page) against the local stacks of the showcase scripts: anvil, the demo's service in local mode, the Vite dev server with the dev signer. Evidence class L everywhere: no Privy app, no public chain, no wallet, no phone. The proof side is the mock verifier or `attestByOperator` (simulated evidence). `SHOT=<flow> APP_URL=<app> bun run e2e/showcase-shots.ts`; the header of the script lists the stack per flow.

| File | State |
|---|---|
| showcase-index | the /showcase route listing the four demo routes (any stack) |
| showcase-backoffice-queue-refusal | `/showcase/backoffice` after `scripts/showcase-backoffice-local.sh --keep`: queue with the approve (2 of 2, confirmed on chain), the revoke and the reverted approve for a stranger; the 1 wei transfer probe refused by the simulated policy; receipts and registry events |
| showcase-payout-desk-runs-refusal | `/showcase/payout-desk` after `scripts/showcase-payout-desk-local.sh --keep`: run 1 executed (100 mUSD paid, contractor 2 refused by GatedPayout), run 2 refused after the revoke, run 3 refused over the cap; "Pay directly" refused by the simulated policy; log |
| showcase-investor-money-permitted | `/showcase/investor-money` after `scripts/showcase-investor-money-local.sh --app`: dev signer connected, eligible, Subscribe clicked from the page (allowance and subscribe receipts, 250 NDF) |
| showcase-investor-money-refused | the same page after `cast send revoke` by the operator: revoked, three doors closed, Subscribe clicked: "Refused by the chain ... manual revocation. Nothing was signed or sent." |
| showcase-savings-plan-open | `/showcase/savings-plan` after `scripts/showcase-savings-plan-local.sh --app`, then Attest Investor A by the operator (fresh decision) and Run the month: four doors open, run #7 subscribed |
| showcase-savings-plan-revoked | after Revoke Investor A: the decision revoked, four doors closed, the plan's deny-all rule |
| showcase-standing-order-issuer-log | `/issuer` on the stack of `scripts/standing-order-local.sh --keep` (automation in local mode, `VITE_AUTOMATION_URL`): the automation section with the two policies in plain words and the tick log (TICK OK, POLICY DENY-ALL ADDED after a `cast send revoke`, TICK DENIED by the policy and by the chain). The investor portal's standing-order card is not in this set: it renders only with `VITE_PRIVY_APP_ID`, and with the app id the dev signer is not offered, so the card with a policy is a Privy run (class S, pending) |
| showcase-zkpassport-card | `/` on the stack of `CHAIN_ID=11155111 scripts/zkpassport-local.sh --keep` with `VITE_ZKPASSPORT=1` and the mock adapter: the passport card after "Prove with the zkPassport app": QR code and request from the zkPassport service (dev mode, mock passports accepted), "waiting for the zkPassport app"; no phone scanned it. Chain id 11155111 on a plain anvil (no fork) so the SDK can bind the chain name; the history shows the script's mock-root attest, approve and revoke |
