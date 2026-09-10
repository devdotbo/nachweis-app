# The Swap door: a Uniswap v4 permissioned pool in the investor portal

Door two of "one permission, two doors". The investor swaps the demo stable for the fund token in a Uniswap v4 permissioned pool from the investor portal, with the connected wallet. The pool's hook asks the Attestat registry before the swap; after the issuer revokes, the same Swap is refused and the portal shows the revert in words.

Evidence class of the runs and numbers on this page: L (local). The pool runs on an anvil fork of Sepolia against the Uniswap contracts deployed there (`contracts/src/uniswap/UniswapSepolia.sol`). Numbers were measured on the builder's M3 Max on 2026-09-09.

Since 2026-09-10 the same pool also exists on Sepolia itself (chain id 11155111, record [deployments/sepolia-2026-09-10.md](deployments/sepolia-2026-09-10.md), not verified on Etherscan): pool id `0x5ea00f1b6307f536f4880101648c0428df57a3e645cbb60c25e00a0ba29cbec7`, adapter [0xc440aD626959d97a689Ba0465f2F1eD293a0b20D](https://sepolia.etherscan.io/address/0xc440aD626959d97a689Ba0465f2F1eD293a0b20D), checker [0x967A701c99D467EB9d6192bE87D4742c90aF7046](https://sepolia.etherscan.io/address/0x967A701c99D467EB9d6192bE87D4742c90aF7046), mUSD [0x645476358892F920991e544394EA24fF6Df5204A](https://sepolia.etherscan.io/address/0x645476358892F920991e544394EA24fF6Df5204A). The stack attaches to it without anvil: `scripts/browser-real-wallet-up.sh --deployment docs/deployments/sepolia-2026-09-10.md` (`demo-runbook.md`, "Sepolia run"); the Sepolia swap and refused swap are in `evidence/sepolia-journey-2026-09-10.md` if present.

## Run it

Two ways. Both need a Sepolia RPC for the fork (`SEPOLIA_RPC_URL`; default `https://ethereum-sepolia-rpc.publicnode.com`) and the tool pins of `docs/demo-runbook.md` (foundry 1.7.1, bun).

Pool only, no app (24 s):

```
scripts/pool-local.sh [--keep]
```

What it does, in order: `anvil --fork-url <Sepolia> --chain-id 31337`; `Deploy.s.sol` (registry, FundToken, Subscription); `CreatePermissionedPool.s.sol` with `REGISTRY_ADDRESS` and `FUND_TOKEN_ADDRESS` (the six onboarding steps: `EudiAllowlistChecker` on the local registry, adapter through Uniswap's factory, venue decision and 1 wei deposit, verification, wrappers and hook approved, `PoolManager.initialize`, swapping enabled); `AddLiquidityPermissioned.s.sol` (full range, 1000 NDF and 1000 mUSD through the PermissionedPositionManager); then two assertions with anvil account 2 as a probe: attested and approved, `SwapPermissioned.s.sol` swaps 1 mUSD (`POOL_PROBE_AMOUNT`, raw units with 6 decimals, default 1000000; 0 skips both probe swaps) for NDF through the permissioned Universal Router; revoked by the operator, the same script fails in simulation with `Unauthorized` inside `PermissionedHooks.beforeSwap`. The probe is small on purpose: the pool stays nearly untouched, so the investor's first 100 mUSD swap in the app still quotes a fresh pool. Anvil account 1 (the app's investor) is left untouched.

Expected output (2026-09-09, fork block 11664502):

```
[5s] anvil http://127.0.0.1:…, chain 31337, fork block 11664502, Uniswap permissioned-pool contracts present
[8s] registry 0x…, FundToken 0x…, subscription 0x…
[11s] checker 0x… (reads 0x…), adapter 0x…, stable 0x…, pool id 0x…
[18s] liquidity 999000000000000 (position 9), slot0: 79228162514264337593543950336000000 276324 0 3000
[20s] eligible probe 0x3C44…93BC: swapped 1000000 mUSD raw units for 996005988017964053 NDF wei through the permissioned router
[24s] revoked probe: swap refused (Unauthorized inside PermissionedHooks.beforeSwap, see .e2e/pool/swap-revoked.log)
[24s] wrote .e2e/pool/pool.json and .e2e/pool/pool.env
POOL-LOCAL PASS
```

`.e2e/pool/pool.json` holds every address, the pool id and key, the fork block and the liquidity; `.e2e/pool/pool.env` holds the four `VITE_POOL_*` lines for the app. Logs of the three forge runs are next to them. `--keep` leaves anvil running for a hand-driven app (`VITE_CHAIN_ID=31337`, `VITE_RPC_URL` from pool.json, the registry addresses from pool.json, and the pool.env lines).

The app stack with the pool (the Playwright run):

```
scripts/app-e2e-local.sh --mode sp1-mock --pool --test
```

`--pool` makes the stack's anvil a Sepolia fork with chain id 31337 and calls `pool-local.sh --attach` after `Deploy.s.sol`, so the pool's checker reads the stack's registry. The Vite dev server gets the `VITE_POOL_*` lines and `.e2e/app/env.json` gets a `pool` object. `--test` then runs the specs: `sp1-mock.spec.ts` (the proof route through the bridge, ends with the investor approved) and `swap.spec.ts` (this door). Without `--pool` the swap spec is skipped and the door shows its placeholder.

## What the screen shows

Investor portal, card "Two doors, one decision", the Swap tile (`app/src/components/swap/SwapDoor.tsx`):

- Pool line: `NDF/mUSD`, the fee in percent from `StateView.getSlot0`, the adapter address. Status chip open or closed from `registry.isEligible` and `adapter.swappingEnabled`.
- You send: 100 mUSD, the fixed demo input (`SWAP_AMOUNT_IN` in `app/src/components/swap/config.ts`), and how much the wallet holds. The demo stable is `MockStable`, mintable by anyone on the test chain; the door mints the shortfall itself as the first step and says so.
- You receive: "about 90.48 NDF" after the 1 mUSD bring-up probe ("about 90.65 NDF" on an untouched pool), computed in the page from `getSlot0` and `getLiquidity` with the single-range constant-product formula (`quoteExactIn` in `calldata.ts`). The V4Quoter deployed next to the permissioned contracts cannot quote this pool (below). The estimate matched the script's swap to the wei on the fresh pool, and the investor's first swap on the stack to four decimals (90.480376 NDF received, 2026-09-10).
- The question: `isEligible(you, policy, bits)` with the policy id and bits read from the checker, and three answers as flags: registry (`isEligible`), checker (`checkAllowlist`, "swap and liquidity allowed" for `0x0003`, "no flags" for `0x0000`), adapter (`isAllowed(you, SWAP_ALLOWED)`).
- Swap button. Enabled whenever a wallet is connected and the pool reads succeeded, also when the door is closed: the refusal is the point of the demo.
- Result: the step chips (faucet, ERC-20 approve to Permit2, Permit2 allowance for the router, `UniversalRouter.execute`), then either `swap confirmed` with the hash, gas and "Sent 100 mUSD, received 90.48 NDF", or `swap refused` with the hash of the reverted transaction and a note in words, plus a details block with the decoded revert layers and the raw data.

Under the doors, the panel (`SwapExplainer.tsx`): the pool as the chain sees it (pool id, currencies, fee and tick spacing, hook and whether the adapter allows it, checker and the registry it reads and whether that is this app's registry, policy and bits, liquidity and what the PoolManager holds, price and tick, swapping enabled, router and whether it is an allowed wrapper) and five sentences on how the permissioned pool decides (factory, adapter, hook, checker, registry, router, unwrap). All read from the contracts on every 8 s poll.

Refusal wording (from `explainRevert` in `calldata.ts`): the ERC-7751 `WrappedError(target, selector, reason, details)` from the PoolManager is unwrapped; target `PermissionedHooks` and selector `beforeSwap` give the title "Refused by PermissionedHooks.beforeSwap"; the inner `Unauthorized()` gives "this address is not SWAP_ALLOWED. The hook asked the adapter, the adapter asked the checker, the checker asked the registry: isEligible(you, policy, bits) is false right now. After the issuer approves again, the same swap goes through." `SwappingDisabled`, `HookNotAllowed`, `TransactionDeadlinePassed`, `NotEligible(address)` (the FundToken's own gate on delivery), `ExecutionFailed` and `UnexpectedRevertBytes` have their own sentences; unknown selectors show the raw data.

How the swap is sent (`useSwap.ts`): `eth_call` of the exact `execute` calldata first. Clean: `sendTransaction` from the connected wallet, receipt awaited, balances read before and after. Reverted: the revert data is decoded into the words above, and the same transaction is sent anyway with a fixed gas limit of 800,000 so the refusal is mined and has a hash (a wallet that refuses to send a reverting transaction leaves "not sent" next to the decoded reason). Both outcomes land in the investor's History card as "Swapped in the permissioned pool" or "Swap refused by the pool".

Honesty captions on the panel, verbatim from the product rules: "No identity documents on chain, and nothing we could use to find her." and "(manual revocation)". The proof origin is not on this card; the Eligibility card carries it.

## Facts about the Uniswap side that the door relies on

- The hook asks its caller for the account behind the call (`msgSender()`, selector `0xd737d0c7`, present in the deployed `PermissionedHooks` bytecode) and the adapter whether that account is `SWAP_ALLOWED`. The permissioned Universal Router implements `msgSender()`; the `V4Quoter` at `0x61B3…9227` does not (`eth_call` of `msgSender()` reverts with no data), so `quoteExactInputSingle` on this pool reverts for every caller with `UnexpectedRevertBytes(WrappedError(hook, beforeSwap, 0x, HookCallFailed))`, although the quoter is allow-listed as a wrapper in onboarding step 5. Checked on the fork 2026-09-09 (`cast call` with and without `--from`). Item 18 in `FEEDBACK.md`.
- The refusal is `WrappedError(0x5124…e8c0, 0x575e24b4, Unauthorized(), HookCallFailed())` from the PoolManager, passed through the router unchanged; the fork test `contracts/test/PermissionedPoolSwap.fork.t.sol` expects the same bytes.
- Fee 3000 (0.30 percent), tick spacing 60, initial price one NDF per mUSD (tick 276324 with the stable as currency0), full-range liquidity 999000000000000 after the mint's 0.1 percent haircut.

## Evidence template

Copy into `docs/evidence/swap-<date>.md` after a run.

```
# Swap door, local pool run <date>

Class: L (anvil fork of Sepolia, chain id 31337). Machine: <machine>. Fork block: <from pool.json>.
pool-local.sh: <seconds> s, POOL-LOCAL PASS. Adapter <0x>, checker <0x>, pool id <0x>, liquidity <n>.
Playwright (scripts/app-e2e-local.sh --mode sp1-mock --pool --test): sp1-mock.spec <pass/fail>, swap.spec <pass/fail>, <seconds> s.
Swap from the page: tx <hash>, gas <n>, sent 100 mUSD, received <n> NDF; estimate shown before: about <n> NDF.
Revoke from the console: tx <hash>.
Refused swap from the page: tx <hash> (status reverted), title "Refused by PermissionedHooks.beforeSwap", inner Unauthorized().
Screenshots: app/_preview/e2e/sp1-mock/06-swap-open.png, 07-swap-confirmed.png, 08-issuer-revoked-for-swap.png, 09-swap-refused.png (copied to docs/ui/ as investor-11…, investor-12…, issuer-07…, investor-13…).
Not done: Sepolia broadcast; step 7; a sell direction (NDF in).
```

## Files

- `scripts/pool-local.sh`: the pool on the fork, the assertions, pool.json and pool.env.
- `scripts/app-e2e-local.sh`: `--pool` (fork anvil, attach the pool, `VITE_POOL_*`, `pool` in env.json).
- `contracts/script/CreatePermissionedPool.s.sol`, `PermissionedPoolScriptBase.s.sol`: accept chain id 31337 next to 11155111.
- `app/src/components/swap/`: `config.ts` (env, Uniswap Sepolia addresses, pool key and id), `abi.ts` (ABI subsets), `calldata.ts` (V4_SWAP calldata, the quote, revert decoding), `useSwap.ts` (pool state, the three answers, the swap), `SwapDoor.tsx`, `SwapExplainer.tsx`, `swap.css`.
- `app/src/components/DoorsCard.tsx` renders the tile and the panel; `app/src/lib/receipts.ts` knows `swap` and `swapRefused`; `app/src/lib/journey.ts` marks the Swap step done after a swap.
- `app/e2e/swap.spec.ts`: the Playwright run; `app/e2e/stack.ts` types the `pool` object.
