---
type: memo
agent: architecture
title: Pluggable eligibility attestation, inputs, one decision, many outputs, grounded in standards and code
fetched: 2026-09-06
method: shallow clones (depth 1) of eas-contracts, coinbase/verifications, TokenySolutions/T-REX, Uniswap/v4-periphery, Consensys/linea-attestation-registry, ethereum/ERCs, erc-8004/erc-8004-contracts, ChaosChain/trustless-agents-erc-ri, centrehq/verite, smartcontractkit/chainlink-ace into [local path, withheld] read by five Opus inventory subagents with file and line citations; three Fable web-research subagents (WebSearch and WebFetch); tiefgang skill (Perplexity Search and Parallel Search feeders, fetch.sh, extract.py, GitHub API, one Parallel Task pro second opinion, linkcheck.sh) as instructed by the moderator; read-only reads of the builder's repos under [local path, withheld] and [local path, withheld] All fetches dated 2026-09-06 unless stated.
---

# Pluggable eligibility attestation

Question from the lead: design an "eligibility attestation" product with pluggable inputs and pluggable outputs so that one verified decision can be consumed by many systems on and off chain, grounded in real standards and code, neutral, not a one-pool demo.

## Short answer

The product shape already exists in production in one place, Coinbase Verifications on Base: one attester, three public EAS schemas, a tiny indexer contract, and any third party reads the attestation with two view calls. COUNT (base.easscan.org, 2026-09-06): 722,434 Verified Account, 306,438 Verified Country and 173,435 Coinbase One attestations. The proposal below copies that consumer contract exactly, replaces the exchange account with a state wallet as the input, adds a policy layer that outputs predicates instead of a plaintext country, and adds adapters so the same decision lands as an ERC-3643 claim, a Uniswap allowlist answer, an ERC-7943 transfer gate, an ENS text record, a signed SD-JWT for off-chain flows, and an HTTP 402 style challenge for APIs. Two outputs go in the video (EAS on Sepolia and the Uniswap allowlist checker reading it); the rest are one contract or one config each and belong on the roadmap slide.

The state that we do not invent: the credential format (SD-JWT VC, mdoc), the presentation protocol (OpenID4VP 1.0), the revocation source (IETF Token Status List), the attestation store (EAS), the consumer interfaces (IAllowlistChecker, IClaimIssuer, ERC-7943 canTransact, ENS text, x402 extensions). What we write: one policy engine, one schema, one resolver, and one thin adapter per consumer.

## 1. Standards table

| Standard or system | What it standardises | Live? | Chains | What an issuer must implement to plug in | Source (fetched 2026-09-06) |
|---|---|---|---|---|---|
| W3C Verifiable Credentials Data Model 2.0 | Credential and presentation data model; securing via Data Integrity or JOSE/COSE | FACT: W3C Recommendation 2025-05-15 (all three specs) | n/a | Issue a VC with a securing mechanism; a verifier checks issuer key and status | https://www.w3.org/TR/vc-data-model-2.0/ |
| IETF SD-JWT VC | Selective disclosure credential (the German PID format `dc+sd-jwt`, vct urn:eudi:pid:de:1) | FACT: Internet-Draft 19 (2026-08-31), IETF Last Call ends 2026-09-15, not an RFC | n/a | Sign an SD-JWT with disclosures, holder binding key, `status` claim | https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/ |
| IETF Token Status List | Bitstring status list token (`statuslist+jwt`) referenced from a credential's `status.status_list.{idx,uri}` | FACT: draft 21, submitted to IESG, not an RFC | n/a | Publish a signed status list; verifiers fetch and decode one bit. The builder's verifier already does this fail-closed: klartext-verifier/verifier-core/src/status.rs:1-12 (`check_status_list_token`, `RejectKind::StatusListUntrusted`), tests in verifier-core/tests/status.rs | https://datatracker.ietf.org/doc/draft-ietf-oauth-status-list/ |
| OpenID4VP 1.0 | Presentation request and response (DCQL, `dc+sd-jwt`, `mso_mdoc`, direct_post) | FACT: Final, 2025-07-09; no ZK format in 1.0 (grep of spec HTML) | n/a | Run a verifier endpoint (request object, response_uri). Exists: klartext-verifier/verifier-core/src/pid.rs | https://openid.net/specs/openid-4-verifiable-presentations-1_0.html |
| mso_mdoc_zk (Google extension over OpenID4VP) | ZK proof request format with `zk_system_type`, verified with longfellow-zk | FACT: documented by Google Wallet verifier docs; pre-standard, not in OpenID4VP 1.0; EUDI ARF topic G defines requirements, no format | n/a | Accept the proof format and pin circuits. Exists, fail-closed: klartext-verifier/verifier-zk/src/lib.rs | https://developers.google.com/wallet/identity/verify/accepting-ids-from-wallet-online and https://eudi.dev/latest/discussion-topics/g-zero-knowledge-proof/ |
| Ethereum Attestation Service (EAS) | On-chain attestations against a registered schema: `attest`, `revoke`, `attestByDelegation`, `timestamp` and `revokeOffchain` for off-chain attestations, resolvers that can veto (`SchemaResolver.onAttest`, false reverts with `InvalidAttestation`, EAS.sol:599-603) | FACT: v1.9.0, MIT, 25 chain deployment directories (26 minus hardhat), 15 mainnets, 11 testnets | Mainnet, Optimism, Base, Arbitrum One and Nova, Polygon, Scroll, zkSync, Celo, Telos, Soneium, Ink, Unichain, Linea, Blast; testnets incl. Sepolia (EAS 0xC2679fBD37d54388Ce493F1DB75320D236e1815e, SchemaRegistry 0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0), Base Sepolia and Base (predeploys 0x4200...0021 and 0x4200...0020). Not on Sapphire, Hedera, Arc | Register a schema (`SchemaRegistry.register(schema, resolver, revocable)`, UID = keccak of the triple, SchemaRegistry.sol:52-53); call `attest` with `recipient`, `expirationTime`, `revocable`, `data`; optional resolver for attester allowlist and indexing; optional EIP712Proxy for gasless delegated attestation | [local path, withheld], deployments/ |
| Coinbase Verifications (2023, EAS) | Three EAS schemas on Base: `bool verifiedAccount`, `string verifiedCountry` (ISO alpha-2 plaintext), `bool verifiedCoinbaseOne`; an `IAttestationIndexer.getAttestationUid(recipient, schemaUid)` contract; an `AttestationAccessControl` abstract with `onlyAttestation(schemaUid)`; a resolver that allowlists the attester and indexes | FACT: schemas live on base.easscan.org with 1.2M attestations; repo last commit 2024-08-15, not archived; attestations issued with `expirationTime: 0` and `revocable: true` (StaticAttester.sol:145-149). The CDP docs page returned content via Parallel Extract (possibly cached) but 404 on a direct link check (archive 2025-09-26); whether Coinbase still issues new EAS attestations is unverified | Base mainnet, Base Sepolia | Not pluggable: only Coinbase attests. For a consumer: `forge install coinbase/verifications`, inherit `AttestationAccessControl`, call indexer then `EAS.getAttestation`, check `revocationTime == 0` | [local path, withheld], src/abstracts/AttestationAccessControl.sol:33-55, src/interfaces/IAttestationIndexer.sol:37; https://base.easscan.org/schema/view/0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9 |
| Base Verify Onchain (2026, successor shape) | The consumer contract extends `BaseVerifyConsumer` and declares an immutable `provider()` plus `conditions()` (e.g. `coinbase_one_active eq true`) as public view functions; the user signs a SIWE message naming the contract; `POST https://verify.base.dev/v1/onchain_verifications` returns `{identityHash, expiration, signature}`; the contract calls `SignerRegistry.verifyVerification(...)`, which checks signature, expiry and recomputes the policy hash from the live on-chain policy; the contract dedupes on `identityHash` (one person, once) | FACT: Base Sepolia only (chain 84532), "not deployed on Base mainnet", verifications "short-lived (a few minutes)"; SignerRegistry 0x4f15593fbF7e3491d15080e1610E7AF8deBA1a02 | Base Sepolia | Not pluggable: Base holds the signer key. Design lesson: Coinbase's 2026 shape moved the policy into the consumer contract and replaced the persistent attestation with a short-lived signed receipt checked in the same transaction; the identityHash replaces a plaintext country. Our O1 keeps persistence (cross-app reuse, revocation), our O6 and O7 are the receipt shape | https://docs.base.org/apps/guides/verify-onchain (surfaced by the Parallel Task second opinion, read at the source) |
| ERC-3643 (T-REX) and ONCHAINID | Permissioned token: `IdentityRegistry.isVerified(user)` walks required claim topics, trusted issuers per topic, computes claimId = keccak(issuer, topic), reads `identity.getClaim`, and calls `IClaimIssuer.isClaimValid(identity, topic, sig, data)` (IdentityRegistry.sol:173-223). Token checks `isVerified(_to)` on transfer and mint (Token.sol:420, 455). One `IdentityRegistryStorage` can be bound to up to 300 identity registries, so one claim serves many tokens (IdentityRegistryStorage.sol:133-139) | FACT: ERC Final. TokenySolutions/T-REX archived 2025-10-28 ("Deprecate repo"); successor ERC-3643/ERC-3643 pushed 2026-08-28 | Any EVM; deployed per token issuer, no shared registry | Deploy or reuse a `ClaimIssuer` contract; sign `keccak256(abi.encode(identityAddress, topic, data))` EIP-191 (deploy-full-suite.fixture.ts:146-152); the holder calls `identity.addClaim(topic, scheme=1, issuer, signature, data, uri)` (fixture:155-157); the token owner must `addClaimTopic(topic)` and `addTrustedIssuer(issuer, [topic])` (fixture:115-123). Revocation: `revokeClaimBySignature` (identity-registry.test.ts:235) | [local path, withheld]; https://api.github.com/repos/TokenySolutions/T-REX |
| ERC-7943 (uRWA) | Minimal RWA interface: `canTransact(account)`, `canTransfer(from, to, amount)`, `forcedTransfer`, `setFrozenTokens`; deliberately does not mandate an identity registry (spec L28) | FACT: ERC Final | Any EVM. Builder's own: URWAToken.canTransact delegates to `IComplianceOracle.isCompliant(account)` ([local path, withheld]); `ComplianceBridge.recordComplianceResult(account, status)` deployed on Sapphire testnet 0x245D46Ff44e7db1CD2350D3A08EB837B3EFD3411 (2026-04-10, oasis-infra/testnet-deployments.json) | Implement `isCompliant(account)` in an oracle contract the token points at; or be the relayer that calls `recordComplianceResult` | [local path, withheld] |
| Uniswap v4 Permissioned Pools | `IAllowlistChecker.checkAllowlist(address account, address token) returns (PermissionFlag)` (bytes2: SWAP_ALLOWED 0x0001, LIQUIDITY_ALLOWED 0x0002); called only from `PermissionsAdapter.isAllowed` (PermissionsAdapter.sol:82-84), which the PermissionedV4Router and PermissionedPositionManager consult; the adapter wraps the restricted token so only the PoolManager ever holds the wrapper | FACT: code in v4-periphery main (HEAD 2026-08-20), audited (Cantina, OpenZeppelin PDFs in audits/permissionedPools/), announced 2026-07-23; no deployment script in the repo. FACT (deploy guide, fetched 2026-09-06): Sepolia PermissionsAdapterFactory 0xE6B0d96919334C33d06266d1420F97f6f434fA2B, PermissionedPositionManager 0xf99D553912084c99F6299291b75Fe9B7119Aa1A7, PermissionedHooks 0x51247E2291d290d17C08813A175AC86465EdE8c0, Universal Router 0x54C707Df83f03bc9cA64ED2CcF9C99B63FD854b7; Ethereum mainnet PermissionsAdapterFactory 0x7DA911490Ca4663E572eA9C8154f3CdEbCE16452, PermissionedHooks 0x499a724Ab630549f14C995EC41a8E04fA3fd28c0. Routing in the Uniswap interface requires allowlisting by Uniswap Labs | Ethereum mainnet and Sepolia (deploy guide); mainnet pools with Superstate, Securitize, Dowgo announced | Deploy one contract implementing IAllowlistChecker plus ERC-165; `factory.createPermissionsAdapter(token, owner, checker)`; seed 1 wei; `verifyPermissionsAdapter` | [local path, withheld]; https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/architecture |
| Verax (Consensys) | Portal based attestation registry: `AbstractPortalV2.attest(AttestationPayload{schemaId, expirationDate, subject bytes, attestationData}, validationPayloads[])`, modules run before storage and can revert; `revoke` only by the attesting portal | FACT: contracts v10.0.0, MIT, last commit 2026-08-06 | 8: Linea, Linea Sepolia, Arbitrum, Arbitrum Sepolia, Base (AttestationRegistry 0xA0080DBd35711faD39258E45d9A5D798852b05D4), Base Sepolia, BSC, BSC testnet. Not Ethereum Sepolia or mainnet | Testnet: anyone; mainnet: Consensys must `setIssuer(address)`; then `deployDefaultPortal(modules, name, ...)` and `createSchema(name, description, context, schemaString)` | [local path, withheld], 213-224; README.md:103-340 |
| ERC-8004 Trustless Agents | Identity (ERC-721 agentId, `agentWallet` metadata settable only with an EIP-712 or ERC-1271 proof of wallet control), Reputation, Validation registries. Validation: `validationRequest(validator, agentId, requestURI, requestHash)` by the agent owner, `validationResponse(requestHash, response 0..100, responseURI, responseHash, tag)` by the named validator contract | FACT: ERC Draft (created 2025-08-13). CLAIM: mainnet launch 2026-01-29 (Forbes). FACT: erc-8004-contracts README lists Identity 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 and Reputation 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 on 23 mainnet chain ids; ValidationRegistry "under active revision", no mainnet address in README (scripts/addresses.ts:81 has a vanity address, unverified on chain) | Ethereum, Base, Arbitrum, Optimism, Polygon, Celo, Linea, Scroll, Avalanche, BSC, Gnosis, Mantle, Monad and others; testnets incl. Sepolia | No KYC or operator identity hook exists in the spec. To plug in: be a validator contract that answers `validationResponse` with a tag such as `operator-eligibility`; the agent owner must first call `validationRequest` naming us | [local path, withheld]; [local path, withheld] |
| ERC-8273 Attestation-Gated Agentic Actions | Registry where an Attestor issues a transaction-scoped attestation in EIP-1153 transient storage and executes the gated call atomically: `attestAndCall(subject, capability, evidenceHash, wallet, exec)`; DApps read `getActiveAttestationByWallet(wallet, capability, actionDigest)`; no expiry, no session | FACT: ERC Draft (created 2025-05-26); no deployment found (unverified) | none found | Hold the Attestor role in a registry; agree an `actionDigest` rule with the DApp; call `attestAndCall` | [local path, withheld], 399-401 |
| Chainlink ACE and CCID | On-chain `IdentityRegistry.registerIdentity(bytes32 ccid, address account, bytes context)` and `CredentialRegistry.registerCredential(ccid, credentialTypeId = keccak256("common.kyc"), uint40 expiresAt, bytes credentialData, bytes context)`; `TrustedIssuerRegistry`; `ICredentialDataValidator.validateCredentialData(...)` view, must not revert; PolicyEngine with modular policies (e.g. CredentialRegistryIdentityValidatorPolicy). Credential data on chain "SHOULD be a pointer or a hash"; no off-chain VC or JWT format defined | FACT: "private beta", early access, no GA date; repo public since 2025-10-06, package @chainlink/ace 1.2.0, last push 2026-07-23. License BUSL-1.1, change date 2029-10-06, "non-production use" only; the Additional Use Grant file in the repo is truncated and lists no purposes (LICENSE:19-33, chainlink-ace-License-grants), so a third party has no production grant in this clone. No maturity statement in the README; no testnet or mainnet address anywhere in the repo (all addresses are Anvil defaults); no Sumsub or IDV code; no ERC-7943. Blog 2025-06-30: Identity Manager "supports CCID, ONCHAINID and EAS" | Docs list mainnet Ethereum, Arbitrum, Avalanche, Base, Polygon and the matching testnets incl. Sepolia; no addresses published | Be a Credential Issuer: a plain EOA or multisig authorised by an `OnlyAuthorizedSenderPolicy` attached to the `registerCredential` selector via `policyEngine.addPolicy(...)` (API_GUIDE.md:92-120); the issuer generates the CCID off chain and calls `registerIdentity` then `registerCredential` (CREDENTIAL_FLOW.md:27-33); revocation is `removeCredential`; credential type ids are an off-chain convention `keccak256("namespace.name")`; optionally implement `ICredentialDataValidator`. Requires Chainlink beta access and a commercial licence for production (partner) | https://docs.chain.link/ace/concepts/cross-chain-identity; [local path, withheld], LICENSE:14-33 |
| Chainlink CRE Confidential Workflows | `handlerInTee` (TS) or `cre.HandlerInTee` (Go); TEE code fetches secrets and data; chain writes never run in the enclave, the DON signs a report and a Forwarder delivers it to a receiver contract | FACT: private beta; Sepolia supported (CLI and SDK v1.0.0+); simulation accepted by the ETHOnline brief per the sponsor memo | Sepolia and CRE supported networks | A workflow file, a receiver contract implementing the report callback, secrets | https://docs.chain.link/cre/concepts/confidential-workflows; https://docs.chain.link/cre/reference/sdk/confidential-workflows-client-ts |
| Circle Verite (2022, Centre) | VC based DeFi KYC credentials: `KYCAMLAttestation{type, process, approvalDate}`, expiry on the enclosing VC, address-bound tokens, Circle-governed issuer registry | FACT: circlefin/verite archived 2025-04-04 (GitHub API), last push 2025-03-03; no shutdown announcement found (unverified why). Circle's live product is the Compliance Engine (screening and monitoring for Programmable Wallets, beta, enterprise only), not an identity credential | n/a | Dead end; the lesson is that an off-chain VC with no on-chain reader got no consumers | [local path, withheld]; https://api.github.com/repos/circlefin/verite; https://developers.circle.com/wallets/compliance-engine |
| EBA Travel Rule Guidelines EBA/GL/2024/11 | Transfers above EUR 1,000 to or from a self-hosted address: the CASP must verify the customer owns or controls the address by at least one of (a) unattended or (b) attended verification per the remote onboarding guidelines, (c) a predefined test transfer both ways, (d) "requesting the customer to digitally sign a specific message into the account and wallet software with the key corresponding to that address", (e) other suitable technical means; a verified address may be whitelisted for subsequent transfers (paras 81 to 86) | FACT: applies from 2024-12-30 | n/a (obligation on CASPs) | Method (d) is exactly our wallet binding step (a wallet-signed nonce). A CASP can consume our signed decision as evidence for (e) only if it is satisfied who controls the address, so the off-chain output must carry the binding proof, not just the predicates | https://www.eba.europa.eu/sites/default/files/2024-07/6de6e9b9-0ed9-49cd-985d-c0834b5b4356/Travel%20Rule%20Guidelines.pdf section 4.8.4 |
| x402 v2 and HTTP-level proofs | HTTP 402 payment protocol; headers PAYMENT-REQUIRED, PAYMENT-SIGNATURE, PAYMENT-RESPONSE; facilitator `/verify` and `/settle`; an `extensions` object the server advertises and the client echoes. Official extensions include `http-message-signatures` (RFC 9421) and `sign-in-with-x` (CAIP-122); no KYC or VC extension in the official repo | FACT: spec v2 in x402-foundation/x402. CLAIM: Concordium ships an x402 extension carrying age and jurisdiction attestation requirements (2026-07-28); World AgentKit requests World ID over x402 (2026-03-17) | Base and other x402 networks | Define one extension key (e.g. `eligibility`) with the policy id in the 402 challenge; the client answers with the signed decision token in the echoed extension or an `Authorization` header (DPoP RFC 9449 if binding to a key is wanted) | https://github.com/x402-foundation/x402/tree/main/specs/extensions; https://www.concordium.com/article/x402-explained-agentic-payments-identity |
| ENSv2 Permissioned Resolver | Per-account UUPS resolver proxy with roles; the owner can `authorizeTextRoles(name, key, account, grant)` so a delegate may set one text key; any contract reads `resolver.text(node, key)` | FACT: Sepolia only, public beta since 2026-08-12, contracts not final, mainnet date open | Sepolia | Get a text role on the user's name (config), call `setText`; consumer reads via `ENS.resolver(node).text(node, key)` | https://docs.ens.domains/ensv2/permissioned-resolver; https://ens.domains/blog/post/ensv2-beta-public-testing |
| zkPassport | On-chain `ZKPassportVerifier` at 0x1D000001000EFD9a6371f4d90bB8920D5431c0D8 on Ethereum, Base and Sepolia; proves age, nationality inclusion or exclusion, sanctions non-membership (OFAC, UK, EU, CH), FaceMatch, unique identifier | FACT: live; acquired by Aztec Labs 2026-05-27; more than 17,000 participants verified in the Aztec sale (Dec 2025) | Ethereum, Base, Sepolia | Consumer only: call the verifier with the proof and read the disclosed predicates. Input is an ICAO 9303 NFC document, not the EUDI wallet | https://docs.zkpassport.id/getting-started/onchain; https://aztec-labs.com/blog/zkpassport-acquisition |
| Self Protocol | `SelfVerificationRoot` callback with olderThan, OFAC, nullifier, userIdentifier; Hub on Celo mainnet 0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF | FACT: live on Celo; proofs generated in a Self-run TEE | Celo (Sepolia or Base verifier: none found) | Consumer only; EU ID cards and passports via NFC, Aadhaar; not the EUDI wallet | https://docs.self.xyz/contract-integration/basic-integration |
| World ID | `WorldIDRouter.verifyProof(root, groupId, signalHash, nullifierHash, externalNullifierHash, proof)` on Ethereum, World Chain, Optimism, Base, Polygon; Selfie Check = liveness plus facial similarity uniqueness, "medium assurance", Beta, access by request | FACT: address book says only Orb credentials are supported on chain; the credentials page marks Selfie Check as on-chain capable; conflict, unverified | see left | Consumer only; off-chain verify API returns a nullifier (the only usable field) | https://docs.world.org/world-id/idkit/onchain-verification; https://docs.world.org/world-id/idkit/credentials |
| Keyring Network | zkTLS extraction of a fact from an existing exchange or fintech account, ZK proof, attestation into `KeyringCore`; consumers call `checkCredential(policyId, entity)` | FACT: live (docs updated 2026-08-04); CLAIM: Ethereum, Base, Arbitrum, Optimism, Avalanche; Euler markets with Laser Digital 2026-09-02; CLAIM (second opinion, page not fetchable): zkVerified DeFi Vaults on Ethereum 2026-06-19 | see left | Not pluggable as an issuer; input is a web account, no government eID input found in docs (unverified) | https://docs.keyring.network/connect |
| zkMe | zkKYC: passport, national ID, or "government-issued electronic identity (eID) systems"; output a Soulbound Token with a ZK proof plus a Certify contract for auditors | FACT: docs describe eID input; whether EUDI wallets are on the provider list: unverified; 30+ chains (CLAIM) | many (CLAIM) | Not pluggable as an issuer | https://docs.zk.me/hub/what/zkkyc/zkpoc |

## 2. Architecture

```
                INPUT ADAPTERS                      POLICY DECISION                    OUTPUT ADAPTERS
                (each returns a normalised          (one engine, one signed              (each maps the same decision
                 PresentationResult)                 EligibilityDecision)                 onto one consumer interface)

 [A1] EUDI PID, SD-JWT VC ----+                                                   +--> [O1] EAS attest, public schema
      OpenID4VP 1.0, DCQL      |                                                   |        Sepolia + Base Sepolia (Base later)
      exists: verifier-core    |                                                   |        + IndexingResolver (recipient -> uid)
                               |     +------------------------------------+        |
 [A2] EUDI PID, mdoc + ZK -----+     |  Policy P (versioned, public JSON): |        +--> [O2] Uniswap IAllowlistChecker
      mso_mdoc_zk, Longfellow  |     |   predicates: age>=18, res in {EU}, |        |        reads O1, returns SWAP|LIQ flags
      exists: verifier-zk      +---->|     not_sanctioned, addr_bound      |        |
      pre-standard, sw prover  |     |   min assurance tier (1..3)        |------->+--> [O3] ERC-3643 ClaimIssuer
                               |     |   validity: min(cred exp, P.ttl)   | signed  |        isClaimValid over the same decision
 [A3] zkPassport / Self -------+     |   revocation: status list re-check | decision|
      NFC passport, non-EU     |     |   binding: EIP-191/1271 over nonce |        +--> [O4] ERC-7943 IComplianceOracle
      consumer of their        |     +------------------------------------+        |        isCompliant(account); Sapphire
      on-chain verifier        |                     |                              |        via ComplianceBridge.recordComplianceResult
                               |            executed in one of:                     |
 [A4] World ID Selfie Check ---+            (a) plain Rust service  [today]         +--> [O5] ENSv2 text record (Sepolia)
      low assurance, nullifier              (b) CRE Confidential Workflow           |
      keyed, capped                             handlerInTee -> DON -> Forwarder    +--> [O6] Signed SD-JWT VC of the decision
                                            (c) Oasis ROFL -> Sapphire              |        for CASP / Travel Rule flows (off-chain)
                                                                                    |
                 subject = wallet address proven by a signed nonce                  +--> [O7] HTTP 402 style challenge / x402
                 (EBA/GL/2024/11 para 83(d))                                        |        extension for APIs and agents
                                                                                    |
                                                                                    +--> [O8] ERC-8004 ValidationRegistry response
                                                                                             tag "operator-eligibility"
```

### 2.1 The one object in the middle

Every adapter reads and writes one struct. Keeping it small is what makes the outputs config instead of code.

```
EligibilityDecision {
  policyId:     bytes32   // keccak of the published policy JSON (version pinned)
  subject:      address   // wallet proven by signature over a server nonce
  predicates:   uint16    // bit 0 over18, bit 1 EU resident, bit 2 DE resident, bit 3 not sanctioned, bit 4 address bound, rest reserved
  tier:         uint8     // 1 = state PID (LoA high), 2 = passport ZK (zkPassport/Self), 3 = selfie (World)
  issuedAt, expiresAt: uint64
  statusRef:    bytes32   // keccak(status list uri, idx) so a re-check can find the source bit without storing it
  evidenceHash: bytes32   // keccak of the verifier's inspect record, kept by the operator, never on chain in clear
}
```

No country string, no name, no date of birth. This is the difference to Coinbase's `string verifiedCountry`, which is plaintext on Base. Wording rule from the legal memo still applies: two bits and an expiry bound to an address are personal data; say "no identity document on chain and nothing we could use to find her".

### 2.2 Input adapters

| Adapter | Status | Assurance | Revocation source | Effort |
|---|---|---|---|---|
| A1 EUDI PID SD-JWT over OpenID4VP | exists, live on sandbox phones (2026-06-25 per zk-feasibility memo) | tier 1, sandbox trust label | IETF status list, fail-closed, exists | small: expose a `decision` endpoint that emits the struct and a wallet-binding nonce |
| A2 EUDI PID mdoc + Longfellow ZK | exists, software prover only, pre-standard | tier 1 with the "no wallet can prove yet" label | mdoc status via the same draft (MSO status), unverified for the ZK path | small: same endpoint, second branch |
| A3 zkPassport or Self | their verifier contracts are live; we consume their output | tier 2 | their registry roots; no per-document revocation in zkPassport docs (unverified) | medium: read verifier output, map to predicates; roadmap |
| A4 World Selfie Check | Beta, access by request, unverified by Sep 8 | tier 3, capped | none (nullifier only) | small to medium if access lands; roadmap |

### 2.3 Where the decision runs

- (a) Plain Rust service: exists. Honest label: "our server sees the disclosed attributes for the duration of the request and stores an evidence hash".
- (b) Chainlink CRE Confidential Workflow: the enclave handler fetches the verifier's decision, cross-checks with the DON, and `writeReport` lands on a receiver that calls `EAS.attest`. FACT: chain writes are signed by the DON, not the TEE. Label: "the decision is computed in an enclave"; not "nobody sees the PID", because the OpenID4VP endpoint is still ours. Private beta, simulation only. Medium (sponsor memo).
- (c) Oasis ROFL to Sapphire: the builder already has a ROFL app id and a `ComplianceBridge` with `recordComplianceResult(account, bool)` on Sapphire testnet from April 2026. This is the only option with a confidential state store today, but Sapphire has no EAS, so it would be an own registry, and it is not an ETHOnline sponsor per the sponsor memo. Roadmap, medium.

Recommendation: (a) is the engine, (b) is the write rail for the video if the simulation lands by Sep 9, else the Rust service writes directly with its own key. (c) is the slide for "confidential state" after the event.

### 2.4 Output adapters

| Adapter | Consumer | What it is | Effort (seven-day solo build with agent help) | Video or roadmap |
|---|---|---|---|---|
| O1 EAS attestation, public schema `bytes32 policyId, uint16 predicates, uint8 tier, bytes32 statusRef` with `expirationTime` and `revocable = true`, plus an `IndexingResolver` (Coinbase's pattern: recipient and schema to latest uid; refuse to index expired or revoked) and a published `EligibilityReader` library | any contract or app on the 25 EAS chains; explorers show the booleans, never a name | config (one `register` call per chain) plus two small contracts (resolver, reader lib); writer is one `attest` call from the service or the CRE receiver | small | video (Sepolia; Base Sepolia as a second chain is one more config call) |
| O2 Uniswap `IAllowlistChecker` | permissioned pool on Sepolia | one contract of about 40 lines: indexer lookup, `getAttestation`, expiry and revocation check, predicate mask per policy, returns SWAP or LIQUIDITY flags; ERC-165 | small for the checker; medium for the pool setup (sponsor memo) | video |
| O3 ERC-3643 `ClaimIssuer` | any T-REX token whose owner trusts our issuer for a topic | one contract (`ClaimIssuer` from @onchain-id/solidity 2.1.0, `isClaimValid` verifies our signature and checks O1 for revocation); the holder adds the claim; the token owner runs `addClaimTopic` and `addTrustedIssuer` | small for the contract; needs a partner token or our own test token (medium) | roadmap; a five-second explorer shot of `isVerified(user) == true` is possible if a test token is deployed |
| O4 ERC-7943 `IComplianceOracle` | the builder's `URWAToken.canTransact` and any uRWA token | one contract implementing `isCompliant(account)` by reading O1; on Sapphire, the service is the relayer that calls `ComplianceBridge.recordComplianceResult` | small (EVM with EAS); config only on Sapphire testnet (set relayer) | roadmap |
| O5 ENSv2 text record `eu.eligibility` | anything that resolves ENS | config only (`authorizeTextRoles` by the name owner) plus one `setText` from the service | small to medium (beta tooling) | roadmap, swap-in for CRE if the simulation fails |
| O6 Signed SD-JWT VC of the decision, `vct` `urn:nachweis:eligibility:1`, with its own status list entry and the wallet-binding signature embedded | CASP Travel Rule tooling, exchanges, off-chain compliance | small (the Rust side already handles SD-JWT and status lists as a verifier; issuing needs a signing key and a status list publisher) | small | roadmap; needs a partner (Notabene, Sumsub, a CASP) to be more than a file |
| O7 HTTP 402 style challenge, x402 v2 `extensions.eligibility = {policyId}`; client replies with O6 in the echoed extension or `Authorization: Bearer` | APIs, paid endpoints, agents paying with x402 | small (one middleware, one verify call); no facilitator change | small | roadmap |
| O8 ERC-8004 ValidationRegistry response | agent marketplaces reading `getSummary(agentId, [ourValidator], "operator-eligibility")` | one validator contract that answers 100 when the agent's `agentWallet` holds a valid O1 attestation; the agent owner must call `validationRequest` first | small; but the ValidationRegistry has no published mainnet address (under revision), Sepolia via the reference implementation | roadmap |
| O9 Verax portal and schema | Linea, Base, Arbitrum, BSC ecosystems | config on testnet (`deployDefaultPortal`, `createSchema`); mainnet needs Consensys to `setIssuer` | small; partner on mainnet | roadmap |
| O10 Chainlink CCID `registerCredential` | ACE policy engines at institutions | be a Credential Issuer address; `credentialTypeId = keccak256("nachweis.eligibility")`, `credentialData = policyId || predicates` | config once inside the beta; partner (Chainlink beta access, no addresses public) | roadmap |
| O11 Hedera ATS `IExternalKycList.getKycStatus` | ATS security tokens on Hedera | one contract plus a registry mirror (no EAS on Hedera) | medium | roadmap |

Which are one contract each: O2, O3, O4 (EVM), O8, O11. Config only: O1 schema registration per chain, O4 on Sapphire, O5, O9 testnet, O10 inside the beta. Need a partner: O3 (a real token), O6 (a CASP), O9 mainnet, O10.

## 3. The three answers

### 3.1 What makes it "a product that connects systems" in a judge's eyes

The smallest thing: two consumers that share nothing except a schema UID and a reader library, plus one revocation that closes both. Concretely, in the video: the Uniswap pool contract and the token sale contract were deployed by different scripts, both `forge install` the reader and call `isEligible(address, policyId)`, and after `revoke` both refuse in the same block. Then one slide: the schema UID, the eight adapter names, and the sentence "each is one contract or one config call; here are the three we shipped". A judge sees a registry with a public schema and a reader library, not a hook.

The evidence that this is the winning shape comes from outside the hackathon circuit. FACT: Coinbase Verifications has 1.2 million attestations across three schemas and ships exactly this consumer kit (indexer, `AttestationAccessControl`, one modifier), while Circle's Verite, an off-chain VC with no on-chain reader, was archived in April 2025 with 141 stars. The on-chain readable, publicly indexed, revocable attestation with a reader library is what got adopted; the credential-only design did not. One correction from the second opinion: Coinbase's 2026 successor, Base Verify Onchain, keeps the consumer-declares-policy idea but issues a short-lived signed receipt instead of a persistent attestation, on Base Sepolia only. OPINION: that is the shape for a single gated action; it does not give the "revoke once, every door closes" beat, which needs the persistent record. Ship both: O1 for reuse and revocation, O6 and O7 for the receipt.

Past finalist example: none. FACT (finalist lists for 15 ETHGlobal events 2023 to 2026, checked by the research subagent): no finalist was a reusable attestation hub, and no finalist used a government wallet or eIDAS credential. Closest: Halo (Buenos Aires 2025, finalist, World ID inside a receipts mini app), AuthWallet 2.5 (ETHOnline 2024, finalist, OIDC tokens verified in-contract). Prize winners with a hub shape but no final: N-hub (Istanbul 2023, EAS plus CCIP), Identifi and SelfSphere (Taipei 2025, World ID plus Self). OPINION: this is consistent with the product-pitch memo's count (identity reached finals only as a mechanic inside a wanted product). So the hub is the slide, the sale and the pool are the video, and the state wallet is the mechanic.

### 3.2 Who already does which part

| Part | Coinbase Verifications | Keyring | zkMe | Chainlink ACE | Ours |
|---|---|---|---|---|---|
| Wallet-bound revocable on-chain attestation with a public schema | yes, EAS on Base, 1.2M | yes, KeyringCore `checkCredential` | yes, SBT | yes, CredentialRegistry (beta) | yes, EAS, same reader pattern |
| Consumer kit (Foundry install, one modifier) | yes | SDK plus extension | SDK | policy engine | yes, plus adapters for ERC-3643, uRWA, Uniswap, ENS, x402, ERC-8004 (none of the four ships these) |
| Input is a state-issued wallet credential (LoA high, no new app, selective disclosure) | no (exchange account) | no (web account via zkTLS) | eID listed, EUDI unverified | no (IDV vendor such as Sumsub) | yes, this is ours; EU law makes every citizen a holder by 2027 |
| No plaintext attribute on chain | no (country string) | yes | yes | data is a hash or pointer | yes (bit mask) |
| ZK proof accepted by the verifier, fail-closed | no | yes (own circuits) | yes (own) | "ZK future" | yes, over Google's unmodified Longfellow circuit, 139 tests and 37 negative tests; no wallet can produce it yet (labelled) |
| Revocation from the issuer's status list, not only from the attester | no | no | no | expiry and Identity Manager | yes, IETF status list re-check drives `revoke` |
| EU legal recognition of the input | none | none | none | none | the PID is an eID means under eIDAS 2; the verifier registration is a registrar entry (sandbox); from July 2027 CASPs may accept it per the synthesis line; the attestation itself has no legal status (say so) |

Genuinely ours: the state-wallet input path that works on a phone today (sandbox), the fail-closed ZK verifier on the standard circuit, the status-list-driven revocation, and a decision object without a country string. Not ours and should not be pitched as ours: the attestation registry (EAS), the consumer interfaces (Uniswap, Tokeny, ENS, x402), and the "decision in an enclave" idea (Self already proves inside a TEE, Chainlink sells it).

### 3.3 Naming and the one sentence

Name: Nachweis. The builder already owns nachweis.tech, the sandbox issuer runs at api-sandbox.nachweis.tech, the Android app is nachweis-android, and the word means "proof of" in German officialese (Altersnachweis, Wohnsitznachweis), which is exactly what the predicates are. Sub-brand for the registry and adapters: "Nachweis Attest". Alternative if a non-German name is wanted for the jury: "Eligible" (eligible.eth is unverified as available), or keep the descriptor in English: "Nachweis, eligibility attestations from your state ID wallet".

The sentence a judge repeats: "She proves it once with her state ID wallet; every contract and API reads the same yes; revoke once and every door closes."

Shorter for the slide: "One wallet check, many doors, one revoke."

## 4. Kill criterion

- Sep 8 (G1): if a second, independently deployed consumer (the sale contract) cannot admit and then refuse the same address using only the schema UID and the reader library, without bespoke wiring, the "connects systems" claim is not true. Then ship the pool demo and say "pool demo" on the slide; do not claim a hub.
- Sep 9: if neither the CRE simulation nor the direct writer has produced an EAS attestation on Sepolia with the public schema, drop EAS and fall back to the own registry from the build plan; the adapter list shrinks to what reads the own registry.
- Any time: if the EAS schema needs a country string or any attribute beyond the bit mask to satisfy a consumer, stop and re-read the legal memo; the design point is that no consumer needs more than the mask.
- After the event: if no consumer outside the team (a token issuer, a CASP, an agent marketplace) has read the schema by 2027-03-31, the hub claim failed the market test; keep the verifier as a library, drop the product.

## 5. Second opinion diff (Parallel Task pro, one run, plain question)

The run returned 41 references. Diff against this memo:

- It had, I lacked: Base Verify Onchain (docs.base.org/apps/guides/verify-onchain). Verified at the source and added as its own row; it changes the Coinbase comparison (see 3.1).
- It had, I lacked: Keyring "zkVerified DeFi Vaults on Ethereum, 2026-06-19" (keyring.network blog). The page returned empty on fetch; recorded as CLAIM, unverified.
- It had, I lacked: the Uniswap deploy guide with mainnet and Sepolia addresses. Fetched; addresses now FACT in the table.
- It said, I disagree: "Coinbase Verifications documents Base Sepolia only". That statement is about Base Verify Onchain; the EAS schemas on Base mainnet hold 1.2M attestations today (base.easscan.org). Both products exist; the memo separates them.
- It said, I disagree: "exclude ERC-8004 and ERC-8273 from a human eligibility architecture". Agreed that neither defines a human attestation; kept O8 as a roadmap adapter because the ERC-8004 `agentWallet` proof of control plus a validator response is a documented seam for "the operator behind this agent is an eligible person", and the ETHOnline tracks reward agent stories. Not in the video.
- It said "ONCHAINID is the closest persistent claim model". Agreed for regulated tokens; it is O3. It is not the default store because every token issuer runs its own registries, so there is no cross-token discovery without a shared IdentityRegistryStorage.
- Same as mine: EAS and Verax as the reusable layer, Verax mainnet permissioned, Verite legacy with no confirmed successor, no ETHGlobal finalist match, ACE and CCID status unverified beyond docs.
- It lacked, I have: the file and line inventory of every interface, the EBA self-hosted address methods, the Token Status List and OpenID4VP status, the ZK format status, the Chainlink ACE license restriction, the builder's existing Sapphire ComplianceBridge, and the finalist list by event.

## 6. Not found

- No ETHGlobal finalist 2023 to 2026 with an attestation hub product or a government wallet input (15 event finalist lists plus showcase searches for EUDI, eIDAS, ID Austria, SPID, itsme, BankID, Aadhaar; the Aadhaar hits are not finalists).
- No announcement of Verite's end by Circle or Coinbase; only the GitHub archive flag (2025-04-04).
- No published ERC-8004 ValidationRegistry mainnet address in the README; the reference implementation is Sepolia only.
- No Chainlink ACE contract addresses on any chain; no Keyring government eID input; no zkMe EUDI provider entry.
- No standardised HTTP header for presenting a verifiable credential to an API; OpenID4VP delivers to a response_uri, x402 has no KYC extension in the official repo.
- No permissioned-pool deployment script or address in v4-periphery; the Sepolia addresses come from the Uniswap deploy guide as recorded in the sponsor memo.

## 7. Cloned paths and URLs

Cloned (depth 1, 2026-09-06), all under [local path, withheld]
- eas-contracts (v1.9.0, MIT)
- verifications (coinbase, last commit 2024-08-15, MIT)
- T-REX (v4.1.6, GPL-3.0, archived 2025-10-28)
- v4-periphery (HEAD 2026-08-20)
- linea-attestation-registry (Verax contracts v10.0.0, MIT)
- ERCs (erc-3643.md Final, erc-7943.md Final, erc-8004.md Draft, erc-8273.md Draft)
- erc-8004-contracts (deployment README, 50 network sections)
- trustless-agents-erc-ri (v1.2.0, Sepolia only)
- verite (archived, last commit 2025-03-03)
- chainlink-ace (BUSL-1.1, last push 2026-07-23)

Builder's code read (read only):
- klartext-verifier/verifier-core/src/status.rs
- klartext-verifier/verifier-core/tests/status.rs
- klartext-verifier/verifier-service/src/ (handlers.rs, zk.rs, view.rs)
- [local path, withheld]
- [local path, withheld]
- [local path, withheld]
- [local path, withheld]

URLs (fetched 2026-09-06; link check results in section 8):
- https://www.w3.org/TR/vc-data-model-2.0/
- https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/
- https://datatracker.ietf.org/doc/draft-ietf-oauth-status-list/
- https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
- https://developers.google.com/wallet/identity/verify/accepting-ids-from-wallet-online
- https://eudi.dev/latest/discussion-topics/g-zero-knowledge-proof/
- https://github.com/ethereum-attestation-service/eas-contracts
- https://github.com/coinbase/verifications
- https://docs.cdp.coinbase.com/verifications/introduction/attestations (404 on link check, see section 8)
- https://docs.base.org/apps/guides/verify-onchain
- https://developers.uniswap.org/docs/protocols/v4/permissioned-pools/deploy-a-permissioned-pool
- https://base.easscan.org/schema/view/0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9
- https://api.github.com/repos/TokenySolutions/T-REX
- https://github.com/ERC-3643/ERC-3643
- https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/architecture
- https://blog.uniswap.org/introducing-permissioned-pools-on-uniswap-v4
- https://github.com/Consensys/linea-attestation-registry
- https://eips.ethereum.org/EIPS/eip-8004
- https://github.com/erc-8004/erc-8004-contracts
- https://eips.ethereum.org/EIPS/eip-8273
- https://docs.chain.link/ace
- https://docs.chain.link/ace/beta-scope
- https://docs.chain.link/ace/concepts/cross-chain-identity
- https://docs.chain.link/ace/supported-networks
- https://github.com/smartcontractkit/chainlink-ace
- https://chain.link/blog/automated-compliance-engine-technical-overview
- https://docs.chain.link/cre/concepts/confidential-workflows
- https://docs.chain.link/cre/reference/sdk/confidential-workflows-client-ts
- https://api.github.com/repos/circlefin/verite
- https://developers.circle.com/wallets/compliance-engine
- https://www.eba.europa.eu/sites/default/files/2024-07/6de6e9b9-0ed9-49cd-985d-c0834b5b4356/Travel%20Rule%20Guidelines.pdf
- https://github.com/x402-foundation/x402
- https://www.concordium.com/article/x402-explained-agentic-payments-identity
- https://datatracker.ietf.org/doc/rfc9449/
- https://datatracker.ietf.org/doc/rfc9421/
- https://docs.ens.domains/ensv2/permissioned-resolver
- https://ens.domains/blog/post/ensv2-beta-public-testing
- https://docs.zkpassport.id/getting-started/onchain
- https://aztec-labs.com/blog/zkpassport-acquisition
- https://docs.self.xyz/contract-integration/basic-integration
- https://docs.world.org/world-id/idkit/onchain-verification
- https://docs.world.org/world-id/idkit/credentials
- https://docs.keyring.network/connect
- https://docs.zk.me/hub/what/zkkyc/zkpoc
- https://ethglobal.com/showcase/halo-hi8bv
- https://ethglobal.com/showcase/authwallet-2-5-1i9gq
- https://ethglobal.com/showcase/n-hub-js2of
- https://ethglobal.com/showcase/identifi-hbpyp
- https://ethglobal.com/showcase/attestid-cszfb

## 8. Appendix: link check, tooling, spend

Link check (tiefgang linkcheck.sh over the 47 URLs in section 7 plus the Base Verify guide, 2026-09-06): all 200 except
- https://docs.cdp.coinbase.com/verifications/introduction/attestations returned 404 on the direct check; Wayback capture 2025-09-26 at http://web.archive.org/web/20250926115307/https://docs.cdp.coinbase.com/verifications/introduction/attestations. The schema UIDs are confirmed on base.easscan.org instead.
- https://www.w3.org/TR/vc-data-model-2.0/ returned 403 to the checker's user agent; the research subagent read it with WebFetch the same day; Wayback capture 2026-09-03.
- https://api.github.com/repos/circlefin/verite and https://api.github.com/repos/TokenySolutions/T-REX returned 403 on the checker (GitHub API rate limit); both were read successfully earlier in the session (archived: true for both).
- https://docs.self.xyz/contract-integration/basic-integration returned 206 (partial content), page readable.
- https://www.keyring.network/blog-posts/developer-legal-defense-fund and https://www.coinbase.com/developer-platform/products/verifications returned empty bodies to fetch.sh; not cited as FACT.

Tiefgang skill: present in the skill listing and used as instructed. Feeders: Perplexity Search 4 requests (4 earlier calls failed on an unsupported flag before sending), Parallel Search 5 requests, Parallel Extract 1 URL, Parallel Task pro 1 run, fetch.sh and GitHub API free, linkcheck.sh free. Negative sweep (procurement portals) not run: no tender or funding claim is made in this memo. Metered spend: about 0.15 USD (0.02 Perplexity, 0.025 Parallel Search, 0.001 Extract, 0.10 Task pro).

Subagents: five Opus inventory agents over the clones (EAS, Coinbase, T-REX, Uniswap plus Verax, ERCs plus Verite), one Opus inventory agent over chainlink-ace, three Fable web-research agents. Every FACT in the tables carries either a file and line in the clone or a URL fetched on 2026-09-06.
