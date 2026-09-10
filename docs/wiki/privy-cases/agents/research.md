---
type: reference
title: Research notes for the agents and automation Privy case
updated: 2026-09-09
sources:
  - https://docs.privy.io/llms.txt (fetched 2026-09-09)
  - https://docs.privy.io/controls/policies/overview.md (fetched 2026-09-09)
  - https://docs.privy.io/controls/policies/create-a-policy.md (fetched 2026-09-09)
  - https://docs.privy.io/controls/policies/update-a-policy.md (fetched 2026-09-09)
  - https://docs.privy.io/controls/policies/example-policies/ethereum.md (fetched 2026-09-09)
  - https://docs.privy.io/controls/policies/example-policies/timebound.md (fetched 2026-09-09)
  - https://docs.privy.io/controls/policies/stateful-policies.md (fetched 2026-09-09)
  - https://docs.privy.io/wallets/using-wallets/signers/overview.md, configure-signers.md, add-signers.md, remove-signers.md, use-signers.md, quickstart.md (fetched 2026-09-09)
  - https://docs.privy.io/recipes/wallets/conditional-signer-policies.md (fetched 2026-09-09)
  - https://docs.privy.io/controls/authorization-keys/owners/types.md (fetched 2026-09-09)
  - https://docs.privy.io/controls/key-quorum/create.md (fetched 2026-09-09)
  - https://docs.privy.io/controls/authorization-keys/using-owners/sign/signing-on-the-server.md (fetched 2026-09-09)
  - https://docs.privy.io/wallets/using-wallets/ethereum/send-a-transaction.md, sign-a-transaction.md (fetched 2026-09-09)
  - https://docs.privy.io/wallets/overview/chains.md (fetched 2026-09-09)
  - https://docs.privy.io/basics/react/advanced/configuring-evm-networks.md (fetched 2026-09-09)
  - https://docs.privy.io/transaction-management/intents/overview.md, lifecycle.md, create/execute-rpc.md (fetched 2026-09-09)
  - https://docs.privy.io/api-reference/webhooks/overview.md (fetched 2026-09-09)
  - https://docs.privy.io/wallets/gas-and-asset-management/assets/transaction-event-webhooks.md (fetched 2026-09-09)
  - https://docs.privy.io/recipes/agent-integrations/agentic-wallets.md, agent-authorization.md (fetched 2026-09-09)
  - https://docs.privy.io/basics/nodeJS/installation.md, setup.md (fetched 2026-09-09)
  - https://www.privy.io/pricing (fetched 2026-09-09)
  - https://privy.io/blog/turning-wallets-programmable-with-privy-policy-engine (post dated 2026-01-08, fetched 2026-09-09)
  - https://privy.io/blog/securely-equipping-openclaw-agents-with-privy-wallets (post dated 2026-02-06, fetched 2026-09-09)
  - github.com/privy-io/examples, node-sdk, privy-agentic-wallets-skill (gh CLI 2026-09-09)
  - registry.npmjs.org for @privy-io/node, @privy-io/react-auth, @privy-io/wagmi (2026-09-09)
  - nachweis-app main 5f5ceb9 (opus inventory 2026-09-09, read-only)
---

# Research notes: agents and automation

Every item is FACT from the named page unless labelled otherwise. Quotes are verbatim.

## 1. Policies

- Definition and where managed: "You can create and manage policies through the Privy Dashboard, nodeJS SDK, or via the REST API." (overview)
- Evaluation: "`DENY` actions take precedence over `ALLOW` actions. If no rules resolve, the policy will default to `DENY`." and "If a wallet's policy does not include a rule for a given RPC method or wallet action API, usage of that RPC method or API will be denied." (overview)
- Enforcement location: "By default, the trusted execution environment (secure enclave) enforces policies when processing wallet actions ... Privy enforces some policies at the API level. For example, limiting transfer sizes requires transaction simulation which runs outside the enclave today." (overview)
- field_source values (overview, ResponseField): `'ethereum_transaction' | 'ethereum_calldata' | 'ethereum_typed_data_domain' | 'ethereum_typed_data_message' | 'ethereum_7702_authorization' | 'solana_program_instruction' | 'solana_system_program_instruction' | 'solana_token_program_instruction' | 'tron_transaction' | 'tron_trigger_smart_contract_data' | 'sui_transaction_command' | 'sui_transfer_objects_command' | 'xrpl_transaction' | 'tempo_transaction' | 'message' | 'action_request_body' | 'system' | 'reference'`. No source reads chain state. That absence is the design fact for this case (FACT as absence in the fetched list; labelled unverified below in case a page not fetched adds one).
- Operators: `eq, neq, lt, lte, gt, gte, in, in_condition_set, contains, starts_with, ends_with`. The `in` operator takes up to 100 values.
- Calldata conditions carry an ABI. Ethereum example page, verbatim fragment:

```
{
    field_source: 'ethereum_calldata',
    field: 'function_name',
    abi: [{ "name": "deposit", "type": "function", "stateMutability": "payable", "inputs": [], "outputs": [] }],
    operator: 'eq',
    value: 'deposit'
}
```

  and `field: 'transfer.amount'` with the ERC20 transfer ABI and `operator: 'lte'`.
- Time bound (timebound page, verbatim): "Time-bound signer policy" with `method: '*'`, condition `field_source: 'system', field: 'current_unix_timestamp', operator: 'lt', value: '1788840000'`, `action: 'ALLOW'`; comment in the page: "to be set as override_policy for the signer".
- Create (create-a-policy page): `privy.policies().create({name, version: '1.0', chain_type: 'ethereum', rules: [...], owner_id})`. "Without an owner, policies can be updated by app secret alone" and owners are "highly recommended".
- Update (update-a-policy page): `client.policies().createRule('insert-policy-id', {...})`, `updateRule('insert-rule-id', ...)`, `deleteRule('insert-rule-id', ...)`; REST `POST /v1/policies/<policy_id>/rules`, `PATCH` and `DELETE` on `/v1/policies/<policy_id>/rules/<rule_id>`; header `privy-authorization-signature` when the policy has an owner. "We recommend this over updating the whole policy at once ... you can ensure there would be no race conditions".
- Stateful policies (spending caps, rate limits): aggregations for `eth_signTransaction` and `eth_signUserOperation`; window "Minimum value is `3600` (1 hour), and maximum is `259200` (72 hours)"; "Each app can have a maximum of 10 aggregations." A monthly cap cannot be expressed; a daily cap can.
- Chain tiers (chains page): "Ethereum ... Includes EVM-compatible networks" is Tier 3 (sign, broadcast, track). "Tier 2 is the minimum threshold for transaction-level policy controls". Policies "vary independently by chain".
- Availability: the policy engine blog (2026-01-08): "Today, Privy's policy engine is available across EVM- and SVM-compatible chains, and can be created and managed ... directly through the Privy Dashboard, or via our Node SDK or REST API." No beta or enterprise label on any policy page. The pricing page lists no policy gate on the Developer plan (see 7). OPINION: policies are GA and self-serve.

## 2. Signers (session signers)

- Use cases (signers overview, verbatim): "Offline actions: execute limit orders or agentic trades even while a user is offline in your app." "Recurring actions: implement subscriptions, portfolio rebalancing, and more." "Scoping wallet policies to specific parties". "Signers can be added to wallets owned by users, authorization keys, or key quorums." "a signer will never see the wallet's private key."
- Configure (configure-signers page): "a signer is a key quorum that is authorized to submit transaction request for signature from a user's wallet." Dashboard: "Wallet infrastructure > Authorization keys" then "Create new key"; "The modal will show the key quorum ID and the private key used for signing." "Privy never sees this private key". Policies for signers: "set up policies in your Privy dashboard under Wallet infrastructure > Policies."
- Add (add-signers page, React): `import {useSigners} from '@privy-io/react-auth'; const {addSigners} = useSigners();` signature `addSigners: async ({address: string, signers: {signerId: string, policyIds: string[]}[]}) => Promise<{user: User}>`. `policyIds`: "An ID for a policy that any transaction from the signer must satisfy to be signed. This is an optional field, if not provided, no policies will apply to the signers requests. Note that at this time, each signer can only have one override policy." Also React Native, Swift, Android, Flutter. Node or REST needs the owner's signature on a wallet update.
- Per-signer policies (conditional-signer-policies recipe): "Each signer can have an override policy that defines what policies that signer is subject to. When a signer submits a transaction, Privy evaluates only that signer's override policy". Node example uses `import {PrivyClient} from '@privy-io/node'` and `import {erc20Abi, parseUnits} from 'viem'` for the calldata condition.
- Remove (remove-signers page): `removeSigners: async ({address: string})`, "will remove all the signers, so only the user can transact on the wallet." Example button text in the docs: "Revoke permission for this app to transact on my behalf". Delegated wallets carry `delegated: true` in `user.linkedAccounts`.
- Use from the server (use-signers page): "The signing key you configured in the dashboard is the authorization signing key used to produce authorization signatures when submitting requests." Server side: `privy.users()._get(did)` then filter `linked_accounts` for `type === 'wallet' && 'id' in account && account.delegated`.
- Authorization context (signing-on-the-server page, `@privy-io/node`): `const authorizationContext: AuthorizationContext = { authorization_private_keys: ['authorization-key'] };`
- Examples repo (gh, 2026-09-09): `useSigners` with `addSigners`/`removeSigners` in privy-react-starter/src/components/sections/signers.tsx and nine other examples; env `VITE_PRIVY_SIGNER_ID`; that starter pins `@privy-io/react-auth ^3.12.0`. The `privy-next-session-keys` example is ZeroDev session keys, not Privy signers.

## 3. Key quorums and owners

- Types page: users, authorization keys (P-256), key quorums. "Key quorums are an advanced integration. To determine if key quorums are right for your use case, please reach out."
- Create page: Dashboard "New key" then "Register key quorum instead", public keys plus threshold; REST `POST` with `authorization_threshold`. A single key created via "Create new key" already returns a key quorum ID (configure-signers page). OPINION: a 1-of-1 quorum is self-serve; m-of-n is documented as self-serve too but Privy asks to be contacted; treat m-of-n as unverified for a hackathon app.

## 4. Sending and signing from the server

- `@privy-io/node` is the package ("Install the Privy Server SDK ... `@privy-io/node@latest`"); npm latest 0.34.0 published 2026-08-28; GitHub releases v0.34.0 2026-08-28. `new PrivyClient({appId, appSecret})`.
- Send (send-a-transaction page, Node): `privy.wallets().ethereum().sendTransaction('insert-wallet-id', {caip2: 'eip155:8453', params: {transaction: {to, value, chain_id}}, sponsor: true})`. `caip2` is `eip155:${number}`. The Java, Go and Python tabs use `eip155:11155111` "Sepolia testnet". Warning: "a successful response indicates that the transaction has been broadcasted ... The endpoint does not wait for confirmation".
- Sign only (sign-a-transaction page): "Sign an Ethereum/EVM transaction without broadcasting it using Privy"; `privy.wallets().ethereum().signTransaction(walletId, {params: {transaction: {to, value, chain_id}}})` returns `signed_transaction` (rlp). Whether `chain_id: 31337` (anvil) is accepted for sign-only: unverified.
- Sepolia in the React config table (configuring-evm-networks): "Ethereum Sepolia | 11155111" with both columns checked.
- Gas sponsorship (`sponsor: true`) on Sepolia for a Developer-plan app: unverified.

## 5. Intents and manual approvals

- Overview: "Intents are Privy's asynchronous signing mechanism. They let your app propose an action on a wallet or resource, then collect the authorization signatures needed to execute it separately". Types: transfer, RPC transaction, update wallet, update policy, update policy rules, update key quorum. "Manual approvals is Privy's Dashboard-native implementation of intents. Team members review and approve intents directly in the Privy Dashboard, secured by biometric or TOTP MFA."
- Execute RPC: `client.intents().rpc('insert-wallet-id', rpcRequest)` (Node), `POST /v1/intents/wallets/<wallet_id>/rpc`; "Intents expire 72 hours after creation by default."
- Lifecycle statuses: Pending, Granted, Processing, Executed, Failed ("such as a policy blocking the transaction"), Rejected, Expired, Dismissed. No plan gate found on the pages fetched; unverified whether the Developer plan includes intents.

## 6. Webhooks

- Webhooks overview: "Webhooks can be tested at no cost in development environments. To enable webhooks in production, upgrade to the Enterprise plan in the Privy Dashboard." Delivery via Svix, `privy.webhooks().verify`. Event groups: user, wallet, transaction, wallet action, intent, user operation.
- Transaction event webhooks: seven statuses (broadcasted, still pending, confirmed, execution reverted, replaced, failed, provider error); the page is scoped to "wallets reconstituted server-side".
- Consequence for the case: the revoke signal is taken from the chain (the registry's `Revoked` event) by our own watcher, not from Privy webhooks, so no Enterprise dependency.

## 7. Pricing and self-serve

- Pricing page: Developer plan free with "50K signatures and $1M transaction volume" per month; Scale "$299 / M" (500 to 2,499 MAU) and "$499 / M"; Enterprise "Custom pricing", adds "Webhooks, SSO, and advanced custom integrations", "Custodial wallets". Developer includes "Native gas sponsorship, Native funding & bridging, Custom onramps, Multi-wallet accounts", "SDKs (Web / Mobile / Gaming)". Policies, signers and intents are not named on the pricing page in either column (absence, not a gate).

## 8. Privy's own agent material

- Agentic wallets recipe: two models, "Your application backend controls the wallet via authorization keys" and "Users maintain ownership while granting limited permissions to agents" (additional signers); recommended constraints "Transfer limits", "Allowlisted contracts", "Time-based controls", "Recipient restrictions"; users can "revoke agent access at any time".
- Agent authorization recipe (self-hosted agents, device-code flow): tokens with lifetimes, "Users can list and revoke active agent authorizations at any time." Not used here (it targets agents that hold user tokens).
- OpenClaw blog (2026-02-06): "Policies are required by default, and guardrails are enforced before any transaction is executed." The privy-agentic-wallets-skill repo (SKILL.md) lists REST endpoints `/v1/wallets`, `/v1/wallets/{id}/rpc`, `/v1/policies`, `/v1/policies/{id}/rules/{rule_id}`.
- Policy engine blog (2026-01-08): "a portfolio rebalancing agent can be allowed to move funds only between approved assets, within defined thresholds, and only during specific time windows."

## 9. Client packages (npm, 2026-09-09)

- `@privy-io/react-auth` latest 3.40.0 (2026-09-03). `@privy-io/wagmi` latest 4.0.17 (2026-08-31). `@privy-io/node` latest 0.34.0 (2026-08-28). App pins today: wagmi ^2.19.5, viem ^2.56.3, react ^19.2.8, vite ^8.2.2 (app/package.json). Compatibility of `@privy-io/wagmi` 4.0.17 with wagmi 2.19 and vite 8: unverified.

## 10. Repository facts the case relies on (opus inventory 2026-09-09, main 5f5ceb9)

- Decision struct: nachweis-app/contracts/src/interfaces/IEligibility.sol:11 to 18 (policyId, bits, tier, expiry uint64, statusRef, revoked).
- Registry: nachweis-app/contracts/src/AttestationRegistry.sol. `approve` :114 to 120 (onlyOperator, clears revoked, emits `Approved` :52). `revoke` :124 to 130 (emits `Revoked(subject, policyId, operator)` :51). `isEligible` :187 to 191: approved, not revoked, `expiry > block.timestamp`, bits. Expiry is read-side only; no setter, no event at expiry. `attestByOperator` :106 to 110 (stores and approves in one call, useful for a short-expiry test).
- Subscription: nachweis-app/contracts/src/Subscription.sol:23 to 27. `subscribe()` takes no payment, checks `isEligible(msg.sender, ...)` :25, mints `demoAmount` (100e18 by Deploy default) :26, emits `Subscribed`. The check is on `msg.sender`, the wallet address, not on who authorised the signature inside Privy.
- FundToken transfer check: nachweis-app/contracts/src/FundToken.sol:61 to 66 (`isEligible(to)` at :63; transfers to `issuer` and burns bypass it :62). No redeem or refund function.
- Bridge routes: nachweis-app/service/src/api.rs:88 to 112; approve :669 and revoke :695, :722 behind `BRIDGE_ISSUER_TOKEN` (config.rs:141); operator key `OPERATOR_PRIVATE_KEY` (config.rs:124, chain.rs:207 to 221).
- App: connectors in nachweis-app/app/src/lib/WalletProvider.tsx:34 to 39 (dev signer and `injected()` only; the header comment at :6 names Privy as the intended replacement); `useWallet` in app/src/lib/wallet.ts:87; writes in app/src/lib/chain.ts:204 to 207 (`subscribe` :207); Subscribe button in app/src/components/DoorsCard.tsx:35; env in app/src/config.ts (14 `VITE_*` names, no Privy). No `@privy-io/*`, no account abstraction packages.
- Stack script: nachweis-app/scripts/browser-real-wallet-up.sh starts g0-up, anvil :129, Deploy :135, NoirVerifier :155, checker :159, bridge :171 to 174, Vite :180 to 183.
