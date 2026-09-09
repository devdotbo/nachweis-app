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
