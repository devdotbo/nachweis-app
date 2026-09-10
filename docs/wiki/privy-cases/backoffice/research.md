---
type: reference
title: Research notes for the back-office case (Privy controls, fetched 2026-09-09)
updated: 2026-09-09
sources:
  - https://docs.privy.io/llms.txt (fetched 2026-09-09, page index)
  - https://docs.privy.io/controls/overview.md, controls/policies/overview.md, controls/policies/create-a-policy.md, controls/policies/example-policies/ethereum.md, controls/policies/example-policies/timebound.md, controls/policies/stateful-policies.md (fetched 2026-09-09)
  - https://docs.privy.io/controls/key-quorum/overview.md, controls/key-quorum/create.md, controls/key-quorum/sign.md, controls/common-use-cases/quorum-approval.md, controls/dashboard/overview.md, controls/dashboard/key-quorum.md, controls/dashboard/approvals.md (fetched 2026-09-09)
  - https://docs.privy.io/controls/authorization-keys/keys/create/key.md, controls/authorization-context.md, controls/authorization-keys/owners/types.md (fetched 2026-09-09)
  - https://docs.privy.io/transaction-management/intents/overview.md, lifecycle.md, sign-intents.md, create/execute-rpc.md, create/update-wallet.md, intent-webhooks.md (fetched 2026-09-09)
  - https://docs.privy.io/organizations/overview.md, organizations/setup/overview.md, organizations/setup/signers.md, organizations/actions/intents.md (fetched 2026-09-09)
  - https://docs.privy.io/wallets/wallets/create/create-a-wallet.md, wallets/wallets/server-side-access.md, wallets/using-wallets/ethereum/send-a-transaction.md, wallets/using-wallets/ethereum/sign-a-transaction.md, wallets/overview/chains.md (fetched 2026-09-09)
  - https://docs.privy.io/api-reference/webhooks/overview.md, wallets/gas-and-asset-management/assets/transaction-event-webhooks.md, basics/nodejs/setup.md (fetched 2026-09-09)
  - https://www.privy.io/pricing (fetched 2026-09-09, HTML flattened to text)
  - npm registry (npm view, 2026-09-09) and github.com/privy-io via gh (2026-09-09)
  - opus inventory of nachweis-app main 5f5ceb9 (read-only, 2026-09-09)
---

# Research notes: Privy controls for an issuer back office

All Privy statements below are FACT from the page named, fetched 2026-09-09, unless labelled otherwise. Quotes are verbatim.

## 1. Wallet types and the owner model

- Two deployment shapes: wallets "can be embedded within your application to have users interact with them directly, or they can be controlled by your servers via Privy's API. Use Privy to instantly spin up non-custodial wallets for your users or create a wallet fleet of your own." (guide/server-wallets/features.md)
- Owner types: users (Privy user id), authorization keys ("P256 cryptographic keys"), key quorums ("Owners and signers can also be composed of a mix of users and authorization keys. This is known as a key quorum.") (controls/authorization-keys/owners/types.md)
- Create a wallet: `POST https://api.privy.io/v1/wallets`; parameters `chain_type`, `owner` (user id or P-256 public key), `owner_id` (key quorum id, "If you provide this, do not specify an owner"), `policy_ids` (max one per wallet), `additional_signers` (key quorum ids, each with `override_policy_ids`). Node sample: `privy.wallets().create({chain_type: 'ethereum', owner: {public_key: publicKey}})`. (wallets/wallets/create/create-a-wallet.md, controls/authorization-keys/keys/create/key.md)
- Authorization key creation: Dashboard, "Authorization keys" page, "New key"; "The private key (e.g. the key you copy) is generated on your device, and is only ever known to your app. Neither Privy nor the secure enclave ever sees the private key". Node: `generateP256KeyPair()` from `@privy-io/node`. (controls/authorization-keys/keys/create/key.md)
- Authorization context in Node: `const authorizationContext: AuthorizationContext = { authorization_private_keys: ['authorization-key'] }`; multiple keys are allowed in the array for quorum signing. (controls/authorization-context.md, controls/key-quorum/sign.md)
- Server-side access to wallets: "Privy's control abstractions allow you to interact with wallets from your app's server, even without the user in the loop. These interactions can be restricted by policies". (wallets/wallets/server-side-access.md)

## 2. Policies

- Definition: "A policy is the complete set of constraints that govern a wallet. It is a list of rules that define the total set of actions that are allowed or denied for a wallet." `DENY` takes precedence; "Defaults to DENY if no rules resolve"; "If a wallet's policy does not include a rule for a given RPC method or wallet action API, usage of that RPC method or API will be denied." (controls/policies/overview.md)
- Enforcement: "By default, the trusted execution environment (secure enclave) enforces policies when processing wallet actions, such as signature requests, transactions, and key export." Transfer-size limits are enforced at the API level with simulation. (controls/overview.md)
- Creation: "You can create a policy using the Privy Dashboard, the NodeJS SDK, or the REST API." Policies "optionally have owners"; "Without an owner, the policies can be updated by your app secret alone." Owner may be an `owner_id` (key quorum id). (controls/policies/create-a-policy.md)
- Condition fields for Ethereum: `field_source: 'ethereum_transaction'` with `to`, `value`, `chain_id`; `field_source: 'ethereum_calldata'` with `field: 'function_name'` plus an `abi` array and `operator: 'eq'`, or `field: '<fn>.<input>'` for decoded arguments; `field_source: 'system'`, `field: 'current_unix_timestamp'` for time bounds. Example verbatim: `{field_source: 'ethereum_calldata', field: 'function_name', abi: [{name: 'deposit', type: 'function', ...}], operator: 'eq', value: 'deposit'}`. (controls/policies/example-policies/ethereum.md, timebound.md)
- Time-bound signer example verbatim: rule name "Allow all actions before 9/8/2026", `method: '*'`, condition `current_unix_timestamp lt 1788840000`, action ALLOW, "to be set as override_policy for the signer". (timebound.md)
- Stateful policies (aggregations): rolling windows, spending caps, rate limits; "Each app can have a maximum of 10 aggregations". (controls/policies/stateful-policies.md)
- Chain support: Ethereum is Tier 3 ("Send transactions"); "Transaction policies" need minimum Tier 2. (wallets/overview/chains.md)
- Sepolia: the send-transaction and sign-transaction pages use `caip2: "eip155:11155111" // Sepolia testnet` and `chainId(11_155_111)` in their Java, Go and Python samples. (wallets/using-wallets/ethereum/send-a-transaction.md lines 597 to 797; sign-a-transaction.md line 659)
- Sign without broadcast: Node `privy.wallets().ethereum().signTransaction(walletId, {params: {transaction: {to, value, chain_id}}})` returns `{signed_transaction, encoding}`. (sign-a-transaction.md) Whether the enclave signs for chain id 31337 (anvil): unverified.

## 3. Key quorums

- "A quorum is a set of authorization keys and/or users that control a resource (such as a wallet or policy) in the Privy API." m-of-n threshold; nested one level. Tip: "Key quorums are an advanced feature. Reach out to discuss whether this setup is right for your integration." (controls/key-quorum/overview.md)
- Creation: Dashboard ("Authorization keys" page, "New key", "Register key quorum instead") or Node `privyClient.keyQuorums().create({public_keys, user_ids, key_quorum_ids, display_name, authorization_threshold})`; the returned `id` is the `owner_id` for wallets and policies. "Key quorums containing both user IDs and authorization keys must be created via the REST API." (controls/key-quorum/create.md)
- Signing synchronously: each key signs; signatures go comma-separated in the `privy-authorization-signature` header, or the SDK takes `authorization_private_keys: [k1, k2]`. Privy checks count, validity and membership. (controls/key-quorum/sign.md)
- "Privy's TEE infrastructure enforces that at least that many members of the quorum must sign the request to take an action with a wallet. To allow multiple parties to unilaterally approve wallet actions, you can set this threshold to 1." (controls/common-use-cases/quorum-approval.md)
- Plan gating: no plan statement on the quorum pages. The pricing matrix lists "Key quorum approvals" under "Security & Compliance"; the flattened HTML does not show which column is ticked. Unverified whether key quorums work on the free Developer plan.

## 4. Intents (asynchronous approval) and manual approvals

- "Intents are Privy's asynchronous signing mechanism. They let your app propose an action on a wallet or resource, then collect the authorization signatures needed to execute it separately, over time and, if needed, from multiple parties." Steps: propose, sign, "Privy executes the action automatically once the signatures satisfy the resource's authorization threshold." Actions: Transfer, RPC (signature or transaction), Update wallet, Update policy, Update key quorum. (transaction-management/intents/overview.md)
- Propose an RPC intent, Node: `client.intents().rpc('insert-wallet-id', rpcRequest)` with `rpcRequest: EthereumSendTransactionRpcInput = {method: 'eth_sendTransaction', caip2, params: {transaction: {...}}}`; returns `intent_id`, `status`, `authorization_details`. Intents expire after 72 hours by default. (transaction-management/intents/create/execute-rpc.md)
- Authorize: `POST https://api.privy.io/v1/intents/{intent_id}/authorize` with `signature` and `timestamp`; "The authorize endpoint accepts a single signature per call. To satisfy a threshold greater than one, each owner or signer calls the endpoint with their own signature." Java sample: `client.intents().authorize("insert-intent-id", authorizationContext)`. Node method name for authorize: unverified (only Java shown on the page). (transaction-management/intents/sign-intents.md)
- Lifecycle: Pending, Granted, Processing, Executed, Failed ("such as a policy blocking the transaction or insufficient gas"), Rejected, Expired, Dismissed ("Updating a wallet dismisses all pending intents for that wallet"). `action_result` holds the transaction hash. (lifecycle.md)
- Update-wallet intent, Node: `client.intents().updateWallet(walletId, {policy_ids: [...]})`. (create/update-wallet.md)
- Manual approvals in the Dashboard: "Manual approvals is an Enterprise feature. Reach out to sales@privy.io to request access for your app." Reviewers approve with MFA; "Approvals cannot be revoked after submission." (controls/dashboard/overview.md, controls/dashboard/approvals.md)
- Plan gating of the Intents API itself (propose and authorize from your own backend): no statement on the intents pages. Unverified.
- Intent webhooks: `intent.created`, `intent.authorized`, `intent.rejected`, `intent.executed`, `intent.failed`. (intent-webhooks.md)

## 5. Webhooks and event-driven operation

- Registration: Dashboard, Configuration, Webhooks; HTTPS endpoint; Svix signatures (`svix-id`, `svix-timestamp`, `svix-signature`); verification helper in the Node SDK. Categories: user, wallet, transaction, wallet action, usage charge, intent, user operation. (api-reference/webhooks/overview.md)
- Plan: "Webhooks can be tested at no cost in development environments. To enable webhooks in production, upgrade to the Enterprise plan in the Privy Dashboard." (api-reference/webhooks/overview.md; same sentence on transaction-event-webhooks.md)
- Transaction events: broadcasted, still_pending, confirmed, execution_reverted, replaced, failed, provider_error; "The following functionality exists for wallets reconstituted server-side". (transaction-event-webhooks.md)
- Pricing matrix: "Webhooks" appears once under the Developer feature list and once under Enterprise ("Webhooks, SSO, and advanced custom integrations"); the docs sentence above is the operative rule. (privy.io/pricing)

## 6. Organizations (shared organization wallets)

- "Privy powers programmable wallets for organizations, allowing multiple people to securely hold funds, manage access, and operate financial workflows together." Organization object: id, display name, "A default key quorum that owns and administers new wallets for the organization". Wallets get `entity` set to the organization; the default key quorum becomes owner. (organizations/overview.md, setup/overview.md)
- Conditional policies per signer: create lower-privilege key quorums, one policy each, attach them as `additional_signers` with `override_policy_ids`. (organizations/setup/signers.md)
- Actions on organization wallets go through intents "initiated from your application's backend with just an app secret, and is authorized for execution later". (organizations/actions/intents.md)
- Plan gating of the organizations API: no statement found on the pages fetched. Unverified.

## 7. SDKs, versions, examples

- `@privy-io/node` 0.34.0 (npm, modified 2026-08-28); releases v0.32.0 to v0.34.0 dated 2026-08-26 to 2026-08-28 (gh, privy-io/node-sdk). Runtimes: Node 20+, Bun 1.0+, Deno; "Web browser runtimes aren't supported." (README) Setup: `new PrivyClient({appId, appSecret})`. (basics/nodejs/setup.md)
- `@privy-io/server-auth` 1.32.5 is deprecated: "This package is deprecated. If you are looking for the latest features and support, use @privy-io/node instead." (npm, 2026-09-09). The create-a-wallet page still names server-auth in one tab; use `@privy-io/node`.
- `@privy-io/react-auth` 3.40.0, `@privy-io/wagmi` 4.0.17 (npm, 2026-09-09). Not needed by this case.
- privy-io/rust-sdk exists (updated 2026-06-12); crate name and version unverified. This case keeps the Rust bridge unchanged and adds a TypeScript service instead.
- privy-io/examples/privy-node-starter (README fetched via gh 2026-09-09): an Express server whose `.env.example` carries `TREASURY_WALLET_ID`, `TREASURY_AUTHORIZATION_KEY`, `TREASURY_OWNER_ID`, `TREASURY_QUORUM_PRIVATE_KEY`, `TREASURY_QUORUM_PUBLIC_KEY`, `ALLOWLIST_USDC_POLICY_ID`. This is the closest first-party template: a treasury wallet owned by a quorum under an allowlist policy.
- Recipes: "2-of-2 quorum: user and server as co-signers" (recipes/wallets/two-of-two-server-in-the-loop.md), "Conditional policies per signer" (recipes/wallets/conditional-signer-policies.md) with sections "Create policies", "Create authorization keys", "Add signers with override policies", "Route transactions through the appropriate signer".

## 8. Pricing

- Developer plan: "Access all of Privy's core features and get 50K signatures and $1M transaction volume for free every month." Free 0 to 499 MAU; Core 299 USD; Scale 499 USD; Enterprise "For scaled platforms that need advanced controls and global scale", "Webhooks, SSO, and advanced custom integrations". The feature matrix rows "Policy engine", "Key quorum approvals", "Advanced SSO (Available as add-on)", "Custodial wallets", "Integrated fraud prevention (KYT)" sit under "Security & Compliance"; tick marks are not recoverable from the flattened HTML. (privy.io/pricing, fetched 2026-09-09)

## 9. Repository facts the case relies on (opus inventory 2026-09-09, main 5f5ceb9)

- Registry access control: OpenZeppelin `Ownable`; `setOperator(bytes32 policyId, address operator, bool enabled) onlyOwner` (contracts/src/AttestationRegistry.sol:83); `approve` :114 and `revoke` :124 are `onlyOperator(policyId)`; `attestWithProof` :155 is permissionless and never approves; `approve` without a decision reverts `NoDecision` (test `test_approveWithoutDecisionReverts` contracts/test/Nachweis.t.sol:375). Expiry is set only at attest time and checked in `isEligible` :189; no setExpiry, no sweep.
- Events: `Attested(subject, policyId, bits, tier, expiry, statusRef, attester)`, `Approved(subject, policyId, operator)`, `Revoked(subject, policyId, operator)` (AttestationRegistry.sol:40 to 52).
- Deploy: `OPERATOR_ADDRESS` env (default deployer) becomes the operator at contracts/script/Deploy.s.sol:22 to 32. A Privy wallet address can be the operator without any contract change.
- Bridge: `OPERATOR_PRIVATE_KEY` signer (service/src/chain.rs:205 to 224); routes `/sessions/:id/approve` and `/revoke` behind `BRIDGE_ISSUER_TOKEN` (service/src/api.rs:97 to 108, 127 to 132); no chain event listener; sessions in memory (service/src/session.rs:197).
- App: issuer screen app/src/screens/IssuerScreen.tsx:8 to 19; approve and revoke writes in app/src/lib/chain.ts:189 to 209; event log reads Attested, Approved, Revoked with an 8 s poll (chain.ts:142 to 187); connectors app/src/lib/WalletProvider.tsx:34 to 44; decision TTL 30 days at app/src/config.ts:51.
- Scripts: scripts/real-proof-local.sh approves and revokes via the bridge with `BRIDGE_ISSUER_TOKEN` (lines 210, 228), subscribe with cast (87 to 88), checker probe (85). scripts/browser-real-wallet-up.sh: approve is clicked in the browser with the dev operator connector (K0).
- No Privy, webhook, cron, quorum, multisig or Safe code exists in the repository (grep 2026-09-09).
