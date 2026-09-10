---
type: handoff
title: Morning brief, 2026-09-11: state of both repos, what is on Sepolia, what is proven, what only the builder can do
updated: 2026-09-10
status: Written 2026-09-10 late evening by the lead's teammate after the Sepolia journey run
sources:
  - nachweis-app/docs/deployments/sepolia-2026-09-10.md (addresses, 33 transactions, gas)
  - nachweis-app/docs/evidence/sepolia-journey-2026-09-10.md (the no-phone journey on chain 11155111, balances, "Not established here")
  - nachweis-app/docs/evidence/browser-pool-journey-2026-09-10.md (the fork journey on the same tree)
  - nachweis-app/docs/demo-runbook.md ("Video run order (2026-09-10)" and "Sepolia run (2026-09-10, deployed)")
  - nachweis-app/contracts/src/AttestationRegistry.sol (attestWithProof docstring, _store at lines 216 to 224)
  - git in nachweis-app and nachweis, 2026-09-10 about 21:30 Vienna; gates run on app 2f826a1
---

# Morning brief, 2026-09-11

Self-contained. Nothing is pushed. No agent read a key. The deadline is Sunday 2026-09-13 18:00 Vienna (submission-checklist.md:19); check-in 2 is optional and due Friday 2026-09-11 05:59 Vienna (decisions.md "2026-09-10 morning").

## State of the repositories (FACT, git 2026-09-10 evening)

- nachweis-app main 2f826a1: the Sepolia deployment record (57a4be5), the Sepolia journey evidence (7a2272d), README, runbook, swap door and AI attribution linking that evidence, docs/wiki re-copied at wiki 1567c42. Tree clean, not pushed, repository still PRIVATE on GitHub.
- nachweis (this wiki) main 1567c42 plus this page: shot list with the caption gate met, submission text with the swap and refused-swap hashes, decisions and log for the evening. Two untracked transcript .txt files in the root stay untracked.
- nachweis-site main 3bbd038 (unchanged since the morning merge).

## What is on Sepolia (FACT, chain 11155111, deployed 2026-09-10 18:59 UTC, blocks 11676804 to 11676836)

- AttestationRegistry https://sepolia.etherscan.io/address/0xeD46dC419e826c9Fdf16aADe1C9e3e970cc8ad53; FundToken NDF https://sepolia.etherscan.io/address/0x8Ef00746fc2508B01CC8bBCDd0e161598eC9792f; Subscription https://sepolia.etherscan.io/address/0x1542515f5E8a00BF087bEcdeEdfC4c9Bd68569fb; NoirPidVerifier (pinned to the sandbox PID issuer) https://sepolia.etherscan.io/address/0x44970b304f5e0E53A2cD32a6064da8bE951b757A; MockStable mUSD https://sepolia.etherscan.io/address/0x645476358892F920991e544394EA24fF6Df5204A; EudiAllowlistChecker https://sepolia.etherscan.io/address/0x967A701c99D467EB9d6192bE87D4742c90aF7046; PermissionsAdapter https://sepolia.etherscan.io/address/0xc440aD626959d97a689Ba0465f2F1eD293a0b20D. Uniswap's own PoolManager, PermissionsAdapterFactory, PermissionedHooks, Universal Router, PositionManager and Permit2 at their published Sepolia addresses (deployment record, "Addresses"). Pool id 0x5ea00f1b6307f536f4880101648c0428df57a3e645cbb60c25e00a0ba29cbec7, 1000 NDF plus 1000 mUSD full-range liquidity, position 9.
- Deployer (owner, issuer, operator, liquidity provider) https://sepolia.etherscan.io/address/0x452A376805821aD33D2F01c9134Ba5E26455900a: 1.1107 ETH after the journey.
- Investor https://sepolia.etherscan.io/address/0x067269c03186B890a6a00D0cd0F2E510AD6FD947: 0.04897 ETH, 190.652862473832711386 NDF, 100 mUSD; attested by operator and approved (re-approved at the end of the journey), so both doors are open for it right now.
- Nothing is source-verified on Etherscan (no API key); the pages show bytecode only.

## What is proven (FACT)

- Fork journey, nachweis-app/docs/evidence/browser-pool-journey-2026-09-10.md: the complete no-phone journey on an anvil fork of Sepolia at 7c4a3bc, dev signers, attest, approve, subscribe, swap, revoke, subscribe refused NotEligible() 0xf8eb54de, swap refused in PermissionedHooks.beforeSwap three times (CLI, portal click, Playwright spec).
- Sepolia journey, nachweis-app/docs/evidence/sepolia-journey-2026-09-10.md: the same journey on Sepolia itself with the deployment's keys, 14 transactions, blocks 11676873 to 11676892. Swap https://sepolia.etherscan.io/tx/0x59b0408d2e06a325cdc9f64586e8b3900b5271681d51118a20f84a9efa375474 (100 mUSD for 90.652862473832711386 NDF, quote "about 90.6528 NDF"), revoke https://sepolia.etherscan.io/tx/0xa63ff4f0cbc42dfe978698f309caf5b31a3fd33d5b9ab6f4536cabb004e50a2c, refused swap https://sepolia.etherscan.io/tx/0xc6961750ab233d890a107091a981f059242138ec4d11e3e2b985a127479aff17 and refused portal click https://sepolia.etherscan.io/tx/0x0533c47764a469ae443cf58dc092b1528c9a6bf07f4cbcf313375ab91a847d8a (both status 0, decoded PermissionedHooks.beforeSwap Unauthorized). Attest, approve, subscribe and re-approve hashes are in the evidence file and in decisions.md "2026-09-10 evening". Investor spend for the whole journey 0.00103 ETH.
- Gates on app 2f826a1 (2026-09-10 evening): forge test --offline 155 passed, 0 failed, 20 skipped (fork suites need an RPC); automation bun test 19 pass, 0 fail; app typecheck 0 errors; app build clean (one pre-existing chunk-size warning); doc link check 81 files, 128 links, 0 broken; docs/wiki grep: no /Users path, no secrets path, no key value.
- Caption gate for the video: met. Beats 7 and 8 of video-shotlist-spine.md are captioned "Sepolia"; the fork wording is the explicit fallback if the Sepolia take fails on the day.

## What is unverified

- The phone leg on Sepolia: QR scan by the official wallet over the tunnel, relay pickup, bb.js proof in the tab, attestWithProof against the sandbox-pinned NoirPidVerifier on chain 11155111. The recorded journey used a stub verifier, no tunnel, and attestByOperator. The last phone run is browser-real-wallet-2026-09-08.md on an earlier commit and a local fork.
- QuickTime mirroring of the iPhone on this Mac (shot list, "The iPhone on screen").
- attestat.dev hosting; the repository visibility flip; the check-in 1 status.

## Phone rehearsal on Sepolia (the builder, with the phone; runbook "Sepolia run" and "Video run order")

Terminal A, repo root, the builder's gitignored .env holding SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, INVESTOR_PRIVATE_KEY, INVESTOR_ADDRESS (no anvil, no forge script; the real relay verifier behind the cloudflared tunnel, the bridge in local mode with REQUIRE_ADDRESS_PROOF=true, the app with VITE_CHAIN_ID=11155111; every click waits for a Sepolia block, 8 to 15 s):

```
scripts/browser-real-wallet-up.sh --deployment docs/deployments/sepolia-2026-09-10.md
```

Wait for `tunnel answers` and the `BROWSER-REAL-WALLET UP` block, then one Chrome tab at the printed app URL, no reload for the whole take: (1) Investor, Connect dev signer; (2) Create presentation request, Prove in this browser, the QR appears; (3) phone: scan with the official test wallet, consent, present; the tab ends on "attested from this browser" (this is the unverified step; the proof is submitted by attestWithProof on Sepolia); (4) header Issuer, Approve; (5) header Investor, Subscribe, the NDF balance rises; (6) Swap: the faucet chip passes without a transaction when the investor already holds mUSD, then approve, Permit2, execute; (7) Issuer, Revoke; (8) Investor: doors closed, Subscribe greyed, click Swap, "swap refused" with the Etherscan link. Afterwards `scripts/browser-real-wallet-down.sh`. Record the run as docs/evidence/sepolia-phone-<date>.md from the g0 template.

Address choice, decide before the take (FACT, AttestationRegistry.sol): the recorded investor 0x0672… is already attested and approved. attestWithProof overwrites the decision and leaves the approval untouched (_store, lines 216 to 224), so on that address step 4 changes nothing visible; and a revoked decision cannot be reopened by proof (docstring above attestWithProof), so revoking first is not an option. For a take that shows every state change, use a fresh investor key: new INVESTOR_PRIVATE_KEY and INVESTOR_ADDRESS in .env, send it about 0.02 Sepolia ETH from the deployer (`cast send <address> --value 0.02ether --private-key $DEPLOYER_PRIVATE_KEY --rpc-url $SEPOLIA_RPC_URL`), and the page mints mUSD from the faucet on the Swap click because the balance is 0. With the recorded investor the journey still runs, but attest and approve are no-ops on chain.

## Builder-only list, in order

1. The phone leg above (rehearsal, then the take). If it fails, the fork take per the shot list with the fork caption; nothing else in the shot list changes.
2. Recording per wiki/video-shotlist-spine.md: 2 to 4 minutes, 720p or better, own voice, no speedup, not recorded on a phone; Etherscan pages replace the cast terminal in beats 7 and 8.
3. Push both repositories and make nachweis-app public (the wiki stays private; docs/wiki is the copy at 1567c42, re-copy after any wiki edit with `bun scripts/wiki-copy.ts the wiki repository <commit>` and commit). Move the transcript .txt files out first (handoff-2026-09-10-morning.md, "Builder-only tasks").
4. ETHGlobal form with the Uniswap track: paste from wiki/submission-text.md (Sepolia variant selected, Privy not claimed); fill the video and live links; fix DISCLOSURE.md title, docs/ai-attribution.md:14 and the commit count first ("Before pasting, check").
5. Uniswap feedback form: wiki/uniswap-feedback-form.md with nachweis-app/FEEDBACK.md.
6. Optional check-in 2 by Friday 05:59 Vienna: wiki/checkin-2026-09-11.md.
7. The Privy decision: yes means a green Privy-mode run on Sepolia recorded in evidence plus beat 9; no means Privy appears nowhere (the current default). Decide before recording.
8. The pre-existing-work notice to ETHGlobal (draft wiki/track-decision.md:126-147), not sent as of 2026-09-09.

## Risks

- The contracts are not source-verified on Etherscan (no API key). Judges see bytecode and our record; `ETHERSCAN_API_KEY` in .env and `scripts/sepolia-deploy.sh` (verification step) fix this, or leave it and say so.
- A wrong click on the deployer wallet costs Sepolia ETH only (1.11 ETH left, the journey cost 0.0014 ETH in total); no mainnet key is involved anywhere.
- One tab, no reload, one uninterrupted stack for the whole take (in-memory sessions and receipts); a reload restarts the take at beat 1.
- The Sepolia quote in the take differs from 90.65 NDF because the recorded swap moved the pool; the receipt on screen is the record.
