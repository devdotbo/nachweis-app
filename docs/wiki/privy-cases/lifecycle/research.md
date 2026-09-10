---
type: reference
title: Research notes for the lifecycle case (Privy features, code facts, legal facts)
updated: 2026-09-09
sources:
  - docs.privy.io pages listed below, all fetched 2026-09-09 with WebFetch or WebSearch
  - https://www.privy.io/pricing (fetched 2026-09-09)
  - https://github.com/privy-io/examples and https://github.com/privy-io/node-sdk (read with gh 2026-09-09)
  - registry.npmjs.org package metadata (read 2026-09-09)
  - nachweis-app main 5f5ceb9 (opus inventory 2026-09-09, read-only)
  - raw/2026-09-06-product-pitch-legal.md, 2026-09-06-live-gated-products.md
  - https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1183 (fetched 2026-09-09)
---

# Research notes: lifecycle case

All Privy statements are FACT from the named page unless labelled otherwise. "GA" below means the page carries no beta, early-access or gated wording; Privy's docs do not use the phrase "generally available" on the pages read, so absence of gating wording is the best available signal and is recorded as such.

## 1. Privy features the case stands on

### 1.1 Embedded wallets, Sepolia

- Embedded wallet created at login: `embeddedWallets: {ethereum: {createOnLogin: 'users-without-wallets'}}` (FACT, https://docs.privy.io/basics/react/setup, fetched 2026-09-09 by the spec-privy research, reused).
- Sepolia is in Privy's default supported chain list; other chains via `supportedChains` and viem `defineChain` (FACT, https://docs.privy.io/basics/react/advanced/configuring-evm-networks, fetched 2026-09-09, reused from spec-privy.md).
- Pricing: "Core" plan free for 0 to 499 MAU, "50K signatures and $1M transaction volume" per month included; "Delegated access to wallets" listed under "Core Wallet Infra" for the Developer plans; "Webhooks" listed under Core Wallet Infra (FACT, https://www.privy.io/pricing, fetched 2026-09-09). CLAIM: "Delegated access to wallets" is the pricing name for signers on user wallets (Privy's docs formerly called them delegated actions); the mapping is not stated on the pricing page.

### 1.2 Signers on user wallets (session signers)

- Signers overview: signers enable "delegating transaction execution"; "a signer will never see the wallet's private key" (FACT, https://docs.privy.io/wallets/using-wallets/signers/overview, fetched 2026-09-09).
- Use cases named by Privy: "limit orders", "Telegram bot trading", users offline, and (search snippet) "recurring actions such as implementing subscriptions and portfolio rebalancing" (FACT for the recipe page https://docs.privy.io/recipes/wallets/session-signer-use-cases/server-side-access, fetched 2026-09-09; the "subscriptions" phrase is from the WebSearch snippet of https://docs.privy.io/wallets/using-wallets/session-signers/overview, the page itself returned a redirect stub when fetched, so that quote is CLAIM).
- Configure: Dashboard "Wallet infrastructure > Authorization keys", "Create new key"; the modal shows the "key quorum ID" and the private key; "Privy never sees this private key and cannot help you recover it." Policies optional under "Wallet infrastructure > Policies". Wallet owners "grant consent for your app to take certain actions" (FACT, https://docs.privy.io/wallets/using-wallets/signers/configure-signers, fetched 2026-09-09).
- Add: React hook `useSigners` with `addSigners({address, signers: [{signerId, policyIds}]})`; NodeJS or REST: update wallet with `additional_signers`; each signer supports "one override policy"; if none is given, "default policies apply" (FACT, https://docs.privy.io/wallets/using-wallets/signers/add-signers, fetched 2026-09-09).
- Confirmed in Privy's own example code: `import { useSigners, useWallets } from "@privy-io/react-auth"`; `const { addSigners, removeSigners } = useSigners();` `addSigners({... signerId, policyIds: [] ...})`; `removeSigners(...)`; env `NEXT_PUBLIC_PRIVY_SIGNER_ID` (FACT, https://github.com/privy-io/examples, examples/privy-next-session-keys/src/components/sections/signers.tsx lines 4, 16, 46 to 51, 68, read with gh 2026-09-09; that example's package.json pins `@privy-io/react-auth ^3.12.0`). Its server route uses ZeroDev session keys, not Privy signers, so it is not a template for our runner.
- Use from the server: "configure the NodeJS SDK or the REST API"; wallets with a signer show `account.delegated` on the user object (FACT, https://docs.privy.io/wallets/using-wallets/signers/use-signers, fetched 2026-09-09).
- Server send: `privy.wallets().ethereum().sendTransaction(walletId, {caip2: 'eip155:<chainId>', params: {transaction: {...}}, sponsor})`; CAIP-2 for Sepolia is `eip155:11155111`; the page says the call works for user embedded wallets when authorization signatures are provided (FACT, https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction, fetched 2026-09-09).
- Authorization signatures: header `privy-authorization-signature`; "If you are using Privy's SDKs, the appropriate authorization signature and request expiry headers are added automatically to your requests." (FACT, https://docs.privy.io/api-reference/authorization-signatures, fetched 2026-09-09). The exact constructor option name for the authorization private key in `@privy-io/node` is unverified (not on the pages read).
- Legacy note: the page https://docs.privy.io/wallets/using-wallets/signers/setup describes the on-device execution path with a dashboard toggle "Server-side access" and "Require signed requests", and says apps created after May 2025 should use the signers overview (TEE execution) instead (FACT, fetched 2026-09-09).
- Gating: none of the signer pages carries plan, add-on or request-access wording (FACT, pages above).

### 1.3 Policies

- A policy is "a list of rules that define the total set of actions that are allowed or denied for a wallet"; enforced in "the trusted execution environment (secure enclave)"; created via Dashboard, NodeJS SDK or REST (FACT, https://docs.privy.io/controls/policies/overview, fetched 2026-09-09).
- Schema: `version '1.0'`, `chain_type 'ethereum'`, rules with `method`, `conditions`, `action ALLOW|DENY`, optional `owner_id`; "without an owner, the policies can be updated by your app secret alone" (FACT, https://docs.privy.io/controls/policies/create-a-policy, fetched 2026-09-09).
- Calldata rule example "Allow WETH deposit": conditions `ethereum_transaction.to eq <address>` and `ethereum_calldata.function_name eq 'deposit'` with the function ABI inline (FACT, https://docs.privy.io/controls/policies/example-policies/ethereum, fetched 2026-09-09). This is the template for "only `subscribe()` on the Subscription contract".
- Stateful policies: rolling windows of 1 to 72 hours, aggregations over `eth_signTransaction` and `eth_signUserOperation`, at most 10 aggregations per app, values recorded after signing (FACT, https://docs.privy.io/controls/policies/stateful-policies, fetched 2026-09-09). Not usable for a monthly cap (72 h maximum window).
- Gating: pricing table lists "Policy engine" under "Security & Compliance" as "Available as add-on" for the Developer plans (FACT, https://www.privy.io/pricing, fetched 2026-09-09). Whether the add-on is self-serve in the dashboard, paid, or via sales: unverified. The policy docs themselves carry no gating wording.

### 1.4 Key quorums, intents, approvals

- Key quorum: "an authorization threshold that defines how many keys in the quorum must sign a request"; members can be users, authorization keys and nested quorums; the page calls it "an advanced integration" and says to "reach out" on Slack (FACT, https://docs.privy.io/controls/authorization-keys/keys/create/key-quorum, fetched 2026-09-09). Pricing: "Key quorum approvals" "Available as add-on" (FACT, pricing page).
- Intents: "Intents expire 72 hours after creation by default"; REST `POST https://api.privy.io/v1/intents/wallets/<wallet_id>/transfer`; Node `client.intents().transfer()` (FACT, https://docs.privy.io/controls/dashboard/intents, fetched 2026-09-09). Approvals: reviewers "in the corresponding key quorum" approve in the dashboard with MFA; "Approvals cannot be revoked after submission" (FACT, https://docs.privy.io/controls/dashboard/approvals, fetched 2026-09-09). Whether intents work on user embedded wallets: unverified.

### 1.5 Transfer action

- Chains include Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, Polygon Amoy; "Privy also supports transfers of custom ERC20/SPL tokens"; custom assets are configured in the dashboard "Asset watchlist" tab; no beta or GA wording (FACT, https://docs.privy.io/wallets/actions/transfer/overview, fetched 2026-09-09). React hook name for transfers: unverified (search returned only `useSendTransaction`).

### 1.6 Webhooks

- Configured self-serve under "Configuration > Webhooks"; events include `wallet.funds_deposited`, `wallet.funds_withdrawn`, transaction broadcast, confirmed, failed, reverted; Svix signatures; "Webhooks can be tested at no cost in development environments"; "To enable webhooks in production, upgrade to the Enterprise plan in the Privy Dashboard." (FACT, https://docs.privy.io/api-reference/webhooks/overview, fetched 2026-09-09).

### 1.7 Global wallets (cross-app)

- Provider: "Global wallet provider access is a gated feature. Before implementing global wallets as a provider, request access by navigating to Global wallet > My app in the Privy Dashboard and clicking the Request access button." Prerequisites: production app, HTTPOnly cookie domain verified, app logo. Providers may set read-only mode (FACT, https://docs.privy.io/wallets/global-wallets/launch-your-wallet/overview and /wallets/global-wallets/overview, fetched 2026-09-09).
- Requester: `toPrivyWallet({id, name, iconUrl})` from `@privy-io/cross-app-connect/rainbow-kit`, or `useCrossAppAccounts`; needs the provider app id; "some providers may only consent to sharing their users' wallets in read-only mode" (FACT, https://docs.privy.io/wallets/global-wallets/integrate-a-global-wallet, fetched 2026-09-09). Demo repo privy-io/cross-app-connect-demo (FACT, README read 2026-09-09); privy-io/cross-app-provider-demo is archived.
- Blog "Cross-app wallets are live" exists (CLAIM, https://privy.io/blog/cross-app-wallet-launch, search result 2026-09-09, not fetched).

### 1.8 Package versions (FACT, registry.npmjs.org, read 2026-09-09)

| Package | latest | published |
|---|---|---|
| @privy-io/react-auth | 3.40.0 | 2026-09-03 |
| @privy-io/wagmi | 4.0.17 | 2026-08-31 |
| @privy-io/node | 0.34.0 | 2026-08-28 |
| @privy-io/cross-app-connect | 0.6.3 | 2026-08-31 |
| @privy-io/server-auth | 1.32.5 | 2025-09-17 (older line, still used by privy-node-telegram-trading-bot) |

react-auth 3.40.0 depends on viem 2.56.0; the app pins viem ^2.56.3 (FACT, app/package.json via inventory).

## 2. Code facts (FACT, nachweis-app main 5f5ceb9, opus inventory 2026-09-09)

- Decision struct: nachweis-app/contracts/src/interfaces/IEligibility.sol:11 to 18: policyId, bits, tier, expiry, statusRef, revoked.
- isEligible: nachweis-app/contracts/src/AttestationRegistry.sol:187 to 191: `approved[subject][policyId] && !d.revoked && d.expiry > block.timestamp && (d.bits & requiredBits) == requiredBits`.
- attestWithProof :155 to 179 (permissionless, 4 public inputs subject, policyId, bits, expiry; reverts if revoked at :170; nonce replay refused :171 to 176; does not set approved). approve :114 to 120 (onlyOperator). revoke :124 to 130 (sets revoked, clears approved). attestByOperator :106 to 110 (stores and approves, overwrites revoked records). Events :40 to 52. No renewal function; expiry enforced only in isEligible.
- FundToken: nachweis-app/contracts/src/FundToken.sol:61 to 66, `_update` checks `registry.isEligible(to, policyId, REQUIRED_BITS)` for the recipient only; exempt `to == address(0)` and `to == issuer` (redemption by transfer to the issuer, :62). policyId and REQUIRED_BITS are immutable constructor arguments (:20, :23). mint :55 to 58 by issuer or subscription.
- Subscription: nachweis-app/contracts/src/Subscription.sol:23 to 28, `subscribe()` takes no payment, checks isEligible for msg.sender, mints `demoAmount`.
- Checker: nachweis-app/contracts/src/uniswap/EudiAllowlistChecker.sol:58 to 61, `checkAllowlist(account, token)` returns SWAP_ALLOWED|LIQUIDITY_ALLOWED when isEligible.
- No second issuer, second policyId, redeem or recurring code exists. Deploy.s.sol logs registry, fund token, subscription, operator, policyId (:40 to 44).
- App: nachweis-app/app/src/lib/WalletProvider.tsx (chain :21 to 30, connectors :33 to 38, transport :43); subscribe call app/src/lib/chain.ts:207; DoorsCard.tsx:13 to 17 (Subscribe), :41 to 48 (Swap button disabled); no swap call in the app. Bridge signs with OPERATOR_PRIVATE_KEY (service/src/config.rs:124, chain.rs:208 to 221); no webhook or event listener in the service.
- Privy mentions: app/README.md:100 and app/src/lib/WalletProvider.tsx:6 (a Privy provider could replace the WalletProvider body); no dependency.
- Default policyId: keccak256("nachweis.pid.over18.v1").

## 3. Legal and market facts used

- "Whoever operates the allowlist and is regulated is the obliged entity; an attestation reused by a second venue does not transfer that venue's duty." (OPINION on FACT in raw/2026-09-06-product-pitch-legal.md:140; the underlying FACTs are AMLR Art 22(1)(a), Art 22(6)(b), Art 77 at :109 to 111 and :138 to 139.)
- Eligibility predicates that a venue may enforce without a customer due diligence relationship: "Age over 18, consumer product, no AML relationship: Yes"; "Residency or nationality exclusion for a sale or airdrop: Yes for the jurisdictional exclusion" (same memo :125 to 126). A pure crypto-asset issuer or offeror is not in the AMLR Art 3 list of obliged entities (FACT, same memo :51).
- COUNT 0 of live products where an on-chain portable attestation is consumed on chain by more than one independent app; ERC-3643 cross-issuer reuse in production: none found; Spiko's allowlist is per issuer, run by Spiko's relayer, and Spiko allowlists protocols as contracts (FACT and COUNT, raw/2026-09-06-live-gated-products.md:18, :33, :40, :98, :175).
- 5 of 5 core EU exchanges store their own verified self-hosted address for reuse inside that exchange; 0 accept a proof made at another VASP (COUNT, same memo :22).
- eIDAS 2 Art 5a(9): the wallet is revoked "(a) upon the explicit request of the user", "(b) where the security of the European Digital Identity Wallet has been compromised", "(c) upon the death of the user or cease of activity of the legal person"; Art 5a(8): Member States "provide validation mechanisms free-of-charge, in order to: (a) ensure that the authenticity and validity of European Digital Identity Wallets can be verified" (FACT, https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1183, fetched 2026-09-09; the page is truncated after Art 5c in the fetch, revocation-list articles unverified).
- Art 5f(2): private relying parties in the listed sectors must accept the wallet no later than 36 months after the implementing acts (FACT, wiki/narrative-zk.md:36, fetched 2026-09-08).
- ARF v3.0.0 Annex 2 Topic 53 defines ZKP_01 to ZKP_09 including validity and non-revocation predicates (FACT, product-pitch-legal memo :117).
- EDPB: store only a proof-of-existence form on chain; a wallet-bound attestation with a boolean and an expiry qualifies (CLAIM, product-pitch-legal memo :148).
