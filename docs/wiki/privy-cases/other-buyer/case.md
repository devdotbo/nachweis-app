---
type: plan
title: Privy business case, other buyer: the contractor payout desk
updated: 2026-09-09
sources:
  - /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/BRIEF.md (2026-09-09)
  - /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/other-buyer/research.md (all URLs and fetch dates, 2026-09-09)
  - /Users/bioharz/git/ethglobal/nachweis/wiki/handoff-fable-2026-09-09.md, product.md, spec-privy.md
  - /Users/bioharz/git/ethglobal/nachweis/raw/2026-09-06-product-pitch-legal.md
  - /Users/bioharz/git/ethglobal/nachweis-app (opus inventory 2026-09-09, read-only, main 5f5ceb9)
---

# The contractor payout desk

## 1. Sentence

A company can pay its freelance contractors in stablecoins from a shared treasury that is allowed to pay only adults who have shown state identity evidence, without the company ever holding an identity document, because the contractor's EUDI presentation becomes an on-chain decision bound to the payout address, with Privy providing the organization's treasury wallet, a two-officer key quorum and the policy that confines the wallet to the gated payout contract.

## 2. Who buys and who uses

- Buyer: the finance function of a company with EU freelance contractors, or a contractor-payments vendor selling to such companies (the Rise or Gigapay class, see research.md section 6). The prize text names "payroll systems" and "shared organization wallets" (FACT, BRIEF.md).
- Users: two finance officers (propose and approve a payout run) and the contractor (presents once, is paid repeatedly).
- Money that moves: a euro or dollar stablecoin from the company's treasury wallet to the contractor's own address. In the demo: the repository's MockStable, "mUSD", 6 decimals (FACT, contracts/src/test/MockStable.sol), on Sepolia; captioned test token.
- Why the buyer pays: today the buyer either runs a document funnel (and holds ID copies for every freelancer) or pays a bare address with no assurance about who is behind it. Neither is a rule the treasury can enforce. The payout desk gives it one: pay only addresses with a live decision, and stop when the decision is revoked or expires. The name for the invoice record still reaches the relying party from the presentation, never the chain (product.md flow step 1).

## 3. Otherwise not possible

- FACT: a contract with a minor is pending until the legal representative approves it (German Civil Code sections 106 to 108, English text in research.md section 6). FACT for existence: Directive 94/33/EC obliges member states to prohibit work by children. A company that pays a self-hosted address cannot know whether the counterparty has capacity to contract or may lawfully work. Over 18 is precisely the predicate the law defines, so a predicate answer suffices here (OPINION in the legal memo, lines 137 to 140: "A predicate proof is legally sufficient wherever the duty is defined by the predicate: age ...").
- FACT: an employer or a company paying contractors is not an AMLR obliged entity (Regulation (EU) 2024/1624 Art 3 list has no such item, research.md section 6). It owes no customer due diligence, so it has no legal basis or appetite to collect and retain identity documents, yet it wants assurance. GDPR Art 5(1)(c) data minimisation points the same way (FACT via the legal memo, line 116).
- FACT: Privy's policy engine evaluates transaction fields, calldata, typed data and request bodies (field sources listed in research.md section 2). It has no field source for "who controls the recipient address". A treasury policy over identity cannot be written in Privy, or in any wallet policy engine we know of, without an on-chain predicate to read (OPINION for "any").
- CLAIM: today's contractor payout products require the freelancer to "complete KYC verification and submit the relevant tax forms" (Rise, 2026-09-08) and hold those documents themselves. The company outsources the document problem; it does not remove it.
- FACT: the on-chain decision already has the needed shape: isEligible requires approval, not revoked, expiry in the future and bits present (contracts/src/AttestationRegistry.sol:187-191); bits 0x3 are identity evidence and over 18 (contracts/src/FundToken.sol:25-28). The payout gate is the same call the fund token and the pool make. One decision, a third door.
- Why now (FACT via legal memo, line 171, and research.md section 6): member-state wallets by 2026-12-24; private relying parties in financial services must accept the wallet from 2027-12-24 under eIDAS Art 5f(2). A plain employer is not obliged to accept the wallet; a payment institution running payroll is. Say so on screen.

## 4. Privy as core

Primary track: Best B2B financial product. Second track (Best financial flow): also met, in my opinion, by the same payout transaction (a stablecoin payment from a Privy wallet is a "supported wallet action"; we do not claim Privy's Transfer action since the money moves through our contract call).

- Wallet type: a Privy server wallet (Ethereum), created with `privy.wallets().create({chain_type: 'ethereum', owner_id: <key quorum id>, policy_ids: [<policy id>]})` (FACT, research.md section 1). It is the company's payout treasury. Contractors keep their own wallets; no Privy user wallets are needed.
- Control 1, key quorum: two authorization keys (officer A, officer B), threshold 2, created with `keyQuorums().create` (FACT, section 3). The quorum owns both the wallet and the policy, so neither can be changed by one officer or by the app secret alone.
- Control 2, policy: default DENY; one ALLOW rule for `eth_sendTransaction` with conditions `ethereum_transaction.to == GatedPayout`, `ethereum_transaction.chain_id == 11155111`, `ethereum_calldata.function_name == payout` (ABI supplied), and `ethereum_calldata.payout.total <= cap` (FACT that each field source and operator exists, section 2). Optional: a stateful aggregation for a rolling daily cap (max 10 aggregations per app, FACT).
- Approval flow: intents. Officer A proposes with `client.intents().rpc(walletId, {method: 'eth_sendTransaction', caip2: 'eip155:11155111', params: {transaction: {to: GatedPayout, data}}})`; officer B authorizes via `POST /v1/intents/{id}/authorize`; Privy executes when the threshold is met (FACT, section 3). Fallback if intents are gated for a free app (unverified): synchronous 2-of-2 signing with both keys in `authorization_context` (FACT, section 3), still a key quorum control.
- Why core and not decoration: remove Privy and the demo needs a multisig plus a custom policy layer; remove Attestat and the Privy policy has nothing to gate on. Privy enforces where the money may go; the chain enforces who may receive it.

Requirement lines mapped to artifacts:

| Requirement (both tracks) | Artifact |
|---|---|
| Integrate Privy as a core part | payout service (bun, `@privy-io/node` 0.34.0) creates wallet, quorum, policy, intents; app PayoutScreen drives it |
| Create or use at least one Privy wallet | the treasury server wallet, id and address shown on screen and in the evidence record |
| Business or organization use case | contractor payout run by a finance team |
| Functional B2B workflow (payment, approval, treasury operation) | propose, second approval, execution of GatedPayout.payout from the treasury wallet |
| At least one Privy control | key quorum 2-of-2 (owner) and the policy (ALLOW only GatedPayout on Sepolia, DENY else); refusal shown live |
| Functional financial flow using a GA feature | the stablecoin payout transaction sent by the Privy wallet ("other supported wallet actions") |
| Working demo and source | Sepolia run recorded in docs/evidence, repository public |
| Explain how Privy enables the product / improves UX | README section "Privy" and the on-screen sentence (section 8) |

## 5. The flow, as in the demo video

1. Contractor screen (the existing investor screen with contractor labels). The contractor connects their own wallet. On screen: "Present your identity evidence (official test wallet, sample identity)". QR appears (existing PresentCard).
2. The official German EUDI test wallet on the iPhone answers the request. The browser tab decrypts the relayed response and proves (11.1 s measured on the builder's M3 Max, FACT, handoff). Caption: "proof made in this browser tab".
3. The bridge submits attestWithProof on Sepolia. The status card shows: evidence yes, over 18 yes, approval pending, expiry date. No name on chain.
4. Finance desk screen (the existing issuer screen with finance labels). Officer A sees the pending row, clicks Approve. Transaction hash. Caption: "approval is a separate on-chain step".
5. Payout desk screen (new). Card "Payout run": recipient list read from the chain (addresses with a live decision), amount per recipient, total. Officer A clicks "Propose run". The service creates the Privy intent. On screen: intent id, status Pending, 1 of 2.
6. Officer B (second browser tab, second bearer token) opens Approvals, sees the run with the decoded calldata, clicks Approve. The service authorizes the intent; Privy executes eth_sendTransaction from the treasury wallet. On screen: status Executed, Sepolia transaction hash, contractor balance +100 mUSD. Caption: "treasury wallet by Privy, two-officer quorum".
7. Refusal beat 1 (Privy control). Officer A clicks "Pay directly" (a plain ERC-20 transfer to the contractor address, bypassing the gate). Privy's policy denies; the error text appears on screen. Caption: "the treasury may only pay through the gate".
8. Revoke beat (chain control). Finance desk revokes the contractor (existing RevokeByAddress). Officer A proposes a new run with the same recipient, officer B approves. Privy allows the call (it is to GatedPayout), the chain refuses with `NotEligible(address)`, the intent shows Failed with the revert. Caption: "revoke is manual; the gate is on chain, not in our database". The contractor's status card shows revoked, and the fund token door from the main demo is closed by the same revoke.

## 6. What changes in the code

Contracts, one new contract (unavoidable: Privy cannot read chain state, so the recipient gate must be a contract; the existing FundToken gate is on the fund token, not on a stablecoin):

- contracts/src/GatedPayout.sol (new, about 50 lines): immutables registry, policyId, requiredBits; `payout(IERC20 token, address[] recipients, uint256[] amounts)`: for each recipient `require isEligible` else `revert NotEligible(recipient)`, then `token.transferFrom(msg.sender, recipient, amount)`; event PaidOut. Same pattern as contracts/src/Subscription.sol:23-28.
- contracts/test/GatedPayout.t.sol (new): eligible pays; no decision, unapproved, revoked and expired each revert; partial batch reverts whole.
- contracts/script/DeployPayout.s.sol (new): deploys MockStable and GatedPayout against an existing registry (env REGISTRY_ADDRESS, POLICY_ID, REQUIRED_BITS), mints mUSD to a TREASURY address, logs addresses. Deploy.s.sol unchanged.

Payout service, new directory payout/ (bun, TypeScript, mirrors companion/):

- Dependencies: `@privy-io/node` ^0.34.0, `viem` ^2.56.3 (versions FACT from npm, 2026-09-09). Install with bun.
- payout/src/server.ts: routes GET /state, POST /runs (propose), POST /runs/:id/approve, POST /direct (the bypass attempt), GET /runs/:id. Two bearer tokens, PAYOUT_TOKEN_A and PAYOUT_TOKEN_B, select the officer.
- payout/src/signer/privy.ts and payout/src/signer/dev.ts behind one interface; env PAYOUT_SIGNER=privy|dev. Dev: two local keys, the second approval is recorded in memory and captioned simulated, the payout is sent with an anvil key. Privy: intents, or synchronous 2-of-2 if PAYOUT_QUORUM_MODE=sync.
- payout/src/setup.ts: one-time, creates the key quorum, the policy (owner quorum) and the wallet (owner quorum, policy attached), prints ids into payout/.env.local (gitignored). Authorization keys come from the dashboard (Wallets, Authorization keys, New key; FACT); private keys live only in the builder's env.
- Env: PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_AUTH_KEY_A, PRIVY_AUTH_KEY_B, PRIVY_WALLET_ID, PRIVY_POLICY_ID, PRIVY_KEY_QUORUM_ID, RPC_URL, CHAIN_ID, GATED_PAYOUT, PAYOUT_TOKEN, REGISTRY, POLICY_ID, REQUIRED_BITS, DEV_PAYOUT_KEY, PAYOUT_TOKEN_A, PAYOUT_TOKEN_B.

App:

- app/src/lib/role.ts: add `'payout'` to Role; App.tsx:93-99 routes it; Header gets the third switch.
- app/src/screens/PayoutScreen.tsx (new) with components PayoutRunCard.tsx and ApprovalsCard.tsx; app/src/lib/payout.ts (client for the payout service); app/src/config.ts adds VITE_PAYOUT_URL, VITE_GATED_PAYOUT, VITE_PAYOUT_TOKEN, VITE_PRODUCT_LABELS (`fund` default, `payout` swaps investor to contractor and issuer to finance desk in the two existing screens' headings only).
- Unchanged: wallet wiring, chain writes, bridge client, browser prover, the two existing screens' logic, service/, circuits/.

Scripts and docs: scripts/payout-local.sh (anvil, Deploy, DeployPayout, bridge, payout service in dev mode, Vite), docs/payout.md (runbook, Sepolia steps for the builder), docs/evidence/payout-template.md, README section "Privy", app/e2e/payout.spec.ts.

## 7. Evidence plan

Green with class L (local) by 2026-09-12, no Privy account needed:

1. forge test: GatedPayout suite passes (pass: all new tests green, existing 97 unchanged).
2. bun test in payout/: dev signer run proposes, records the second approval, sends payout on anvil, then a revoked recipient makes the run fail with NotEligible (pass: assertions on balance and revert selector).
3. Playwright app/e2e/payout.spec.ts on the stub-wallet stack: attest, approve, propose, approve, balance +100 mUSD, revoke, second run refused (pass: spec green; dev mode captions "simulated approval, Privy not connected").
4. Existing specs sp1-mock, noir, browser-prover still pass with VITE_PAYOUT_URL unset.
5. Typecheck and production build with and without the payout env.

Needs the builder (Privy app id and secret, add-on enabled, two authorization keys, Sepolia deployment, Sepolia ETH in the treasury wallet):

6. setup.ts creates quorum, policy, wallet on the Privy app (pass: three ids returned, wallet address funded).
7. Sepolia run by hand with the official test wallet: steps 1 to 8 of section 5 (pass: intent Executed with a Sepolia hash; direct pay denied by the policy with Privy's error recorded; post-revoke run Failed with NotEligible). Record in docs/evidence/payout-sepolia-<date>.md with hashes, wallet id, policy id, no names, no keys.
8. Morning check (first thing): can a free app create a policy and a key quorum, and an intent? Pass: the three create calls return 200. Fail: see kill criteria.

## 8. Honesty check

Sentences on screen that touch identity, custody or Privy, checked against product.md:

- "Official test wallet, sample identity." (never "real state-issued identity")
- "No identity documents on chain, and nothing we could use to find her." (never "nothing about you on chain")
- "Proof made in this browser tab." (place of proof stated; never "on the device")
- "Approval and revoke are manual steps by the finance desk." (manual captioned)
- Dev mode only: "Second approval simulated; Privy not connected." (simulated captioned)
- "Eligible means: identity evidence and over 18, approved, not revoked, not expired. It does not mean one person per address." (the circuit has no per-person nullifier, FACT, research.md section 7; never claim uniqueness)
- "A company paying contractors is not an AMLR obliged entity; this gate is capacity and age, not customer due diligence." (KYC does not appear; product.md rule)
- Proposed Privy sentence, verbatim: "Treasury wallet by Privy: the company's payout wallet is a Privy server wallet owned by a two-officer key quorum, with a Privy policy that lets it pay only through the GatedPayout contract on this chain. Privy sees addresses, amounts and calldata, never identity evidence. Sample identity from the official test wallet; testnet funds."
- Never say "self-custodial" or "non-custodial" beyond Privy's own words (CLAIM if quoted); never "compliant payroll", "tax compliant", "first", "only"; no yield or savings figures. Privy appears in the video only if acceptance tests 6 and 7 are green (product.md sponsor rule).

## 9. Size and review burden

Large. Files: 3 contracts files, about 6 payout service files, about 6 app files, 1 script, 3 docs, 1 Playwright spec. Decision points needing the builder or lead: (1) intents versus synchronous quorum signing, decided by the morning check; (2) label map versus a separate contractor screen; (3) MockStable versus a public Sepolia test stablecoin (address unverified, MockStable proposed); (4) where officer B's key lives in the demo (both in the service env for the video, stated on screen). Risks: policies and key quorums are "Available as add-on" on the free plan (FACT, pricing page) with no statement whether that is self-serve; the dashboard's manual approvals UI is Enterprise (FACT), and whether API intents are open to a free app is unverified; Privy sign-only on anvil 31337 unverified, so the Privy path is Sepolia only; Sepolia gas for the Privy wallet; the week is short.

Kill criteria: if the morning check (test 8) shows neither a policy nor a key quorum can be created on the free app, the B2B track cannot be claimed honestly; shrink to Financial flow as primary (Privy server wallet pays through GatedPayout, no quorum) and say so in the submission text. If policies work but intents do not, use synchronous 2-of-2 signing. If the Privy wallet cannot send on Sepolia within one bounded teammate task, stop, keep the branch, no merge, no Privy in the video.

## 10. Unverified

- Whether "Available as add-on" for the policy engine and key quorums can be switched on by the builder in the dashboard on the free plan, or needs sales.
- Whether a free app can create and authorize intents through the API (only the dashboard UI is documented as Enterprise).
- The Node SDK method name for authorizing an intent (Java shows `intents().authorize`; REST endpoint confirmed).
- Whether Privy signs transactions for chain id 31337 and evaluates policy chain_id conditions for it.
- Whether `ethereum_calldata` conditions can address an array parameter's sum (the cap may have to be a per-run total passed as a scalar argument; design the ABI accordingly).
- SDK helper for generating P-256 authorization keys (dashboard path confirmed).
- A public Sepolia stablecoin address; whether Privy's own Transfer action supports MockStable as a custom ERC-20 on Sepolia (not needed for the primary path).
- Any national rule that obliges a company paying freelancers to verify age beyond capacity and child-labour law; the Platform Work Directive search found none.

## 11. Rejected variants

- Marketplace or platform seller payouts (DAC7): the platform must collect and verify name, address, date of birth and TIN for individual sellers anyway (CLAIM, research.md section 6), so it holds identity data regardless; the "otherwise not possible" is weaker and the demo would need a fake tax record.
- DAO or cooperative treasury, one natural person one vote: the circuit has no per-person nullifier (FACT), so uniqueness cannot be shown; there is also no buyer with a budget (legal memo row 6: "Nobody by law").
- Exchange or broker withdrawal to a self-hosted address (TFR Art 14(5), the strongest legal hook): the buyer is a CASP with full customer due diligence, the word KYC becomes unavoidable, and the wallet is the user's, so Privy's organization controls are decoration. It also sits next to the fund issuer lens.
- Age-gated gaming or prediction-market payouts: the over-18 bit fits, but gambling licensees owe full customer due diligence (legal memo section 2.2) and the Privy part would be user wallets, not a business workflow.

The payout desk wins because the duty is a predicate (capacity and age), the payer is not an obliged entity, the money moves from a shared organization wallet under a policy and a quorum, and the revoke beat shows the chain refusing a payment that both officers and Privy allowed.
