---
type: memo
agent: sponsor-integration
title: Minimum sponsor integrations for an EUDI attestation service (ETHOnline 2026)
fetched: 2026-09-06
method: WebFetch of primary docs and GitHub sources (URLs listed per section), gh api code search, plus the local wiki pages [event wiki, local, withheld], [event wiki, local, withheld], [event wiki, local, withheld], [local path, withheld] and the underlying memo [local path, withheld] Nothing was deployed, registered or contacted.
---

# Sponsor integration memo: EUDI attestation service

Scope. The service: a Rust verifier receives an OpenID4VP presentation of a sandbox state-issued PID, reduces it to predicates (over 18, resident DE or EU, valid, not revoked) and writes a revocable, wallet-bound attestation on Sepolia. Consumers read the attestation. This memo answers, per candidate sponsor track, the minimum technical integration, its effort size, and whether the integration is verified from primary docs.

Labels: FACT (fetched or read by me today, source and date given), COUNT (measured), CLAIM (secondary source, mostly the 2026-09-06 sponsor-capabilities memo by another teammate, which itself read docs), OPINION (own judgment). "Unverified" means I could not confirm it.

Common assumption for all tracks. The attestation registry is one contract, `AttestationRegistry`, on Sepolia, with a view like `isEligible(address wallet, bytes32 predicateSet) returns (bool)` and events `Attested`, `Revoked`. Every consumer below is a thin adapter over that view. Where a sponsor lives on another chain (Hedera, Arc), the verifier writes a second copy of the attestation to a registry on that chain; the verifier already holds the signer key, so "multi-chain write" is a config change plus gas, not a design change (OPINION).

---

## 1. Uniswap v4 Permissioned Pools on Sepolia

Sources (all fetched 2026-09-06):
- Deploy guide: https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/deploy-a-permissioned-pool (served via http://developers.uniswap.org/llms.mdx/docs/protocols/v4-hooks/permissioned-pools/deploy-a-permissioned-pool)
- Overview: https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/overview
- Architecture: https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/architecture
- Trading API for permissioned pools: https://developers.uniswap.org/docs/trading/swapping-api/swapping-permissioned-pools
- Allowlist form: https://developers.uniswap.org/permissioned-pools-allowlist
- IAllowlistChecker: https://raw.githubusercontent.com/Uniswap/v4-periphery/main/src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol
- PermissionFlags: https://raw.githubusercontent.com/Uniswap/v4-periphery/main/src/hooks/permissionedPools/libraries/PermissionFlags.sol
- PermissionsAdapterFactory: https://raw.githubusercontent.com/Uniswap/v4-periphery/main/src/hooks/permissionedPools/PermissionsAdapterFactory.sol

FACT (deploy guide). Seven steps: (1) implement an allowlist checker, (2) create the Permissions Adapter, (3) allowlist and fund the adapter, (4) verify the adapter, (5) approve virtual token contracts, (6) create the pool, (7) allowlist your pool for routing.

FACT (deploy guide). Sepolia addresses: PermissionsAdapterFactory 0xE6B0d96919334C33d06266d1420F97f6f434fA2B (matches the prior fetch), PermissionedPositionManager 0xf99D553912084c99F6299291b75Fe9B7119Aa1A7, PermissionedHooks 0x51247E2291d290d17C08813A175AC86465EdE8c0, Universal Router 0x54C707Df83f03bc9cA64ED2CcF9C99B63FD854b7, V4Quoter 0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227, MixedRouteQuoterV2 0x4745F77b56a0E2294426E3936dc4Fab68d9543Cd. Mainnet: factory 0x7DA911490Ca4663E572eA9C8154f3CdEbCE16452, PositionManager 0x63Bd7e5D4EcfAA74d82AE1dE98F476C935a81973, Hooks 0x499a724AB630549f14C995EC41a8E04fA3fd28c0, Universal Router 0x0542093271A31f6FC1DADB232bd59eeb27de780F.

FACT (IAllowlistChecker.sol). The checker interface is `interface IAllowlistChecker is IERC165 { function checkAllowlist(address account, address tokenAddress) external view returns (PermissionFlag); }`. PermissionFlag is a `bytes2` user type; constants NONE 0x0000, SWAP_ALLOWED 0x0001, LIQUIDITY_ALLOWED 0x0002, ALL_ALLOWED 0xFFFF (PermissionFlags.sol). The checker must also implement `supportsInterface`.

FACT (PermissionsAdapterFactory.sol). `createPermissionsAdapter(IERC20 permissionedToken, address initialOwner, IAllowlistChecker allowListChecker) external returns (address)` has no access modifier; anyone can call it. `verifyPermissionsAdapter(address)` is also unrestricted but requires the adapter to hold a non-zero balance of the permissioned token (guide: "The amount can be as little as 1 wei", via `depositForVerification(1)`), which requires that the caller controls the permissioned token's allowlist so the adapter can receive it.

FACT (deploy guide, step 5). The issuer approves four wrappers on the adapter with `updateAllowedWrapper(address, true)`: Permissioned Position Manager, Universal Router, V4Quoter, MixedRouteQuoterV2, and enables the hook with `updateAllowedHook(IHooks(permissionedHooks), true)`. "Swapping is disabled by default on a new adapter" (the owner must enable it). The PoolKey uses the adapter as currency0 (not the underlying token) and the PermissionedHooks address; "The hook reverts on initialization unless at least one currency is a verified adapter."

FACT (architecture). `beforeSwap` checks SWAP_ALLOWED for the swapper and reverts while swapping is paused; `beforeAddLiquidity` checks LIQUIDITY_ALLOWED; the Universal Router "creates a virtual version of it before the pool interaction" and "converts back to the original token automatically on exit"; "Permissioned swap routing requires Universal Router 2.2.0 or higher." Only issuer-approved wrappers can create virtual tokens.

FACT (overview). "anyone can create a pool"; no Uniswap Labs approval is mentioned for deployment.

FACT (deploy guide, step 7, and the allowlist form). Routing in the Uniswap interface and Trading API requires allowlisting with Uniswap Labs: "To be eligible for routing in the Uniswap interface and API, your permissioned pool must be allowlisted with Uniswap Labs. Once your adapter is verified, request allowlisting with the details below, and the team follows up to complete onboarding." The form asks for name, email, Telegram, company, token issuer identity, chain(s), CoinGecko link, permissioned token address, verified adapter address, KYC URL, notes. No turnaround stated; testnet not excluded but not mentioned. The Trading API returns `isPermissioned`, `isAllowlisted`, `kycUrl`, `issuer` for permissioned tokens. Step 7 is therefore only needed for interface or API routing, not for an on-chain swap from a script (OPINION, consistent with steps 1 to 6 being fully on-chain and permissionless).

Fit for the attestation service. The checker is the natural consumer: `checkAllowlist(account, token)` returns SWAP_ALLOWED when `AttestationRegistry.isEligible(account, EU_ADULT)` is true and the attestation is not revoked, otherwise NONE. Revocation propagates on the next swap attempt with no extra work. The permissioned token itself must be an ERC-20 that restricts transfers (the adapter must be on "your token's allowlist"), so a small restricted ERC-20 (for example "eEUR-test") whose `_update` consults the same registry is needed; this is not in the guide but follows from step 3 (OPINION).

Minimum integration: (a) a restricted ERC-20 that allowlists the adapter and the registry-eligible wallets, (b) the checker contract (about 30 lines), (c) a Foundry script doing factory.createPermissionsAdapter, transfer 1 wei, verifyPermissionsAdapter, four updateAllowedWrapper calls, updateAllowedHook, enable swapping, initialize the pool with PermissionedHooks, add liquidity through the PermissionedPositionManager, (d) one swap through Universal Router 0x54C7... from a script (UR command encoding for a v4 swap plus the permissioned wrap path; no SDK example found in the fetched pages, so the exact command sequence is unverified), or a minimal UI through the Trading API, which needs step 7 with Uniswap Labs.

Effort: medium for (a) to (c) plus a swap script; the swap encoding through the Universal Router with the virtual-token wrap is the uncertain part (the docs say the router does it automatically, but no code sample for a raw UR call was fetched). Large if the demo must go through the Uniswap interface (depends on Labs onboarding, no SLA).

Verified from docs: yes for steps 1 to 6 and addresses. Unverified: raw UR swap calldata, testnet acceptance of the routing form. Gate: step 7 needs Uniswap Labs; the FEEDBACK.md and feedback form are audited requirements (prizes page).

Kill criterion: if the Sepolia PermissionsAdapterFactory call or the hook initialization reverts against a fresh restricted token after one day of trying, fall back to a plain v4 hook that reads the registry in `beforeSwap` (still a Uniswap stack contribution, weaker story).

---

## 2. ENSv2 on Sepolia: Permissioned Resolvers and Enhanced Access Control

Sources (fetched 2026-09-06):
- https://docs.ens.domains/ensv2/permissioned-resolver
- https://docs.ens.domains/ensv2/enhanced-access-control
- https://docs.ens.domains/ensv2/tutorial-app-developers
- https://docs.ens.domains/learn/deployments (Sepolia ENSv2 beta section)
- https://github.com/ensdomains/contracts-v2/issues/418
- ENS beta blog (ecosystem-status wiki, read 2026-08-31): https://ens.domains/blog/post/ensv2-beta-public-testing

FACT (permissioned-resolver). Each account gets its own resolver instance as a UUPS proxy. Delegation functions: `authorizeNameRoles(toName, roleBitmap, account, grant)`, `authorizeTextRoles(toName, key, account, grant)`, `authorizeDataRoles(...)`, `authorizeAddrRoles(...)`. `grantRoles()` and `revokeRoles()` are disabled on the Permissioned Resolver. Role constants: ROLE_SET_ADDR 1<<0, ROLE_SET_TEXT 1<<4, ROLE_SET_CONTENTHASH 1<<8, ROLE_SET_ALIAS 1<<28 (root only), ROLE_SET_DATA 1<<36, ROLE_UPGRADE 1<<124; admin variant is role<<128. Documented example: `authorizeTextRoles(dnsName, 'avatar', dappAddress, true)` then the delegate calls `setText(node, 'avatar', ...)`.

FACT (enhanced-access-control). Roles are a uint256 bitmap, lower 128 bits regular, upper 128 admin, one nybble per role, max 15 holders per role per resource; `hasRoles(resource, roleBitmap, account)` checks both the resource and ROOT_RESOURCE. "The contracts and interfaces described here are not yet final and may change prior to mainnet deployment."

FACT (deployments page, Sepolia ENSv2 Beta, 34 contracts listed in my fetch): PermissionedResolverImpl 0x9eae5c2730a7dd16bdd1dee6421a1b91e3b0365e, VerifiableFactory 0x10dc6333cdfe1fcef624c6e0a8221b91804cd7ef, UserRegistryImpl 0x624a25d67b59d587752ebec8dded8827dae52050, ETHRegistry 0xbdc85dd5b15d7ecb354cd7cb6f2c50b4f2c4f0e2, ETHRegistrar 0xa88553f454b77203b0d036a05c894d555eaaa2cc, UniversalResolverV2 0x4a1817d13e9cf196f471725176355c1234b63c70, UpgradableUniversalResolverProxy 0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe, PublicResolverV2 0xe7b9a25607e02da8145e4eb1836ca539e53f11f7, MockUSDC 0x768f42455a2d082e23ceef7d51e5787c82d67a39. No dates or stability notes on the page.

FACT (app tutorial). Writing records is done by calling `setText()` on the resolver directly (or ensjs `setTextRecord`); apps read via `getEnsText()` through the Universal Resolver at a fixed address on mainnet and Sepolia; "ENSv2 contracts (not yet final)".

CLAIM (sponsor-capabilities memo, which read the docs and repos on 2026-09-06). Beta since 2026-08-12 with a fresh deployment; registration fees are paid in MockUSDC; write support in libraries is "limited to preview releases"; ens-cli is not on npm and cannot grant roles; contracts-v2 main address file is stale; Immunefi audit competition runs to 2026-09-14.

FACT (issue 418, opened 2026-08-21, open, no comments). Delegated EAC roles survive ERC-1155 ownership transfer; an attacker who was delegated resolver or subregistry roles keeps them after the name is sold. For our use this is a feature risk rather than a blocker: an eligibility delegate on a name persists across a sale, so the verifier must revoke or the consumer must check the current owner (OPINION).

Answer to the question. Yes on both counts, verified from docs: the name owner (or the verifier acting as the owner of a subname it issues) calls `authorizeTextRoles(name, "eu.eligibility", verifierAddress, true)` on the user's Permissioned Resolver, then the verifier calls `setText(node, "eu.eligibility", "adult-eu:1;rev:0x...")` and later overwrites it on revocation. A contract can read it by calling `text(node, key)` on the resolver (standard ENSIP-5 interface; any consumer contract that already knows the resolver address can call it directly) or through UniversalResolverV2 `resolve`. Whether PublicResolverV2 (the default for beta-registered names) supports `authorizeTextRoles` is unverified; the documented path is a Permissioned Resolver deployed through VerifiableFactory, so the demo should deploy one for the demo name.

Minimum integration: register a name on Sepolia (fees in MockUSDC, free mint), deploy a Permissioned Resolver via VerifiableFactory for the demo account, set it as the resolver, delegate ROLE_SET_TEXT on one key to the verifier, have the verifier write the record after attestation, and have one consumer read it (a script or the registry consumer). Cleaner variant: the verifier owns `eligible.<demo>.eth` as a UserRegistry subname registry and issues expiring, non-transferable subnames to attested wallets, so revocation is `unregister` (CLAIM from memo for the subname recipes).

Effort: small to medium. The write and read are one call each; the setup (registry, resolver proxy, roles) is where beta friction lands. No official example repo exists (CLAIM).

Verified from docs: yes for the role API and the addresses; unverified for the tooling path (preview library releases, ens-cli no role grants) so plan for raw viem or Foundry calls.

Beta stability: OPINION, usable for a demo but expect breakage. Evidence: contracts "not yet final", an open hijack issue (418), the audit competition still running through 2026-09-14, libraries writing only in preview releases.

Kill criterion: if a Permissioned Resolver cannot be deployed and delegated on Sepolia within one working session using raw calls, downgrade ENS to a plain text record written by the name owner (cosmetic, likely not prize-worthy) or drop the track.

---

## 3. Chainlink CRE Confidential Workflows

Sources (fetched 2026-09-06):
- https://docs.chain.link/cre/concepts/confidential-workflows
- https://docs.chain.link/cre/guides/workflow/using-confidential-workflows/making-workflow-confidential-ts.md
- https://docs.chain.link/cre/account/confidential-workflows-access
- https://docs.chain.link/cre/guides/operations/simulating-workflows
- https://docs.chain.link/cre/supported-networks-ts.md
- https://docs.chain.link/cre-templates/hello-confidential-workflows
- https://docs.chain.link/cre/guides/workflow/using-confidential-http-client
- https://docs.chain.link/cre/reference/cli

FACT (concepts). "A Confidential Workflow is a CRE workflow that designates part of its logic to run inside a secure enclave, a running instance of a Trusted Execution Environment (TEE)". "Confidential Workflows is in private beta and requires enrollment through your Chainlink account team." "Workflows are isolated from one another by Wasmtime. Dedicated per-workflow enclave isolation is planned." Secrets are decrypted inside the enclave at the moment of use via the Vault DON.

FACT (access page). Access form: https://docs.google.com/forms/d/e/1FAIpQLSdk8mxDZAXpEX1PHgjzCoBeKxSoQysoO9sxOb-gpBrDrjOhtA/viewform. "After submitting your request, you don't need to wait for early access. Your CRE organization can run Confidential Workflows using the local simulator." The private beta is "separate from the deploy access required for regular CRE workflows." No review time stated.

FACT (making-workflow-confidential-ts). `handlerInTee(trigger, callback, teeConstraint)`; TeeRuntime has `getSecret`, `getSecrets`, `usingTheDons()`, `log`. `HTTPClient.sendRequest(runtime, ...)` accepts the TeeRuntime; "ConfidentialHTTPClient has no TeeRuntime overload here". "Data passed to usingTheDons() is no longer confidential". TEE constraint `{}` means any registered TEE; example `[{ tee: "nitro", regions: ["us-west-2"] }]`. Step 5 is just `cre workflow simulate`; the page does not say whether the simulator uses a real enclave. Logging inside the enclave is discouraged in production.

FACT (hello template page). Pattern: handlerInTee, getSecret in enclave, HTTP call from the enclave, `usingTheDons()` then `donRuntime.report(...)`, optional `evmClient.writeReport(donRuntime, report)` with Sepolia RPCs pre-configured in project.yaml. Simulate command: `cre workflow simulate my-workflow --target staging-settings --non-interactive --trigger-index 0`. Languages: TypeScript and Go.

FACT (simulating-workflows). Simulation compiles to WASM and "runs it on your machine". "By default, the simulator performs a dry run for onchain write operations. It prepares the transaction but does not broadcast it." `--broadcast` sends real transactions.

FACT (supported networks). Ethereum Sepolia and Arc Testnet are both listed as supported networks for the TS SDK (Sepolia from v1.0.1, Arc Testnet from TS SDK v1.3.1).

CLAIM (sponsor-capabilities memo). Triggers, chain reads and chain writes "always execute on Workflow DON nodes, never inside the enclave"; AWS Nitro in us-west-2 is the only registered TEE; EVM writes go through a KeystoneForwarder into a consumer contract that extends ReceiverTemplate; TS SDK 1.18 (2026-08-06) is the first with handlerInTee.

FACT (prize brief, prizes wiki). A CLI simulation is accepted as evidence; the handler must be `handlerInTee` and must process at least one sensitive input inside the enclave.

Answers. HTTP from inside the workflow to the verifier: supported (HTTPClient with TeeRuntime). Write to a Sepolia contract: supported, but only from the DON side after `usingTheDons()`, through the forwarder into a receiver contract; the AttestationRegistry therefore needs an `onReport(bytes metadata, bytes report)` entry point that the forwarder calls (CLAIM for the exact interface, template-based). In simulation, use `--broadcast` to get a real Sepolia transaction.

Is the TEE story honest? OPINION, with the following FACT-based constraints. What the enclave protects is the handler's computation and the secrets it fetches; what crosses to the DON is visible to node operators. If the workflow's HTTP call fetches the verifier's raw output (PID attributes such as birth date and address) inside the enclave, computes predicates there, and passes only the predicates and wallet address to `usingTheDons()`, then "the DON and the chain never see the PID attributes" is true. "Nobody sees the PID" is not true: the Rust verifier that terminates OpenID4VP and validates the SD-JWT or mdoc sees the PID by necessity, and the CRE trigger payload (if an HTTP trigger is used) runs on DON nodes, not in the enclave (CLAIM). An honest sentence: "The attestation decision runs in a hardware enclave; the oracle network and the chain see only the predicates and the wallet address." The stronger claim "the verifier runs in a TEE" would require porting the OpenID4VP verification into the TS or Go handler, which is out of scope for a week (OPINION). Also note the simulator runs on the developer's machine; nothing about a real enclave is demonstrated by a simulation, so the demo evidence proves the code path, not the isolation.

Minimum integration: a TS workflow with a cron or HTTP trigger; handlerInTee fetches a verifier API token as a secret, calls the verifier's `GET /pending-attestations` (or `POST /reduce` with the presentation id), computes or receives predicates, crosses to the DON with `{wallet, predicateSet, expiry}`, and `evmClient.writeReport` into the registry's receiver entry point. Run `cre workflow simulate ... --broadcast` against Sepolia, capture logs and the transaction hash.

Effort: medium. Pieces: cre login and org (regular account, no deploy access needed for simulation), one workflow file, one receiver function on the registry, secrets.yaml plus .env, one simulated run with broadcast. The forwarder-to-registry wiring (which address is trusted as forwarder in simulation) is the uncertain part, unverified.

Verified from docs: yes for the handler API, simulation, Sepolia support, gating. Unverified: exact receiver contract interface for simulated broadcasts, and whether simulation with `--broadcast` works for a handlerInTee workflow without beta enrollment (the access page implies simulation is fully available).

Kill criterion: if `cre workflow simulate --broadcast` cannot land a report in the Sepolia registry within one working session, keep the workflow as an off-chain predicate reducer (still a valid Confidential Workflow submission) and let the Rust verifier write the attestation directly.

---

## 4. Privy

Sources (fetched 2026-09-06):
- https://docs.privy.io/wallets/actions/swap/overview.md
- https://docs.privy.io/wallets/actions/transfer/overview.md
- https://docs.privy.io/wallets/overview/chains.md
- https://docs.privy.io/basics/react/advanced/configuring-evm-networks.md
- https://docs.privy.io/controls/key-quorum/overview.md
- https://docs.privy.io/organizations/overview.md
- Prize brief text in the prizes wiki (2026-09-06 payload)

FACT (swap overview). Swap supports EVM mainnets (Ethereum, Optimism, BNB, Unichain, Polygon, Monad, World Chain, Tempo, Robinhood Chain, Base, Arbitrum), Solana, and EVM testnets Unichain Sepolia, Monad Testnet, Robinhood Testnet, Sepolia, Base Sepolia. Fees: Privy swap fee up to 0.25 percent, protocol fee, gas (needs sponsorship for approvals), cross-chain relayer fees. No gating statement on the page.

FACT (transfer overview). Testnets: Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, Polygon Amoy, Tempo Moderato, Robinhood Testnet, Solana Devnet. Assets: ETH, SOL, POL, TRX, USDC, USDC.e, USDT, USDT0, USDB, USDG, pathUSD, EURC; custom ERC-20s via the dashboard asset watchlist.

FACT (chains overview). Ethereum "includes EVM-compatible networks" at the send-transactions tier; managed transfer, swap and earn flows need that tier. No mention of Arc or chain id 5042002.

FACT (configuring EVM networks). Custom chains are supported: "you can still use Privy with it per the steps below" using viem `defineChain` with name, chain id, native currency, RPC URLs and explorer. So an embedded wallet can sign and send on Arc testnet 5042002 with a custom chain definition; managed swap and transfer flows do not cover Arc (not in their lists).

FACT (key quorum overview). "an advanced feature", contact the team to discuss suitability; m-of-n over authorization keys and users, one level of nesting. No pricing statement on the page. CLAIM (memo): the pricing page puts key quorum approvals under Enterprise while the endpoints are public; whether a free Core app can create quorums is unverified.

FACT (organizations overview). Organization wallets are owned by a default key quorum; asynchronous approvals through intents; "arbitrary quorum-based approvals". No availability statement on the page. CLAIM (memo): organization wallets need a sales contact per the pricing page; policies and intents are documented REST endpoints usable from any app.

FACT (prize brief). Best financial flow requires one functional flow using a "generally available" feature (transfers, bridging, stablecoin conversions, swaps, Earn vaults, onramps). B2B track requires an organization use case plus one control (policies, signers, key quorums, or intents).

Minimum integration, Best financial flow: React app with PrivyProvider (Sepolia in supportedChains), user logs in, gets an embedded wallet, the app requests the EUDI attestation for that wallet address (verifier flow), then, once `isEligible` is true, the app executes a swap on Sepolia through the swap action (quote then execute) or a transfer of test USDC. The attestation gate is app logic plus, if the destination is the Uniswap permissioned pool, contract-enforced. Effort: small for the wallet plus transfer; small to medium for the swap (needs a Sepolia token pair with liquidity that Privy's swap provider routes; whether a self-deployed test token routes is unverified, so use a standard Sepolia pair such as ETH to USDC if the provider has it, unverified).

Minimum integration, B2B: a server-side organization wallet whose withdrawal policy allows `transfer` only to addresses that hold an attestation. Privy policies evaluate calldata conditions, not external contract state, so the gate must be enforced off-chain (the app checks the registry before creating the intent) or on-chain by the consumer contract; the demo-able Privy control is a policy plus an intent approval (agent proposes, compliance officer approves). Effort: medium; gated risk on organizations and key quorums for a free app (unverified).

Verified from docs: yes for chains, swap and transfer on Sepolia, custom chain config. Unverified: plan gating of quorums and organizations, routing of custom tokens in swap.

Kill criterion: if the swap action cannot quote a Sepolia pair from the dashboard-configured app within an hour, replace the flow with a transfer of Sepolia USDC (also generally available per the brief) and keep the track.

---

## 5. World Selfie Check

Sources (fetched 2026-09-06):
- https://docs.world.org/world-id/sandbox/sandbox-access.md
- https://docs.world.org/world-id/sandbox/testing-selfie-check.md
- https://docs.world.org/world-id/credentials/11.md
- https://docs.world.org/api-reference/developer-portal/verify.md

FACT (sandbox access). Prerequisites: Developer Portal account and a test device. iOS: install TestFlight, in the Portal select "World ID Sandbox", submit the Apple Account email, await approval, accept the TestFlight invite. Android: submit the Google account email, request tester access, wait for the grant. Integration: `environment: sandbox` in IDKit, proofs go to `https://developer.world.org/api/v4/verify/${rp_id}`. Contact for rejections: sandbox.access@toolsforhumanity.org. "Proofs are non-production." No approval time stated.

FACT (testing selfie check). "Selfie Check (Beta) must be enabled for your app before you can test it." Test states hot, cold, semi-cold; the iOS semi-cold flow is limited (no path to add the invite code after tapping "Sign in").

FACT (credential 11). Selfie Check is "medium-assurance", "does not provide a strict one-person-one-account guarantee", "returns a proof of the completed check, not a numeric Sybil or uniqueness score", valid 90 days of inactivity, "access-gated. To use it, request access ... so the feature flag can be enabled for your app." No field names beyond the proof.

FACT (verify API). v4 response items carry `identifier` (e.g. "selfie"), `issuer_schema_id`, `nullifier`, `expires_at_min`, `proof`; the success response includes `nullifier`, `results[]` per credential, `action`, `environment`. No `verification_level` is constructed; rate limits not specified.

CLAIM (memo). Feature flag requested via developers@worldcoin.com; a 4.0 preset with a `sybil_score` claim was merged 2026-09-02 but is unreleased on npm; the Sandbox app is a separate TestFlight build.

Can it serve as a low-assurance tier with caps? Yes in design: the nullifier is stable per action, so the registry can hold a second attestation type `SELFIE_LOW` keyed by nullifier with per-wallet caps (for example a daily withdrawal limit) while `EU_ADULT` from the PID lifts the cap. The verify response gives exactly one usable field for that, the nullifier. Effort if access exists: small to medium (IDKit widget, one verify call from the Rust verifier or a Node sidecar, one more attestation type, the feedback document the track requires).

Access by Sep 8: unverified, two sequential gates (sandbox enrollment approval, then the Selfie Check feature flag by email) with no stated SLA; both requests must go out today (the lead decides whether to send them). OPINION: plan as an optional tier, not a load-bearing one.

Kill criterion: no TestFlight invite and no feature flag by the evening of 2026-09-08 (Europe time) means World is dropped from the submission's three picks.

---

## 6. The Graph

Sources (fetched 2026-09-06):
- https://thegraph.com/docs/en/supported-networks/sepolia/ (network id `sepolia`, `eip155:11155111`, quick start guides for Subgraphs and Substreams present)
- http://thegraph.com/docs/en/subgraphs/developing/deploying-publishing/publishing-a-subgraph/
- Prize brief text (prizes wiki)

FACT. Sepolia has its own supported-network page with Subgraph and Substreams quick starts, so Subgraph Studio deployment on Sepolia is supported. Publishing a Sepolia subgraph to the decentralized network: the publishing page does not state testnet restrictions; unverified. The brief requires "live data from a Graph provider (Subgraph Studio ...)", which Studio on Sepolia satisfies.

FACT (brief). The Composable track disqualifies "Querying a single Subgraph without composition"; the AI track requires reusable tooling or an agent that reasons over the data.

Minimum integration: a subgraph over `Attested` and `Revoked` events (entities Attestation, Wallet, Revocation, daily stats), deployed to Studio on Sepolia, plus either (a) composition with the Agent0 ERC-8004 Sepolia subgraph (CLAIM that it exists on Sepolia, memo) to answer "is this agent's wallet eligible and reputable" in one query for the Composable track, or (b) an MCP server with one tool `check_eligibility(address)` that reads the subgraph for the AI From Scratch track. Effort: small for the subgraph, medium including (a) or (b). Track fit: From Scratch for both; Continuity only if an existing repo is extended, which is not our case.

Verified from docs: yes for Sepolia on Studio. Unverified: composition with Agent0 on Sepolia yields a coherent story; OPINION: it is a stretch for an identity service and the Graph track is the weakest fit of the nine.

Kill criterion: if the subgraph is the only Graph use and no composition or MCP layer is built by Sep 11, do not pick The Graph as one of the three partners.

---

## 7. Hedera: ATS IExternalKycList and Blocky402

Sources (fetched 2026-09-06):
- https://github.com/hashgraph/asset-tokenization-studio/issues/1392
- https://raw.githubusercontent.com/hashgraph/asset-tokenization-studio/main/packages/ats/contracts/contracts/facets/layer_1/externalKycList/IExternalKycList.sol
- https://raw.githubusercontent.com/hashgraph/asset-tokenization-studio/main/packages/ats/contracts/contracts/facets/externalKycListManagement/IExternalKycListManagement.sol
- https://blocky402.com/ and https://blocky402.com/docs/networks/

FACT (IExternalKycList.sol). The whole interface is one function: `function getKycStatus(address account) external view returns (IKyc.KycStatus);`.

FACT (IExternalKycListManagement.sol). A security token registers lists with `addExternalKycList(address)` or `updateExternalKycLists(address[], bool[])` under ROLE_KYC_MANAGER; `isExternallyGranted(account, status)` iterates all lists with AND semantics and returns true when no lists are registered.

FACT (issue 1392, opened 2026-08-30 by 4waan, open, no comments, no labels). Asks for a documented reference implementation of IExternalKycList (a MockedExternalKycList exists in the repo, the web app has AddExternalKYC views) and flags that `KycStorageWrapper.VerifyKycStatus` defaults to the external authority. CLAIM (memo): issue 1390 reports the testnet factory reverts on an empty ISIN and that grantKyc needs an SSI issuer first; no maintainer replies.

FACT (Blocky402). Hosted facilitator at https://api.testnet.blocky402.com (hedera:testnet, eip155:80002, Solana devnet) and https://api.blocky402.com (hedera:mainnet); no API key on testnet; scheme "exact", x402 v2; Hedera assets HBAR (0.0.0) and any HTS token id.

Sanity as consumers. ATS: yes, it is the cleanest possible consumer: an `EudiKycList` contract on Hedera testnet implementing `getKycStatus(account)` that returns GRANTED when a mirrored attestation exists, registered on an ATS equity via `addExternalKycList`. This is exactly what issue 1392 asks for, and a PR to ATS with a documented reference implementation would count as an upstream contribution (extra points on the Tokenization track). Chain mismatch: the attestation lives on Sepolia, ATS on Hedera; the verifier must write a second registry on Hedera testnet (Hedera is EVM, Foundry deploy works, HashScan verification required by the brief). Effort: medium (registry on Hedera, the KYC list contract, ATS deploy with the pre-deployed testnet factory, one issuance and one lifecycle operation in the demo; the ISIN and SSI issuer bugs from issue 1390 are the risk).

Blocky402: an x402-gated verifier endpoint on Hedera (for example a paid "eligibility check" API) is technically trivial but a weak story: it charges for reading a public attestation. As the AI track wants an agent consuming a paid service, a plausible framing is an agent that pays per eligibility lookup for a wallet; OPINION: contrived. Effort small, story weak.

Verified from docs: yes for the interface and facilitator. Unverified: whether the ATS web app or SDK path handles an external list end to end (issue 1392's second question), and whether the testnet factory bugs block issuance.

Kill criterion: if an ATS equity cannot be issued on testnet with the external KYC list attached by Sep 10, drop Hedera.

---

## 8. Arc testnet

Sources: [event wiki, local, withheld] (FACT, read 2026-09-06, fetched 2026-09-01), memo section 5 (CLAIM), Chainlink supported networks (FACT above), Privy custom chains (FACT above).

FACT. Chain id 5042002, RPC https://rpc.testnet.arc.io, explorer https://testnet.arcscan.app, faucet https://faucet.circle.com, USDC is the native gas token (18 decimals at protocol level). CLAIM (memo): the ERC-20 USDC interface has 6 decimals at 0x3600...0000; EURC, CCTP v2 (domain 26), Gateway and Permit2 are deployed; mainnet addresses "not yet available"; mainnet launches 2026-09-16; starter kits are "Arc testnet use only".

Minimum real USDC flow gated by the attestation: (a) the verifier writes the attestation to a registry on Arc testnet as well (same contract, second RPC), (b) a `GatedUSDCVault` or payout contract on Arc that only releases USDC to `isEligible` wallets (or an ERC-20 wrapper is unnecessary since USDC is native: the gate is a contract that holds USDC and pays out), (c) a Privy embedded wallet on the custom Arc chain or a plain script that calls it, (d) architecture diagram, working frontend and backend, and a "deployment-ready for mainnet" statement, since the Mainnet track requires mainnet by September 30, which is after the event. Effort: medium. The "Best DeFi/Onchain Finance" track wants meaningful USDC use; a compliance-gated payout is defensible (OPINION).

Verified from docs: yes for chain parameters. Unverified: which Circle services are live on mainnet at launch, so the mainnet-readiness claim must be phrased as "contracts deployable, no Circle service dependency" to stay honest.

Kill criterion: if the team cannot commit to a mainnet deployment after Sep 16, submit only to the DeFi/Onchain Finance track, not to the Mainnet track.

---

## 9. Ledger, 1inch, Bazantic (one line each)

Sources: memo sections 1, 3, 10 (CLAIM), prizes wiki (FACT).

- Ledger: no fit. The track requires the Key Ring CLI (`wallet-cli ring`, mainnet-only, encrypt and decrypt only, backend-dependent) at the center; an attestation verifier has no natural use for it beyond encrypting its signer key, which is cosmetic.
- 1inch: weak fit at large effort. The `OnlyTxOriginTokenBalanceNonZero` opcode on the live router could gate an Aqua strategy on a non-transferable attestation token, but the Sepolia router is "pending" and the canonical router takers need KycNFT, so the demo needs a fork or an own router; only worth it if a third pick is missing.
- Bazantic: no fit for the core; the "Agentify a new API" track ($1,000) could wrap the verifier's eligibility endpoint as a paid gateway, but payments are mainnet USDC on Base by default and the docs are behind login; low priority.

---

## Effort table

| Track | Minimum integration | Effort | Verified from docs | Gate or blocker |
|---|---|---|---|---|
| Uniswap v4 Permissioned Pools (Sepolia) | Restricted ERC-20 plus IAllowlistChecker reading the registry, adapter via factory, verify, approve wrappers and hook, init pool, one swap via Universal Router from a script | medium (large if routed through the Uniswap interface) | yes, steps 1 to 6 and all addresses; raw UR swap calldata unverified | Step 7 routing needs Uniswap Labs form, no SLA; FEEDBACK.md plus form audited |
| ENSv2 Permissioned Resolver | Deploy resolver proxy, authorizeTextRoles on one key to the verifier, verifier setText, consumer reads text(node,key) | small to medium | yes, role API and Sepolia addresses; tooling path unverified | Beta contracts not final, issue 418 open, writes only in preview library releases |
| Chainlink CRE Confidential Workflows | TS workflow, handlerInTee fetches verifier output, predicates crossed to DON, evmClient.writeReport into a receiver entry on the registry, simulate with --broadcast | medium | yes, handler API, simulation, Sepolia support; receiver wiring in simulation unverified | Live deploy is double-gated; simulation accepted by the brief; TEE story must be phrased as "decision in enclave", not "nobody sees the PID" |
| Privy Best financial flow | Embedded wallet on Sepolia, attestation gate in app, swap or USDC transfer after admission | small (transfer) to medium (swap) | yes, Sepolia swap and transfer listed; custom chain config for Arc verified | Custom test tokens may not route in swap (unverified) |
| Privy B2B | Organization wallet plus policy and intent approval before a gated payout | medium | endpoints documented; plan gating of quorums and organizations unverified | May need sales contact for organizations |
| World Selfie Check | IDKit sandbox, verify call, SELFIE_LOW attestation with caps keyed by nullifier, feedback doc | small to medium if access exists | yes, API and access steps | Two approvals (sandbox enrollment, feature flag) with no SLA; access by Sep 8 unverified |
| The Graph | Studio subgraph on Sepolia over Attested and Revoked plus composition or an MCP tool | small (subgraph) to medium (with composition or MCP) | yes for Sepolia on Studio | A single subgraph does not qualify; story fit weak |
| Hedera ATS external KYC list | Registry mirror on Hedera testnet, EudiKycList implementing getKycStatus, addExternalKycList on an ATS equity, one issuance and one lifecycle op, optional upstream PR for issue 1392 | medium | yes, interface and management functions | Testnet factory bugs (issue 1390), no maintainer replies |
| Hedera Blocky402 | x402-gated eligibility endpoint on Hedera testnet | small | yes, facilitator endpoints | Story contrived |
| Arc testnet | Registry mirror on Arc, USDC payout contract gated by isEligible, embedded wallet or script, diagram, mainnet-ready statement | medium | yes, chain parameters | Mainnet track needs deploy by Sep 30 after the event; Circle mainnet service availability unverified |
| Ledger | none | n/a | n/a | no fit |
| 1inch | Aqua strategy gated by attestation token via OnlyTxOrigin opcode on own router | large | partially (memo) | Sepolia router pending, KycNFT on canonical router |
| Bazantic | Gateway over the eligibility endpoint | small | no (docs behind login) | Mainnet payments by default, weak fit |

---

## Three triangles

Ranked by total effort and story coherence. Each triangle is three partners, which matches the three-partner cap.

### Triangle A (recommended): Uniswap plus Chainlink plus Privy
Story: "A German citizen proves adulthood and EU residency from the state wallet; the decision is computed in a Chainlink enclave; the attestation admits their embedded wallet to a permissioned Uniswap pool, and Privy makes the first swap one click." Every sponsor is load-bearing: Uniswap consumes (contract-enforced), Chainlink attests (confidential decision, on-chain write), Privy is the user wallet doing the gated swap. Total effort: medium plus medium plus small to medium. Verification status: all three verified from docs for the core path; open items are the raw UR swap calldata and the forwarder wiring in simulation. Kill criterion: if by Sep 9 either the permissioned swap on Sepolia or the simulated CRE write has not landed on chain, replace Chainlink with ENS (Triangle B) and let the Rust verifier write directly.

### Triangle B: Uniswap plus ENS plus Privy
Story: "Eligibility is a text record on your ENS name, written by the verifier under a delegated role, revocable by the issuer; the permissioned pool and the wallet read it." ENS replaces Chainlink; the checker reads the registry, and the ENS record is the human-readable mirror (or, stronger, the checker resolves the name's `eu.eligibility` record directly, which makes ENS the source of truth). Total effort: medium plus small to medium plus small to medium, the lowest total. Coherence slightly lower because two identity layers (registry and ENS) must be explained. Verification: all three verified for the core calls; ENS beta tooling unverified. Kill criterion: Permissioned Resolver delegation not working on Sepolia within one session.

### Triangle C: Hedera plus Arc plus Privy (the "regulated asset" angle)
Story: "One attestation, three venues: an ATS security token on Hedera admits only attested holders through IExternalKycList, a USDC payout on Arc only releases to attested wallets, and the holder uses one Privy wallet." Total effort: medium plus medium plus small, but the highest integration risk: the verifier must write to three chains, ATS has open testnet bugs, and the Arc mainnet condition sits after the event. Coherence is good for a compliance audience and it hits the two largest pools (Hedera $6,000 Tokenization, Arc $3,500 Mainnet plus $1,667 DeFi). Kill criterion: ATS issuance with the external list not working by Sep 10 (then swap Hedera for ENS or Chainlink).

Not recommended as a pick: The Graph (weak story fit), World (access risk; keep as an optional tier if the invite arrives), Ledger, 1inch, Bazantic.

---

## All URLs

- https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/deploy-a-permissioned-pool
- https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/overview
- https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/architecture
- https://developers.uniswap.org/docs/trading/swapping-api/swapping-permissioned-pools
- https://developers.uniswap.org/permissioned-pools-allowlist
- https://raw.githubusercontent.com/Uniswap/v4-periphery/main/src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol
- https://raw.githubusercontent.com/Uniswap/v4-periphery/main/src/hooks/permissionedPools/libraries/PermissionFlags.sol
- https://raw.githubusercontent.com/Uniswap/v4-periphery/main/src/hooks/permissionedPools/PermissionsAdapterFactory.sol
- https://docs.ens.domains/ensv2/permissioned-resolver
- https://docs.ens.domains/ensv2/enhanced-access-control
- https://docs.ens.domains/ensv2/tutorial-app-developers
- https://docs.ens.domains/learn/deployments
- https://github.com/ensdomains/contracts-v2/issues/418
- https://docs.chain.link/cre/concepts/confidential-workflows
- https://docs.chain.link/cre/guides/workflow/using-confidential-workflows/making-workflow-confidential-ts.md
- https://docs.chain.link/cre/account/confidential-workflows-access
- https://docs.chain.link/cre/guides/operations/simulating-workflows
- https://docs.chain.link/cre/supported-networks-ts.md
- https://docs.chain.link/cre-templates/hello-confidential-workflows
- https://docs.chain.link/cre/guides/workflow/using-confidential-http-client
- https://docs.chain.link/cre/reference/cli
- https://docs.privy.io/wallets/actions/swap/overview.md
- https://docs.privy.io/wallets/actions/transfer/overview.md
- https://docs.privy.io/wallets/overview/chains.md
- https://docs.privy.io/basics/react/advanced/configuring-evm-networks.md
- https://docs.privy.io/controls/key-quorum/overview.md
- https://docs.privy.io/organizations/overview.md
- https://docs.world.org/world-id/sandbox/sandbox-access.md
- https://docs.world.org/world-id/sandbox/testing-selfie-check.md
- https://docs.world.org/world-id/credentials/11.md
- https://docs.world.org/api-reference/developer-portal/verify.md
- https://thegraph.com/docs/en/supported-networks/sepolia/
- http://thegraph.com/docs/en/subgraphs/developing/deploying-publishing/publishing-a-subgraph/
- https://github.com/hashgraph/asset-tokenization-studio/issues/1392
- https://raw.githubusercontent.com/hashgraph/asset-tokenization-studio/main/packages/ats/contracts/contracts/facets/layer_1/externalKycList/IExternalKycList.sol
- https://raw.githubusercontent.com/hashgraph/asset-tokenization-studio/main/packages/ats/contracts/contracts/facets/externalKycListManagement/IExternalKycListManagement.sol
- https://blocky402.com/
- https://blocky402.com/docs/networks/
- https://docs.arc.io/ (landing; parameters from the 2026-09-01 raw dump of the connect-to-arc page)
- 404 today: https://docs.chain.link/cre/guides/workflow/confidential-workflows, https://docs.privy.io/wallets/swaps/overview, https://docs.world.org/world-id/selfie-check/sandbox-testing, https://docs.privy.io/recipes/react/chain-configuration (superseded by the URLs above)
