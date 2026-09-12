# Integration map: one combined journey (2026-09-09, read-only analysis)

Root R = nachweis-app. All cites below are relative to R unless absolute. Every claim FACT with path:line unless marked OPINION.

## 1. Beats as they exist today

| Beat | Component and code | Runs via | Chain assumed | Identity bound |
|---|---|---|---|---|
| Connect crypto wallet | ConnectCard renders wallet.options: privy-email, privy-connect, dev signer, injected (app/src/lib/wallet.ts:117-152); no WalletConnect | any stack | per VITE_CHAIN_ID (app/src/config.ts:33, default Sepolia; every script sets 31337, scripts/browser-real-wallet-up.sh:180) | wallet.address, kind-agnostic |
| Present: session bound to address, EIP-191 session signature | PresentCard: createRequest(address), boundAddress: address (app/src/components/PresentCard.tsx:50-51); signature :37; bridge POST address-proof (app/src/bridge.ts:41) | browser-real-wallet-up.sh, bridge REQUIRE_ADDRESS_PROOF=true (:171-174) | anvil 31337, plain, no fork (:129) | wallet.address (dev signer K1 0x7099...79c8 in the script, :58) |
| Phone scan, official wallet | g0-up.sh relay verifier plus cloudflared tunnel (scripts/g0-up.sh:41-44, :116); up.sh calls it (:103), probes relay (:115-126) | browser-real-wallet-up.sh only | none | none |
| Prove in Noir in the tab | BrowserProveCard; bound address into circuit inputs at app/src/prover/prover.worker.ts:71; re-checked against public inputs (app/src/lib/browserProver.ts:197); COOP/COEP from app/vite.config.ts:14-17 | same | none | session.boundAddress (browserProver.ts:125) |
| Attest | tab POSTs proof to bridge (browserProver.ts:202-206); bridge signs attestWithProof with OPERATOR_PRIVATE_KEY (service/src/chain.rs:208, :240); registry requires publicInputs[0] == subject (contracts/src/AttestationRegistry.sol:166), permissionless (:155-160) | bridge in every stack | bridge RPC_URL | subject = bound address; sender = operator key K0 |
| Awaiting approval | statusOf (hasDecision, approved false) (AttestationRegistry.sol:198-205); doors closed (docs/evidence/browser-real-wallet-2026-09-08.md:15) | app | | |
| Issuer approve | IssuerScreen useRegistryTx(wallet.address) (app/src/screens/IssuerScreen.tsx:27); approve via wagmi writeContractAsync (app/src/lib/chain.ts:222); onlyOperator (AttestationRegistry.sol:114) | /issuer route, role by path (app/src/lib/role.ts:8-11) | same chain | connected wallet; dev operator K0 = anvil key 0 (up.sh:182, Deploy.s.sol:24,:32) |
| Money beat A: swap | SwapDoor in DoorsCard (app/src/components/DoorsCard.tsx:48); signs with useWalletClient (app/src/components/swap/useSwap.ts:170); mUSD faucet mint (:182); needs VITE_POOL_ADAPTER and VITE_POOL_STABLE (app/src/components/swap/config.ts:65-69) from pool.env (scripts/pool-local.sh:185-190); router, Permit2, hooks hard-coded Sepolia (config.ts:16-26) | pool-local.sh or app-e2e-local.sh --pool | Sepolia fork (chain id 31337, pool-local.sh:99,:104-108) or Sepolia (PermissionedPoolScriptBase.s.sol:55-58) | connected wallet (K1 in app-e2e-local.sh:191) |
| Money beat B: subscribe | DoorsCard subscribe() (DoorsCard.tsx:41, chain.ts:224); gate on msg.sender (contracts/src/Subscription.sol:25); mints 100 NDF, no payment (:26) | every stack | any | connected wallet |
| B variant: standing order | StandingOrderCard needs VITE_PRIVY_APP_ID and VITE_AUTOMATION_URL and kind privy (StandingOrderCard.tsx:41-43); automation tick sends subscribe() as Privy delegated signer (automation/src/tick.ts:48, automation/src/signer.ts:88-99) | standing-order-local.sh (local signer mode) | 31337 local, 11155111 privy mode (automation/src/config.ts:43) | Privy embedded wallet |
| Revoke | RevokeByAddress.tsx:18, IssuerPending.tsx:60; chain.ts:223; sets approved false (AttestationRegistry.sol:127-128) | /issuer | same | operator wallet |
| Refusal named on screen | Swap: preflight then send anyway with 800k gas (useSwap.ts:211-227); decoded "PermissionedHooks beforeSwap Unauthorized" plus registry/checker/adapter sentence (app/src/components/swap/calldata.ts:138-157; SwapDoor.tsx:69-84). Subscribe: revert NotEligible shown only as viem shortMessage (chain.ts:232-233), contract not named | | | |

Recorded so far with the official wallet: connect dev signer, present, scan, prove 42.8 s, attest, approve, subscribe, on plain anvil; swap not clicked, Sepolia not done (docs/evidence/browser-real-wallet-2026-09-08.md:13-17, :26).

## 2. Seams

1. Two stacks, no union. browser-real-wallet-up.sh: plain anvil (:129), Noir verifier pinned to the sandbox key (:155-156), tunnel, checker deployed by forge create (:159-160), but no pool, no mUSD, no fork. app-e2e-local.sh --pool: forks Sepolia (:110), runs pool-local.sh --attach on the same registry (:124-129), feeds pool.env to Vite (:191), but pins the verifier to the companion stub issuer (:137-139) and starts no tunnel (no g0-up call in the file). No script gives official wallet plus pool on one chain.
2. Address identity in-app is consistent. wallet.address is taken once (app/src/screens/InvestorScreen.tsx:24) and passed to PresentCard, DoorsCard, StandingOrderCard (:66, :70, :71); prove, subscribe and swap all use the wagmi account. The swap door has never been clicked by the address that was bound with the official wallet (evidence :26). The pool-local probe swapper is K2, not the app's K1 (pool-local.sh:55-61); the app path is exercised only by Playwright swap.spec.ts (app-e2e-local.sh --pool --test).
3. Privy is the app's wallet for everything when the app id is set, not only the standing order: @privy-io/wagmi keeps no connector of ours, so dev signer and plain injected vanish (app/src/lib/PrivyWalletProvider.tsx:1-7); investor role auto-activates the embedded wallet, issuer role the external wallet (app/src/lib/wallet.ts:109-113). Consequences: the issuer console must then approve and revoke from an external wallet holding the operator key through Privy's picker, or run a second Vite instance without the app id. Embedded wallet on chain 31337 unverified (docs/privy-standing-order.md:158-166); allowed origins only localhost 5173 and 4173 (:103) while up.sh picks a free APP_PORT (:62-66); embedded wallet needs ETH for gas (:103, :113), no script funds it.
4. Revoke propagation is one contract read, no glue. Checker returns registry.isEligible (contracts/src/uniswap/EudiAllowlistChecker.sol:60), Subscription reads the same (Subscription.sol:25), both immediate after revoke (AttestationRegistry.sol:124-130, :187-191), provided the checker was constructed with that registry (pool-local.sh --attach --registry). The Privy policy mirror is a separate watcher process (automation/src/watch.ts:99-111).
5. No deploy-all. Deploy.s.sol deploys registry, FundToken, Subscription only (contracts/script/Deploy.s.sol:31-36); Noir verifier separate (DeployNoirVerifier.s.sol:40-46); pool via CreatePermissionedPool, AddLiquidityPermissioned (pool-local.sh:124-144). pool-local.sh refuses anything but chain id 31337 (:104-108), so a Sepolia run is eight hand-run forge commands (docs/demo-runbook.md:390-397), about 12 M gas (:380).
6. "Pays a subscription" is not a payment. subscribe() takes nothing and mints (Subscription.sol:23-28). The priced subscribe (approve mUSD, then subscribe(amount)) exists only in the investor-money showcase FundDesk on /showcase/investor-money with its own deploy (app/src/showcase/investor-money/desk.ts:312-323, DeployFundDesk.s.sol), not on the investor portal.
7. Subscribe refusal is not named on screen; only the swap refusal names the contract (calldata.ts:151-157 versus chain.ts:232-233).

## 3. Variants

Common core (both variants): a --pool (or --fork) flag in browser-real-wallet-up.sh mirroring app-e2e-local.sh:110 and :124-129 and :191 (fork anvil, pool-local.sh --attach with the up.sh registry, POOL_ENV into Vite). About 15 lines in one script, no app or contract change. Decision point: none. Unverified: pool-local.sh --attach against a fresh fork with the sandbox-pinned verifier (never run together); fork RPC rate limits on publicnode.

Variant A, swap as the money beat.
- Files: scripts/browser-real-wallet-up.sh (core glue). Optional: docs/swap.md evidence record, docs/video-shotlist.md beat 4 and 6 already describe this beat (:22, :26).
- Glue: none in app; SwapDoor already mounts without a flag (DoorsCard.tsx:48; placeholder when env absent, SwapDoor.tsx:107-119).
- Signer: dev signer K1 for investor, K0 for issuer, both in-page, no pop-ups (up.sh:182). OPINION: keep dev signers for the video; MetaMask or Privy adds pop-ups and the Privy seam 3.
- Unverified until run: mUSD faucet plus Permit2 plus swap from K1 in a hand-clicked session (only Playwright so far); sell direction absent (docs/swap.md:81); quote via V4Quoter reverts, app uses its own estimate (:63).
- Day risks: fork RPC (publicnode) stalls during recording; proof 42.8 s hand-clicked (evidence :14); COOP/COEP only from vite.config.ts:14-17 (fine on localhost, unverified on any host); tunnel and iPhone wallet unchanged from the 2026-09-08 run.
- Diff scope: small, one script. Decision points: 1 (dev signer versus real wallet on screen).

Variant B, subscription as the money beat.
- B1, subscribe() as is: no glue at all; runs on plain anvil today. Honest caption required: "mints 100 NDF, no payment" (StandingOrderCard.tsx:155 already says so). Refusal after revoke shows only a viem message (seam 7): one small change in DoorsCard or chain.ts to decode NotEligible and name Subscription. Decision points: 1 (accept the free-mint wording, or not).
- B2, priced subscription: wire FundDesk (approve mUSD, subscribe(amount)) into the investor portal, or record the beat on /showcase/investor-money with a second deploy (DeployFundDesk.s.sol) and the same registry. Diff: medium (one new door component or a route hop, env for FundDesk and mUSD, up.sh deploy line). Decision points: 2 (which surface; whether the showcase caption "demo built on the toolkit" is acceptable in the spine).
- B3, standing order with Privy: adds seam 3 in full (issuer wallet, origins, 31337 unverified, gas funding). OPINION: not for the spine; show as a separate showcase clip if at all.
- Day risks for B: none from RPC on plain anvil; Privy variants carry the unverified list at docs/privy-standing-order.md:158-166.

OPINION: A is the smaller and stronger journey (the refusal names PermissionedHooks on screen, Uniswap track evidence, already in the shot list). B1 is the fallback if the fork misbehaves on the day.

## 4. Sepolia versus fork with honest captions

- Sponsor text in the wiki: Uniswap requires public repo, FEEDBACK.md, the form, README line pointers, and says entries are audited (wiki/sponsors.md:19-21); no sentence requires a testnet deployment. Privy: working demo plus source, features may be mocked but do not count (:34). The event summary says "live (not mocked) integrations" across tracks ([event wiki, local, withheld]). Whether a Sepolia fork counts as live for Uniswap: unverified in the wiki (1inch explicitly allows local forks, :145; Uniswap says nothing).
- Own rules: Sepolia hashes on screen only after hand-clicked runs; otherwise caption "local chain" or "Sepolia fork" (docs/video-shotlist.md:33; handoff decision 2). submission-text.md:40 and :72 carry [deploy] placeholders that stay honest without Sepolia.
- OPINION on need: strictly needed on Sepolia, nothing, given the wiki's facts; the fork uses the real Uniswap bytecode at the published addresses (sponsors.md:19) and can be captioned as such. What Sepolia adds: Etherscan-visible hashes, the [deploy] sentences, and the Privy embedded wallet path (only viable on Sepolia, seam 3). Cost of Sepolia: eight manual forge steps, about 12 M gas, funded keys, private RPC (docs/demo-runbook.md:380-397), bridge and app env rewiring, and a second hand-clicked phone run on the new chain; every one of those is unverified until run.

## Builder decisions required

1. Money beat: swap (A) or subscription (B1 free mint, B2 priced FundDesk).
2. Investor wallet on screen: dev signer, MetaMask, or Privy embedded (Privy forces Sepolia and an external issuer wallet).
3. Chain for the recording: Sepolia fork with caption, or Sepolia with the eight-step manual deploy and funded keys.
4. Whether the Subscribe refusal must name the contract on screen (small app change) for variant B.
5. Whether the standing order appears in the spine or only as a separate showcase clip.
