# Privy standing order: the issuer's automation subscribes for the investor under a policy copied from the on-chain decision

WP32, branch `wp32-privy-standing-order`. Status on 2026-09-09: class L green (local chain, no Privy app: `scripts/standing-order-local.sh` prints `STANDING-ORDER-LOCAL PASS`); class S (Sepolia with the builder's Privy app) not run. Nothing below with only local evidence is described as a Privy run.

## 1. What it is

A fund issuer runs a standing order (a recurring `Subscription.subscribe()`) for an investor from the investor's own wallet, without holding an identity document for it, because the investor's EUDI evidence produced an on-chain eligibility decision with an expiry and a revocation flag. Privy provides three things: the investor's embedded wallet (created at email sign-in), a signer on that wallet for the issuer's automation (an authorization key registered in the Privy dashboard), and a policy on that signer. The policy is not written by hand: the automation builds it from `decisionOf(subject, policyId)` when the registry emits `Approved`, appends a deny-all rule when it emits `Revoked`, and removes that rule when it emits `Approved` again.

Why Privy alone cannot express it: a Privy policy's condition sources are transaction fields, decoded calldata, typed data, message content, the system clock and aggregations; none reads chain state (FACT, `@privy-io/node` 0.34.0 `resources/policies.d.ts`, `PolicyCondition` union, read 2026-09-09). "Sign only while this person is eligible" needs an external, machine-readable eligibility fact. The AttestationRegistry holds exactly that per address: `expiry` and `revoked` (`contracts/src/interfaces/IEligibility.sol:11` to `:18`), with `Approved` and `Revoked` events (`contracts/src/AttestationRegistry.sol:51` to `:52`). `Subscription.subscribe()` checks `isEligible(msg.sender, ...)` (`contracts/src/Subscription.sol:23` to `:28`), so a signer on the wallet inherits the wallet's eligibility and loses it when the issuer revokes or the decision expires. The policy copies the same two facts to Privy's side, so a refused run is refused before broadcast, and the chain would refuse it too.

Cut on purpose (evaluation of 2026-09-09): no payment leg (the demo fund's `subscribe()` takes no payment and mints 100 NDF; captioned), no key quorum above 1-of-1, no intents, no webhooks, no dashboard screenshot (the plain-words policy from `GET /policy/:address` replaces it). No contract, bridge or circuit changed.

## 2. Parts

| Part | Where | What it does |
|---|---|---|
| Policy builder | `automation/src/policy.ts` (`buildRules` :52, `denyAllRule` :73, `applyRevoked` :82, `applyApproved` :87, `describeRules` :105, `evaluate` :175) | Pure function from a decision and the addresses to the Privy rules; plain-words rendering; the local evaluator. Tests: `automation/test/policy.test.ts` (13 tests). |
| Watcher | `automation/src/watch.ts` (`poll` :40, `onApproved` :70, `onRevoked` :99) | Polls `Approved` and `Revoked` for the policy id every `POLL_MS`; creates the per-investor policy from `decisionOf`; appends or removes the deny-all rule; updates the expiry rule when the decision's expiry changed. |
| Policy backend | `automation/src/policies.ts` (`PrivyPolicies` :39: `policies().create` :42, `createRule` :48, `deleteRule` :59) | privy mode: the Privy app's policies, created without an owner (so the app secret updates them); local mode: in memory. |
| Signer | `automation/src/signer.ts` (`PrivySigner` :76, `sendTransaction` with `caip2` :94 to :95; `LocalSigner` :44, evaluator call :69) | privy mode: `privy.wallets().ethereum().sendTransaction(walletId, {caip2: 'eip155:<chain>', params: {transaction: {to, data, chain_id}}, authorization_context})`, signed with `PRIVY_AUTHORIZATION_KEY`. local mode: a dev key on anvil after the evaluator says ALLOW; `system.current_unix_timestamp` is anvil's block time so `evm_increaseTime` moves the clock the rule reads. |
| Tick | `automation/src/tick.ts` (`runTick` :29, `TICK OK` :53, `TICK DENIED policy` :60) | For every investor with a policy: find the delegated wallet, send `subscribe()`, wait for the receipt. Logs `TICK OK`, `TICK DENIED policy` followed by `TICK DENIED chain` (the chain's own `eth_call` answer and `isEligible`), `TICK DENIED chain` on a revert, `TICK SKIP ... no delegated wallet`. |
| HTTP server | `automation/src/server.ts` (`/status` :57, `/policy/:address` :5, `/tick` :81) | `GET /health`, `GET /status` (mode, addresses, poll interval, every policy in plain words, the log), `GET /policy/:address`, `POST /tick` (body `{"address": "0x..."}` for one investor, `{"target": "fundToken"}` sends to the wrong contract to show a refusal by policy). |
| Provider tree | `app/src/lib/WalletProvider.tsx` (:36 to :44), `app/src/lib/PrivyWalletProvider.tsx` (`PrivyProvider` :84 to :98, `createConfig` from `@privy-io/wagmi` :24, `Bridge` :35, `addSigners` :52, `removeSigners` :59) | With `VITE_PRIVY_APP_ID`: `PrivyProvider` (login by email, embedded wallet for users without one), `QueryClientProvider`, then `WagmiProvider` from `@privy-io/wagmi`, loaded lazily. Unset: the previous tree, unchanged. |
| Connect option | `app/src/lib/wallet.ts` (:119 to :121, logout on disconnect :163) | "Sign in with email, wallet by Privy" for the investor; "Connect operator wallet" (Privy's wallet picker) for the issuer. The bridge's EIP-191 session signature is unchanged: wagmi's `signMessage` reaches the embedded wallet through the synced connector. |
| Standing-order card | `app/src/components/StandingOrderCard.tsx` (Allow :43, Run the month :51, Remove signer :59), mounted after the doors card (`app/src/screens/InvestorScreen.tsx:66`) | The policy in plain words from `GET /policy/:address`; Allow calls `useSigners().addSigners({address, signers: [{signerId, policyIds: [policyId]}]})`; Run the month posts `/tick`; Remove signer calls `removeSigners`. |
| Automation log | `app/src/components/AutomationLog.tsx`, mounted next to the event log (`app/src/screens/IssuerScreen.tsx:87`) | The issuer console's view of `GET /status`: mode, poll interval, policies per investor, the log lines. |
| Local run | `scripts/standing-order-local.sh` | Section 6. |

Environment. App (`app/.env.example`): `VITE_PRIVY_APP_ID`, `VITE_PRIVY_SIGNER_ID`, `VITE_AUTOMATION_URL`, all optional; unset means the previous provider tree and no card. Automation (`automation/.env.example`): `AUTOMATION_SIGNER=privy|local`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_AUTHORIZATION_KEY`, `PRIVY_SIGNER_ID`, `RPC_URL`, `CHAIN_ID`, `REGISTRY`, `SUBSCRIPTION`, `FUND_TOKEN` (optional, for the wrong-target refusal), `POLICY_ID`, `START_BLOCK`, `POLL_MS`, `LOCAL_INVESTOR_KEYS` (local mode), `PORT`. One switch: `VITE_PRIVY_APP_ID` set means Privy on the investor side, and the automation's `AUTOMATION_SIGNER=privy` is the server-side half. `.env` is gitignored at the repository root (`.gitignore:13`, covers `automation/.env`) and in `app/` (`app/.gitignore:4`); checked with `git check-ignore -v` on 2026-09-09.

## 3. The policy, exactly

Per investor, created on `Approved` with `name: attestat-standing-order-<address>`, `chain_type: ethereum`, `version: 1.0`, no owner. The two rules, as sent to `POST /v1/policies` (values for Sepolia and a Subscription contract at `0x5FC8...5707`; the expiry is the decision's `expiry`, Unix seconds):

```json
[
  {
    "name": "decision expired: deny everything",
    "method": "*",
    "action": "DENY",
    "conditions": [
      { "field_source": "system", "field": "current_unix_timestamp", "operator": "gte", "value": "1800000000" }
    ]
  },
  {
    "name": "subscribe into the fund",
    "method": "eth_sendTransaction",
    "action": "ALLOW",
    "conditions": [
      { "field_source": "ethereum_transaction", "field": "to", "operator": "eq", "value": "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707" },
      { "field_source": "ethereum_transaction", "field": "chain_id", "operator": "eq", "value": "11155111" },
      {
        "field_source": "ethereum_calldata",
        "field": "function_name",
        "abi": [{ "name": "subscribe", "type": "function", "stateMutability": "nonpayable", "inputs": [], "outputs": [] }],
        "operator": "eq",
        "value": "subscribe"
      }
    ]
  }
]
```

Appended on `Revoked` (`POST /v1/policies/<id>/rules`), deleted on the next `Approved`:

```json
{ "name": "decision revoked: deny everything", "method": "*", "action": "DENY", "conditions": [] }
```

Semantics the design relies on (FACT, https://docs.privy.io/controls/policies/overview, fetched 2026-09-09): DENY takes precedence over ALLOW; a request no rule resolves is denied. So `personal_sign`, a transfer, a call to any other contract, a call on any other chain, and any call after the expiry are denied without a rule naming them. The rules in plain words, as the screens show them (`describeRules`):

1. Deny every request once the clock passes the decision's expiry, `<date> UTC`.
2. Allow eth_sendTransaction only to the Subscription contract `<address>` on chain `<id>`, only when the calldata is subscribe().
3. Deny every request: the issuer revoked the decision. (only after a revoke)

The signer is attached with that policy as its override policy: `addSigners({address, signers: [{signerId: VITE_PRIVY_SIGNER_ID, policyIds: [policyId]}]})`. Privy evaluates only the signer's override policy for the signer's requests (CLAIM, https://docs.privy.io/recipes/wallets/conditional-signer-policies.md, fetched 2026-09-09 by the research page).

## 4. Dependencies and the compatibility finding

Installed with bun on 2026-09-09, pinned exactly: `@privy-io/react-auth` 3.40.0 and `@privy-io/wagmi` 4.0.17 in `app/package.json`; `@privy-io/node` 0.34.0 and `viem` 2.56.3 in `automation/package.json`. Peer dependencies as npm states them (`bun pm view`, 2026-09-09): `@privy-io/wagmi` 4.0.17 wants `@privy-io/react-auth ^3`, `react >=18`, `wagmi >=2` and `viem 2.56.0` exactly; `@privy-io/react-auth` 3.40.0 wants `react ^18 || ^19` and lists Solana, permissionless and Farcaster packages as optional peers. The app has `viem` ^2.56.3 (resolved 2.56.3), `wagmi` 2.19.5, React 19.2.8, Vite 8.2.2; bun installed without an error, `tsc --noEmit` and `vite build` pass with and without the app id (checked 2026-09-09). The viem patch mismatch (2.56.3 against a peer of 2.56.0) produced no build or type error; behaviour at runtime with a real app id is unverified until the Sepolia run.

Behaviour of `@privy-io/wagmi` that shapes the design (FACT, `app/node_modules/@privy-io/wagmi/dist/esm/createConfig.mjs` and `useSyncPrivyWallets.mjs`, read 2026-09-09): its `createConfig` keeps only connectors of type `mock` and turns off injected-provider discovery, and its wallet sync replaces wagmi's connector list with one connector per Privy wallet (`io.privy.wallet.<address>` for the embedded wallet). So while `VITE_PRIVY_APP_ID` is set, the dev signer and the plain injected connector are not available; the investor signs in by email and the operator connects through Privy's wallet picker (`usePrivy().connectWallet`). `useDisconnect` from wagmi is not supported with Privy; disconnect is Privy's `logout()`. The Playwright modes never set the app id and keep the dev signer.

## 5. Fallback

Trigger (evaluation section 6): the Privy dashboard shows the app as "On-device" with "Request access to migrate to TEE", or a policy cannot be created on the free app, or `addSigners` fails on Sepolia within one bounded task. Then: email sign-in and the embedded wallet stay (the connect option, the bind, present, attest, approve, `subscribe()` hand-clicked from the embedded wallet on the doors card, revoke, refused subscribe); the standing-order card is hidden by leaving `VITE_AUTOMATION_URL` unset; the automation stays in local mode as documentation and is not in the video, not in the README's Privy section and not in the submission text. Financial flow track only in that shape; no control claimed. Kill both if no app id exists by the morning of 2026-09-11.

## 6. Local run (class L, no Privy app)

```
scripts/standing-order-local.sh            # about 20 s after the contracts are built; prints STANDING-ORDER-LOCAL PASS
scripts/standing-order-local.sh --keep     # leave anvil and the automation running
```

What it does: anvil on a free port; `Deploy.s.sol`; the automation in local mode (`AUTOMATION_SIGNER=local`, `LOCAL_INVESTOR_KEYS` = anvil key 1, `POLL_MS=1000`); `attestByOperator` for anvil address 1 with expiry = chain time + 120 s; asserts `GET /policy/<address>` shows two rules with the decision's expiry, DENY then ALLOW, the Subscription address, `delegated: true`; three `POST /tick`, each `ok`, balance 300 NDF, three `TICK OK` lines; `revoke`, waits for `POLICY DENY-ALL ADDED`, a tick answers `denied-policy` with the deny-all rule named, and the log carries `TICK DENIED policy` before `TICK DENIED chain`; `approve` again, waits for `POLICY DENY-ALL REMOVED`, a tick is `ok`, balance 400 NDF; `evm_increaseTime 121` and `evm_mine`, a tick is `denied-policy` by the timestamp rule and the chain refuses too (`isEligible` false); a second investor (anvil address 2, no local key) is attested and its tick reports `no-delegated-wallet`. Run record: `.e2e/standing-order/` (gitignored): `automation.log`, `tick-N.json`, `policy-1.json`, `status.json`.

Measured 2026-09-09 on the builder's Mac (M3 Max): 17 s wall from anvil to PASS with the contracts already built. Caption for anything from this run: "simulated Privy policy (local)"; it is never in the video.

With the app: `scripts/browser-real-wallet-up.sh` or `scripts/app-e2e-local.sh` start the stack without the automation; to see the log panel on the issuer console against a local stack, start the automation by hand in local mode with the deployed addresses (`REGISTRY`, `SUBSCRIPTION`, `RPC_URL`, `CHAIN_ID=31337`) and set `VITE_AUTOMATION_URL` for the app. Without `VITE_PRIVY_APP_ID` the standing-order card stays hidden (it needs the embedded wallet).

## 7. Runbook for the builder's Sepolia run (class S, hand-clicked)

Nothing below is done by an agent. Values in angle brackets are never pasted into a chat. Prerequisites: the Sepolia deployment (handoff action 1: `Deploy.s.sol`, `DeployNoirVerifier.s.sol`, the bridge against Sepolia) and the browser flow working on Sepolia with the official test wallet.

1. Privy account and app at https://dashboard.privy.io, app name "Attestat", environment Development. Record `<PRIVY_APP_ID>` and `<PRIVY_APP_SECRET>` (App settings; exact page names unverified).
2. Login methods: enable Email. Embedded wallets: leave the defaults (the code sets `createOnLogin`). Allowed origins: add the app's origin (`http://localhost:5173`, or the port the stack script prints, and any tunnel URL used for the phone run).
3. Gate check, TEE: Wallets page, Advanced tab. Expected "TEE enabled". If "On-device" with "Request access to migrate to TEE": click it and switch to the fallback (section 5) unless access arrives the same day.
4. Wallet infrastructure, Authorization keys, "Create new key". The modal shows the key quorum id and the private key. Key quorum id: `<PRIVY_SIGNER_ID>` (goes into `app/.env` as `VITE_PRIVY_SIGNER_ID` and into `automation/.env` as `PRIVY_SIGNER_ID`). Private key: `<PRIVY_AUTHORIZATION_KEY>` (automation only; Privy cannot recover it).
5. Gate check, policies: Wallet infrastructure, Policies, create one throwaway policy by hand (Ethereum, one ALLOW rule for `eth_sendTransaction` with `to` equal to any address). Expected: it saves and shows an id; delete it afterwards. An upgrade or contact-sales prompt means the fallback.
6. Fill `automation/.env` from `automation/.env.example`: `AUTOMATION_SIGNER=privy`, the four `PRIVY_*` values, `RPC_URL=<SEPOLIA_RPC_URL>`, `CHAIN_ID=11155111`, `REGISTRY`, `SUBSCRIPTION`, `FUND_TOKEN` from the Sepolia deployment, `START_BLOCK` = the deployment block. Start it: `cd automation && bun install && bun run src/server.ts`. Expected first line: `WATCH START registry ... from block ...`. Fill `app/.env`: `VITE_PRIVY_APP_ID`, `VITE_PRIVY_SIGNER_ID`, `VITE_AUTOMATION_URL=http://127.0.0.1:8790`, `VITE_CHAIN_ID=11155111`, the addresses, `VITE_BRIDGE_URL`. Start the app (`bun run dev`).
7. Test 5, sign-in and bind: investor portal, "Sign in with email, wallet by Privy", the email code; the connect card shows the embedded wallet address and "Embedded wallet by Privy". Send about 0.05 Sepolia ETH from the deployer to that address (gas sponsorship is not relied on). Create the presentation request; the wallet signs `nachweis:session:<id>` through Privy's signing modal; the bridge answers `address-proof` 200. Present with the official test wallet, prove in the tab, attest. Issuer console: "Connect operator wallet" opens Privy's wallet picker; pick the extension that holds the operator key; Approve. Record: session id, attest hash, approve hash. No email address in the record.
8. Test 6, policy and delegation: the automation log shows `POLICY CREATED <id> for <address>: 2 rules, expiry <E>` within `POLL_MS`; `GET /policy/<address>` and the card show the two rules; the dashboard's Policies page lists the id. Card: Allow. Privy's consent modal. Afterwards the card shows "delegated" and the log's `/status` shows `delegated: true` for the address (the automation reads it from `wallets().list`). Record: policy id, the delegation.
9. Test 7, two runs with the tab closed: close the investor tab, `curl -X POST http://127.0.0.1:8790/tick`; expected `TICK OK <address> <hash>`; balance plus 100 NDF; again, plus 100. Record: two hashes.
10. Test 8, refusal by policy on a wrong target: `curl -X POST -H 'content-type: application/json' --data '{"target":"fundToken"}' http://127.0.0.1:8790/tick`; expected `TICK DENIED policy <address>: Privy refused (<status>): <message>` and no hash. Record: status code and message verbatim (the exact wording is unverified until this step).
11. Test 9, revoke: issuer console, Revoke. Within `POLL_MS` the log shows `POLICY DENY-ALL ADDED`; the card shows the third rule. Run the month: "refused by Privy", the message, then "The chain: refuses too, isEligible false". Card: Remove signer; Privy's modal; the card shows "not delegated"; the next `POST /tick` logs `TICK SKIP <address>: no delegated wallet`. Record all three. State the poll interval on screen (the log panel prints it).
12. Test 10 (optional): `attestByOperator` from the operator wallet with expiry now plus 180 s for a second embedded wallet (a second email); after 180 s a tick is refused by the timestamp rule and by the chain.
13. Re-approve closes the loop: Approve again, `POLICY DENY-ALL REMOVED`, a tick is OK again (needs Allow again after Remove signer).

A tick that runs between the issuer's revoke and the watcher's next poll can still be signed by Privy and revert on chain (the chain refuses; the log shows `TICK DENIED chain`). The on-screen sentence says "closed by the issuer's automation when it sees the Revoked event", not "within a block".

## 8. Evidence template (class S)

Copy into `docs/evidence/privy-standing-order-YYYY-MM-DD.md`. Never an email address, never the app secret or the authorization key, never a dashboard screenshot with the secret visible.

| Field | Value | Label |
|---|---|---|
| Date and time (local) | | |
| Privy app environment name and app id (not the secret) | | live |
| Dashboard, Wallets, Advanced tab: execution environment label | | live |
| Policy creatable by hand (step 5): yes/no, id | | live |
| Signer id (key quorum id) | | live |
| Embedded wallet address | | live |
| Session id, attest hash, approve hash | | live |
| `POLICY CREATED` log line (id, expiry), time after Approved | | live |
| Dashboard lists the policy id: yes/no | | live |
| Allow: consent shown; `/status` delegated true | | live |
| Tick 1 hash, tick 2 hash; balance before and after | | live |
| Wrong target: status code and message verbatim | | live |
| Revoke hash; `POLICY DENY-ALL ADDED` time after Revoked; poll interval | | live |
| Refused tick: Privy's message verbatim; `isEligible` read | | live |
| Remove signer; next tick line | | live |
| Expiry test (optional): expiry, refusal by timestamp rule, chain read | | live |
| Versions: `@privy-io/react-auth`, `@privy-io/wagmi`, `@privy-io/node`, bun, browser | | |
| Deviations from this runbook | | |

## 9. On-screen sentences, verbatim

Investor card (`StandingOrderCard.tsx:74`): "Wallet by Privy: an embedded wallet created at email sign-in. Your identity evidence never goes to Privy. Privy sees this address, the transactions it signs, and one policy: the issuer's automation may send subscribe() for you to this fund until your decision expires on <date>. When the issuer revokes your decision, its automation closes the policy; you can remove the signer here at any time. Sample identity from the official test wallet; testnet funds."

Issuer panel (`AutomationLog.tsx:19`): "Automation by Privy: the issuer's key signs on the investor's wallet only under a policy copied from her on-chain decision. Revoke on chain, then the automation adds a deny rule to that policy. Privy enforces the policy; Privy does not read the chain."

Captions (`StandingOrderCard.tsx:122` and `:138`): "Stop it here at any time; the issuer's revoke stops it too." "scheduler tick: simulated by the Run the month button"; "demo fund: subscribe mints 100 NDF without payment"; "revocation: manual, by the issuer"; "the signer never sees the wallet's private key (Privy's statement)". The connect card adds, for the embedded wallet: "Embedded wallet by Privy, created at email sign-in. Your identity evidence never goes to Privy. The signer never sees the wallet's private key (Privy's statement)."

Never: "within a block", "nothing about you on chain", "on the device", "first", "only", any yield figure, "KYC". Privy on screen only after the Sepolia run is green (sponsor rule, product.md).

## 10. Unverified (until the Sepolia run)

- Whether a Privy app created in 2026 is TEE-enabled by default (step 3).
- The exact status code and message of a policy refusal from `sendTransaction`; the automation treats every 4xx from that call as a refusal and logs it verbatim.
- Case handling of the `to` condition (the rule carries the checksummed address; the local evaluator compares case-insensitively).
- `function_name` matching for a no-argument function (`subscribe()`), and whether the `abi` field must carry more than the one function.
- `@privy-io/wagmi` 4.0.17 at runtime with viem 2.56.3 (builds and types pass).
- Whether the embedded wallet signs on a chain with id 31337; the build does not depend on it (local mode uses a dev key).
- The delay between a rule update and its enforcement on the next request.
- The dashboard page names for the app secret and allowed origins.
