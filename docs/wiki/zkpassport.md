---
type: reference
title: zkPassport as a second evidence route (WP33)
updated: 2026-09-09
sources:
  - https://github.com/zkpassport/zkpassport-docs (commit 665a760 of 2026-08-20, cloned 2026-09-09; the rendered site https://docs.zkpassport.id is a JavaScript app and returns no text to a plain fetch)
  - https://github.com/zkpassport/zkpassport-packages (commit 2c37fe9 of 2026-09-04, cloned 2026-09-09; packages zkpassport-sdk, zkpassport-utils, zkpassport-ui, registry-contracts, registry-sdk)
  - https://github.com/zkpassport/zkpassport-proof-verifier (cloned 2026-09-09; test fixture src/test/fixtures/verify-compressed-evm-request.json)
  - https://registry.npmjs.org/@zkpassport/sdk, /@zkpassport/ui, /@zkpassport/utils, /@zkpassport/registry (fetched 2026-09-09)
  - https://apps.apple.com/us/app/zkpassport/id6477371975 (fetched 2026-09-09)
  - gh repo list zkpassport (2026-09-09)
  - Ethereum Sepolia and mainnet reads through public RPCs with cast (2026-09-09, Sepolia block 11664394, mainnet block 25936170)
  - https://certificates.zkpassport.id/testnet and /mainnet packaged certificate files for the current roots (fetched 2026-09-09)
  - /Users/bioharz/git/ethglobal/nachweis/wiki/narrative-zk.md and product.md (dates and honesty rules)
---

# zkPassport as a second evidence route (WP33)

Purpose: the builder asked on 2026-09-09 for a second evidence route next to the EUDI wallet. A person proves in the zkPassport app, with the chip of their own biometric passport, that they are over 18, bound to their crypto address, and the same AttestationRegistry stores the same Decision, so issuer approval, fund token, permissioned pool and revoke work unchanged. He decides on 2026-09-10 whether the route stays. This page records what zkPassport is, what was verified, how the route is wired, how to pitch two routes honestly, and what keeping or removing it costs. Labels: FACT (fetched or measured, source named), CLAIM (stated by a source we did not test), OPINION (ours), unverified (no source found).

## Summary

- FACT: zkPassport (Obsidion Labs Limited) is a phone app plus a web SDK. The app reads the passport or ID chip over NFC, generates UltraHonk proofs (Noir circuits, Barretenberg) on the phone, and sends only the proof to the requesting web page. The web page shows a QR code or link made by the SDK; the result arrives in a callback.
- FACT: on-chain verification exists. ZKPassportRootVerifier sits at the same address on Ethereum mainnet, Ethereum Sepolia and Base, 0x1D000001000EFD9a6371f4d90bB8920D5431c0D8. Sepolia has code there, 8 helpers, 8 sub-verifiers, not paused (cast, 2026-09-09).
- FACT: the published fixture proof (a real passport, query age at least 18) verifies on mainnet: `verify` returns true, the root verifier alone costs 777,546 gas in a mainnet fork. The same fixture is refused on Sepolia with "Invalid certificate registry root" because Sepolia's certificate registry has a different root history; Sepolia's current certificate package contains 586 certificates from 140 countries including 9 for DEU and the 2 mock-issuer certificates, so a proof made today against the Sepolia registry is expected to pass there (CLAIM, not yet run).
- FACT: testing without a passport is possible with the app's developer mode (mock passports of the "Zero Knowledge Republic") and `devMode: true` in the SDK; mock proofs verify on Sepolia only. The phone app is still required; there is no desktop mock prover and no downloadable sample proof except the Verifier API test fixtures.
- FACT: the proof binds the wallet address and the chain id (bind "user_address", bind "chain") and carries a scoped nullifier of the document, the proof date and the query parameters. It does not carry name, birth date, nationality, document number or issuing country in compressed-evm mode.
- Built (this package): contracts/src/zkpassport (adapter, router, vendored interface), 22 unit tests against a mock root, 10 fork tests against the real contracts, a deploy script, an app card behind VITE_ZKPASSPORT=1, docs/zkpassport.md with the phone steps. Details in the sections below and in the work-package report.

## What zkPassport is and how the flow works

FACT (docs intro.md, faq.md): "ZKPassport enables privacy-preserving identity verification using passports and ID cards." "With the ZKPassport mobile application, you can scan the chip of your passport, ID card, or residence permit using NFC. From this, the application extracts the relevant information, and then generates zero-knowledge proofs that can verify specific claims (like age, nationality, or name) without revealing any other personal data while guaranteeing the authenticity of the identity document. Everything is done locally on the device to ensure complete privacy from both the service and us."

FACT (faq.md, technical questions): proving system UltraHonk on Barretenberg, circuits in Noir. "ZKPassport generates at least 4 subproofs": two for the issuing country's signatures over the document data, one for the integrity of the data, one or more disclosure proofs. The three base proofs run right after the scan ("from 10s to 50s"), disclosure proofs at request time ("from less than 1s to 10s"). RAM under 1 GB for RSA documents, under 2 GB for ECDSA ones. The app is over 400 MB because it bundles a 128 MB SRS and 180 MB of face-match models.

Flow for a web app (FACT, basic-usage.md and api.md):

1. `new ZKPassport(domain)`; in the browser the domain defaults to `window.location.hostname`. The domain is part of the proof's scope and of the unique identifier.
2. `await zkPassport.request({ name, logo, purpose, scope, mode, devMode, validity })`. `mode` is "fast" (default), "compressed" or "compressed-evm" ("required for onchain verification"). `validity` "defaults to 7 days".
3. Query builder: `.gte("age", 18).bind("user_address", address).bind("chain", "ethereum_sepolia").done()` returns `url` plus callbacks `onRequestReceived`, `onGeneratingProof`, `onProofGenerated`, `onResult`, `onReject`, `onError`.
4. The page renders `url` as a QR code or a link ("if the user is on their phone"). The app opens the request, shows name, logo and purpose, the user accepts, proofs are generated on the phone.
5. `onResult({ verified, uniqueIdentifier, result, proofs, sdkInstance })`. The SDK verifies the proofs itself before calling back; in compressed-evm mode it does so with an `eth_call` to the root verifier (Sepolia when `devMode`, mainnet otherwise) through an Alchemy endpoint with a key hard-coded in the SDK (FACT, packages/zkpassport-sdk/src/index.ts lines 986 to 1013). That call is a runtime dependency on zkPassport's RPC account.
6. `sdkInstance.getSolidityVerifierParameters({ proof, domain, scope, devMode, validityPeriodInSeconds })` turns the `outer_evm_*` proof into the calldata struct for the contract.

Transport between phone and page: the SDK depends on `@obsidion/bridge` and accepts `bridgeUrl`, `topicOverride` and `keyPairOverride` (FACT, package.json and api.md). CLAIM: an end-to-end encrypted relay run by zkPassport carries the proof from the phone to the tab; we did not read the bridge package.

## Packages and versions

FACT (npm registry, 2026-09-09):

| Package | latest | beta | license | published |
|---|---|---|---|---|
| @zkpassport/sdk | 0.16.2 | 0.17.0-beta.2 | Apache-2.0 | 2026-08-20 |
| @zkpassport/ui (drop-in QR card, React and vanilla) | 0.16.2 | 0.17.0-beta.2 | Apache-2.0 | 2026-08-20 |
| @zkpassport/utils | 0.37.5 | 0.38.0-beta.2 | none declared on npm | 2026-08-20 |
| @zkpassport/registry (registry SDK) | 0.14.0 | 0.14.0-beta.4 | Apache-2.0 | 2026-05-07 |

FACT: no npm package ships the Solidity verifier; the contracts live in packages/registry-contracts of the monorepo (pragma ^0.8.30, foundry). We vendored the structs and the two interfaces we call into contracts/src/zkpassport/interfaces/IZKPassportVerifier.sol under the 0.8.28 pin; no bytecode is vendored.

FACT (gh repo list zkpassport): zkpassport-packages (monorepo, no license file in the listing; the SDK and ui packages declare Apache-2.0 on npm, the contracts carry an Apache-2.0 header), circuits (Apache-2.0), mobile-app (Apache-2.0, last push 2026-09-07), zkpassport-docs (Apache-2.0), zkpassport-proof-verifier ("Verifier API", no license in the listing), cloud-prover, noir_rs. The old zkpassport-sdk repository is archived since 2026-04-02. FAQ (older text): "The mobile app will be open sourced when out of the testing phase and publicly listed on the App Store and Google Play Store." The repository exists; its content was not inspected.

SDK dependencies that matter for our Vite build (FACT, package.json of 0.16.2): @aztec/bb.js 5.0.0 and a second copy 4.2.0-aztecnr-rc.2, @noir-lang/noir_js 1.0.0-beta.22, viem, ws, buffer, pako. Our app pins bb.js 5.0.0-nightly.20260324 and noir_js 1.0.0-beta.21 for the EUDI browser prover; the SDK brings its own copies. The card loads the SDK with a dynamic import so the copies stay out of the initial page.

## On-chain verification

FACT (docs onchain.md, RootVerifier.sol, SDK solidity-verifier.ts): "our verifier is deployed on the following chains: Ethereum Mainnet, Ethereum Sepolia, Base Mainnet." Address 0x1D000001000EFD9a6371f4d90bB8920D5431c0D8, "Since the verifier address is deterministic, it is the same for all networks."

FACT (cast reads, 2026-09-09): Sepolia: code present, `helperCount` 8, `subverifierCount` 8, `paused` false, `rootRegistry` 0x1D0000020038d6E40E1d98e09fA1bb3A7DAA8B70, `admin` 0x2000ab040a899f914D6DfD2457C3dFBB22d4c762; helper for proof version 0.20.0 at 0xdd33c53248393D104FE0c7d75941e42647BFB414, sub-verifier 0xEFC0426f0BF0737c3c04340076361b6979127195. Mainnet: same root registry address; helper for 0.20.0 at 0x9894282C73AFaDF1c5c63b6FAc0169039fc42983.

Interface (FACT, RootVerifier.sol lines 78 to 90; the docs' Solidity listing omits the `view`, the source and the SDK ABI have it):

    function verify(ProofVerificationParams calldata params) external view
        returns (bool verified, bytes32 uniqueIdentifier, VerifierHelper helper);

`ProofVerificationParams` = { bytes32 version; { bytes32 vkeyHash; bytes proof; bytes32[] publicInputs }; bytes committedInputs; { uint256 validityPeriodInSeconds; string domain; string scope; bool devMode } }. The sub-verifier for `version` checks the certificate and circuit registry roots at the proof's date, the proof date against `validityPeriodInSeconds` ("The proof was generated outside the validity period"), domain and scope from `serviceConfig` against the public inputs ("Invalid domain or scope"), the commitments of `committedInputs`, refuses mock nullifier types unless `devMode`, then calls the UltraHonk verifier registered for `vkeyHash` (FACT, SubVerifier.sol lines 205 to 300). Public inputs: [0] certificate registry root, [1] circuit registry root, [2] current date, [3] scope hash (domain), [4] subscope hash (scope string), [5..] parameter commitments, then nullifier type, scoped nullifier, OPRF key hash (FACT, Constants.sol and SubVerifier.sol).

The helper reads the disclosed and bound data from `committedInputs` (all `pure`): `isAgeAboveOrEqual(uint8, bytes)`, `getBoundData(bytes)` returning { address senderAddress; uint256 chainId; string customData }, `getProofTimestamp(bytes32[])`, `verifyScopes(bytes32[], string domain, string scope)`, plus nationality, birth date, expiry, sanctions and face-match readers (FACT, VerifierHelper.sol). Bound data is a tag-length-value blob: 0x01 + 2-byte length + address, 0x02 + length + chain id, 0x03 + length + custom string, right-padded to 509 bytes (FACT, zkpassport-utils circuits/bind.ts and InputsExtractor.sol). Chain names the SDK accepts include "ethereum" (1), "ethereum_sepolia" (11155111), "base" (FACT, utils.ts). Age is a 2-byte committed input (min, max) (FACT, Constants.sol COMPARE_AGE = 2).

Gas: not documented (FACT, no "gas" figure in onchain.md). Measured: `eth_estimateGas` for a direct `verify` call with the fixture on mainnet 985,333 (includes 21,000 base and about 12 KB of calldata); in the mainnet fork test the root verifier call alone consumed 777,546 gas; the fixture's `outer_evm_count_6` proof is 10,240 bytes with 11 public inputs and 709 bytes of committed inputs, the whole ABI-encoded struct 11,968 bytes (FACT, cast and forge on 2026-09-09). Our adapter adds four helper calls and the registry's storage write; the full attestWithProof cost with a bound proof is not yet measured because no bound fixture exists (see testing).

## Off-chain verification

FACT (docs api.md, changelog v0.15.x, proof-verifier README): the SDK verifies in the browser before `onResult`; `verify({ proofs, queryResult, originalQuery, ... })` re-verifies server side (Node) and since v0.15 requires the original query; zkPassport also runs a "Verifier API" (`POST /verify` with proofs, originalQuery, queryResult, serviceConfig) for services that cannot run the SDK. For "fast" and "compressed" modes the SDK verifies with bb.js against circuit artifacts fetched from zkPassport's circuit registry (circuits2.zkpassport.id, IPFS gateway) (FACT, index.ts and registry-sdk constants.ts). None of this is used by our route: the chain verifies.

## Testing without a passport

FACT (docs dev-mode.md): "If you don't have a valid passport or national ID to test ZKPassport with, you can enable the dev mode in the mobile app and the SDK to generate and verify proofs with mock passports. Mock passports are signed by the Zero Knowledge Republic (ZKR), a mock issuer we use to issue mock passports for the dev mode. The root certificates (CSCs) of the ZKR are included in our certificate registry on Ethereum Sepolia. However, they won't be included in mainnet versions of our registry. All mock passport proofs have 1 as unique identifier." Enable it "by long pressing the empty area just above the Scan your ID button" on the welcome screen, or Settings, Developer Options, "Enable Developer Mode". SDK: `devMode: true` in `request()`; "Without it, proofs from mock passports are considered invalid." On chain the same flag sits in `serviceConfig.devMode` (FACT, SubVerifier.sol: "Mock proofs are only allowed in dev mode").

FACT (certificate packages, 2026-09-09): the Sepolia ("testnet") certificate package for the current root 0x0230cf79...00c0 holds 586 certificates from 140 countries, DEU 9, ZKR 2; the mainnet package for root 0x1a46d2ab...527f holds 584 certificates from 139 countries, DEU 9, no ZKR. So Sepolia is the network for mock passports and, by the certificate set, also covers real German passports (CLAIM until a run shows it).

What exists as fixtures: the Verifier API repository ships five request bundles under src/test/fixtures, one of them compressed-evm (FACT). That bundle is a real passport (nullifier type 0, non-salted), query age at least 18, nationality not AFG, face match strict, domain "localhost", scope a UUID, proof date 2026-07-29, no bound address (FACT, decoded with the SDK on 2026-09-09). We converted it into contracts/test/fixtures/zkpassport/outer_evm_count_6.json. It verifies on mainnet and is refused on Sepolia (see fork tests). It cannot pass our adapter because nothing is bound. No fixture with a bound address exists anywhere we looked (gh, npm, docs); one comes out of the builder's first phone run (dev mode, mock passport) and should be committed as a fixture then.

Without the phone: the unit tests use MockZkPassportRoot (contracts/test/zkpassport), and scripts/zkpassport-local.sh runs the whole registry flow on anvil with that mock. That is L-class evidence only (docs/process.md classes); nothing about it is a wallet or device run.

## What the proof reveals and does not reveal

FACT (docs faq.md, personhood.md, salted-identifiers.md, Constants.sol):

- Revealed to the page and, on chain, to everyone: the results of the requested checks (here "age >= 18" true), the bound data (our address and chain id), the proof date, hashes of domain and scope, the unique identifier ("scoped nullifier"), the proof version and verification key hash.
- The unique identifier "is derived from the ID data (retrieved from the chip). This data is combined with the domain name and the scope the service specified and hashed using Poseidon2." Same document plus same domain and scope gives the same identifier; other services get different ones. "it's possible to derive the unique identifier from the ID data if you have complete knowledge of the ID chip data, the domain name and scope. This could include the issuing government." A salted identifier (OPRF) removes that and "requires .facematch('strict')".
- Not revealed: name, birth date, actual age, nationality, document number, expiry, issuing country ("compressed-evm: Compressed proof generation, full privacy in regards to the issuing country", api.md). "fast" mode leaks something about the issuing country ("slightly less privacy in regards to the issuing country").
- Unlinkability across services holds by scope; within our domain and scope the identifier links every attestation of the same document. Our adapter does not store it; it is in the transaction calldata. Say so on screen.
- Personhood is per document, not per person: "A person can have multiple IDs" (personhood.md). One passport can attest several addresses under our route; the EUDI route has the same property (one wallet, many addresses), and neither is an issue for eligibility, which is per address.
- Document authenticity: the proof checks the issuing country's signatures over the chip data (FACT, faq.md). Whether the app also runs chip authentication or active authentication (which would tie the proof to the physical chip rather than to a copy of its data) is unverified; the docs' answer to "is this a live person" is face match, which we do not request. The trust statement below is written for that.

## Trust model, stated for the pitch

- Who attests what: the passport's issuing state signed the document data (years ago, at issuance). zkPassport's certificate registry (an admin-updated Merkle root on chain, roots published at certificates.zkpassport.id) decides which country signing certificates count. zkPassport's root verifier (admin can add, update and remove sub-verifiers and helpers per version, pause with a guardian; FACT, RootVerifier.sol) decides how a proof version is verified. Our adapter trusts that contract. The issuer still approves separately.
- Where the proof is made: on the investor's phone, in a third-party app (Obsidion Labs), not in a state wallet and not by us. The app is closed for inspection until its repository is confirmed to be the shipped build (unverified).
- What the chain sees: address, policy, bits 0x7, expiry, proof date, a per-service document identifier, and the proof. "No identity documents on chain, and nothing we could use to find her" still holds, with the identifier named as what is there.
- What this is not: not eIDAS evidence, not a regulated identification means, no assurance level; it is a self-made cryptographic statement over an ICAO 9303 document.

## The app on the phone

FACT (App Store page, fetched 2026-09-09): "ZKPassport", seller Obsidion Labs Limited, version 1.3.1 (Jul 24), 455 MB, "Requires iOS 15.2 or later", iPhone (Mac with M1 and Apple Vision listed as compatible, "Not verified for macOS"), free, age rating 4+. Google Play id app.zkpassport.zkpassport (FACT, search result; page not fetched). CLAIM (App Store text via search summary): "Over 120 countries are currently supported". The builder's iPhone runs the official EUDI test wallet already, so it meets iOS 15.2.

FACT (limitations.md): only ICAO 9303 documents "whose issuing country publish their signing certificates" are supported; coverage map at https://registry.zkpassport.id/map (not fetched). Recommendation from zkPassport: "making ZKPassport checks optional or using a fallback mechanism", and "The different privacy guarantees between ZKPassport and different solutions should also be stated clearly to the user." That sentence matches our two-route design.

## How the route is wired in Attestat

Design (built 2026-09-09 on branch wp33-zkpassport in /Users/bioharz/git/ethglobal/nachweis-app-wt-service):

- `contracts/src/zkpassport/ZkPassportVerifier.sol` implements IProofVerifier. Proof argument: 32-byte route tag keccak256("nachweis.zkpassport.v1") followed by abi.encode(ProofVerificationParams) exactly as the SDK returns it. The adapter replaces `serviceConfig` with its immutables (domain, scope, devMode, validity window), calls the root verifier, requires `verified`, requires `isAgeAboveOrEqual(18)`, reads the bound data and requires the bound address to equal publicInputs[0] and the bound chain id to equal `block.chainid`, requires policyId, bits and expiry to match; expiry is the proof date plus DECISION_TTL (immutable, default 30 days). Failure is a typed revert, like the other adapters.
- Bits: 1 (identity evidence) | 2 (over 18) | 4 (route marker: passport chip via zkPassport) = 0x7. Consumers requiring 0x3 (fund token, subscription, pool checker) accept it unchanged; the Attested event and the UIs can tell the routes apart. The EUDI route keeps 0x3.
- Nonce: keccak256 of the zkPassport public inputs. Every proof carries its generation date, so a fresh proof by the same passport is a fresh nonce (renewal after expiry works); the identical proof submitted twice reverts in the registry with NonceConsumed. The scoped nullifier is deliberately not the nonce, because the registry consumes nonces forever per policy and that would block renewal.
- Same policyId, not a distinct one. Argument: AttestationRegistry maps one policyId to one verifier, and FundToken, Subscription and EudiAllowlistChecker are each pinned to one policyId at deployment. A distinct policyId would need a second fund token, a second checker and a second approval in the issuer console, which contradicts "the issuer's approval, the fund token, the permissioned pool and the revoke work unchanged". So `contracts/src/zkpassport/EvidenceRouter.sol` sits behind the policy: proofs starting with the route tag go to ZkPassportVerifier, everything else goes unchanged to the existing NoirPidVerifier (whose ABI-encoded argument starts with an offset word that can never equal a keccak tag). The route bit carries the distinction the lead wanted from a separate policyId. Removal: `setVerifier(policyId, noirVerifier)`.
- One shared-file change in contracts: IProofVerifier.nonceOf is `view` instead of `pure` (a router reads immutables; the SP1 and Noir adapters keep their pure implementations, which satisfy a view interface).
- App: `app/src/components/zkpassport/` (card, config, proof encoding, env typing) behind VITE_ZKPASSPORT=1; two marked lines in InvestorScreen.tsx and one label in config.ts. The card sends attestWithProof from the connected wallet. Reason: the registry's proof path is permissionless and the proof binds the subject, so the bridge needs no endpoint and service/ is untouched; the wallet pays the gas. The zkPassport SDK is loaded on the click that starts a request.
- Chain binding: the app binds "chain" when the configured chain id has a zkPassport name (1, 11155111, 8453). A plain anvil (31337) cannot be bound and the adapter refuses; local runs with a phone use an anvil fork of Sepolia (chain id stays 11155111), and the mock script uses chain id 31337 inside its hand-built bound data.

## Evidence of this package (2026-09-09, M3 Max)

- FACT: `forge test` 119 passed, 20 skipped without RPC (was 97 passed, 10 skipped on main); the 22 new unit tests in test/zkpassport/ZkPassportVerifier.t.sol cover the adapter, the registry path (attest, approve, eligible, revoke, replay refused, wrong bits refused) and the router.
- FACT: fork tests test/zkpassport/ZkPassportVerifier.fork.t.sol with SEPOLIA_RPC_URL and MAINNET_RPC_URL set to public endpoints: mainnet root verifier accepts the fixture (777,546 gas), rejects a corrupted proof (the UltraHonk verifier reverts with ValueGeLimbMax), a wrong scope ("Invalid domain or scope") and a stale proof under the 7-day default ("The proof was generated outside the validity period"); the adapter with the fixture's domain and scope runs through the root verifier and the age check and stops at the bound-address lookup ("Bind data proof inputs not found"); through the registry the same. Sepolia: root verifier deployed and not paused, helper for version 0.20.0 present, the fixture refused with "Invalid certificate registry root".
- FACT: scripts/zkpassport-local.sh on anvil with MockZkPassportRoot: `ZKPASSPORT-LOCAL PASS`; attestWithProof from the investor's own key 176,956 gas (mock root, so without the real verifier's cost), replay refused with NonceConsumed, approve, isEligible with requiredBits 3 against a 0x7 decision, subscribe mined (100 NDF), revoke closes subscribe, an untagged proof reaches the fallback verifier under the same policy.
- FACT: app `bun run typecheck` and `bun run build` pass with and without VITE_ZKPASSPORT=1. dist/assets grows from 11,212 KB (10 files, main) to 27,304 KB (25 files): the SDK brings its own bb.js copies (four barretenberg chunks of 3.5 to 4.0 MB each), loaded only when the card starts a request; the initial chunk stays at 528 KB (540 KB before). The chunks are emitted whether or not the flag is set, because the dynamic import is part of the module graph.
- FACT: the helper deployed on Sepolia for version 0.20.0 lacks `getNullifierType`, which the monorepo source has (call reverts); the vendored interface omits it and the adapter reads the nullifier type from the public inputs if ever needed. Upstream source and deployed bytecode can differ; re-check on every SDK upgrade.
- FACT: with SEPOLIA_RPC_URL set, the pre-existing SP1 fork test `test_fork_registryPath` fails on this branch and, by its code, on main: it asserts isEligible right after attestWithProof without an operator approval, which the issuer-approval split made impossible. Unrelated to WP33; one `approve` call fixes it. Full run with both RPCs: 138 passed, 1 failed (that test), 0 skipped.
- Not green: a proof with a bound address on any chain; the builder's phone run (docs/zkpassport.md in the worktree lists the steps).

## Pitching two routes honestly

Sourced dates: member-state wallets within 24 months of the implementing acts, private relying parties in the listed sectors must accept the wallet "no later than 36 months" after them; product.md carries the derived calendar dates 2026-12-24 and 2027-12-24 (CLAIM, derived, see narrative-zk.md claim 11). Germany's wallet is "due to be launched as an app in early 2027" (FACT, eudi-wallet.gov.de FAQ via narrative-zk.md). The sandbox wallet is a test environment with sample data (FACT, product.md rule 1).

Rules that bind both routes (product.md): official test wallet, sample identity; state where the proof is made; name the third party; no "first", no "only", no "everyone has this wallet by 2027"; simulated captioned simulated.

Candidate on-screen sentences:

1. "Same decision, two kinds of evidence. EUDI wallet: the regulated route, which private relying parties in regulated sectors must accept from the end of 2027; today against the official test wallet with a sample identity. Passport chip: anyone with a biometric passport, today, through the zkPassport app; the proof is made on your phone by that app and checked on chain by zkPassport's verifier contract."
2. "Your ID wallet should work where you invest. Until it exists in your country, your passport chip does the same job: the zkPassport app proves on your phone that you are over 18, bound to your address, and our registry stores the same decision. Proof made in a third-party app; the chain trusts zkPassport's verifier contract; the issuer still approves."
3. "Two doors in, one decision. EUDI test wallet (sample identity, regulated route from 2027) or passport chip via zkPassport (your own passport, proof on your phone, third-party verifier contract on chain). No identity documents on chain either way."

Recommendation (OPINION): sentence 1 for the pitch and the README, sentence 3 as the two-line caption on the evidence screen. Sentence 2 leans on the spoken line but says "does the same job", which overstates: a passport proof is not eIDAS evidence. Whatever is shown, keep the three named facts on screen next to the passport card: proof made by the zkPassport app on the phone, verified by zkPassport's contract, the document identifier visible in the transaction.

What not to say: "regulated in 2027" without "for private relying parties in the listed sectors"; "government-verified" for the passport route (the state signed the document, not the proof); "nothing about you on chain"; "works for everyone" (ICAO documents with published certificates only, no coverage figure verified by us).

## Builder decision tomorrow

Keep (costs):

- Review burden now: 3 contracts plus 1 interface (about 430 lines), 2 test files (about 400 lines), 1 deploy script, 1 fixture (25 KB), 4 app files (about 420 lines) plus 3 marked lines in shared app files and 1 mutability line in a shared interface, docs/zkpassport.md, scripts/zkpassport-local.sh, this page.
- Dependency: @zkpassport/sdk 0.16.2 with its own bb.js and noir_js copies; dist grows by about 16 MB of lazily loaded chunks (see evidence); the SDK calls an Alchemy endpoint with zkPassport's key during client-side verification.
- Runtime trust: zkPassport's admin-controlled verifier and certificate registry, a third-party app on the investor's phone, a relay between phone and page.
- Deployment: one more contract pair on Sepolia (adapter plus router) and one setVerifier; a redeploy when the domain changes (domain is immutable in the adapter; attestat.dev versus a tunnel hostname needs two adapters or one per environment).
- Pitch: a second trust statement on screen and one more beat in the video; the honesty rule "state where the proof is made" now has two answers.
- Still open before it can be called green: a phone run with a mock passport on Sepolia (or an anvil fork of Sepolia), then the builder's real passport; a bound-proof fixture committed for the fork test; the 0.8.30 upstream interface re-checked against our vendored copy whenever the SDK version moves.

Remove (costs):

- `git rm -r contracts/src/zkpassport contracts/test/zkpassport contracts/test/fixtures/zkpassport contracts/script/DeployZkPassportVerifier.s.sol app/src/components/zkpassport docs/zkpassport.md scripts/zkpassport-local.sh`; revert the two marked lines in InvestorScreen.tsx and the label in config.ts; optionally revert the `view` on IProofVerifier.nonceOf (harmless to keep); `bun remove @zkpassport/sdk` in app; drop the VITE_ZKPASSPORT lines from app/.env.example; delete this page or mark it as rejected in decisions.md. On chain nothing exists yet. Small review burden: one revert commit.
