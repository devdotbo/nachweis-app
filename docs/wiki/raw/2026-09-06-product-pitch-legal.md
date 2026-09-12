---
type: memo
agent: product-legal
title: EUDI zero-data attestation service for crypto, product, legal boundary, objection matrix, jury reading, sponsor map, after the hackathon
fetched: 2026-09-06
method: Four Explore or general-purpose subagents read the context files and fetched primary sources (EUR-Lex, EBA, ESMA, EDPB, ARF GitHub, BMDS, GitHub). Showcase counts run with python3 over all_projects.json and winners_all.json (projects counted, not grep hits). Evidence labels FACT, COUNT, CLAIM, OPINION per AGENTS.md. Unverified items are marked as such.
---

# EUDI zero-data attestation service for crypto: product, pitch, legal boundary

Date: 2026-09-06. Access date for every URL: 2026-09-06 unless stated.

## 0. Scope and inputs

Builder position (FACT, read from [local path, withheld]): "Not limited to Uniswap pools. More consumers than pools." "Some zero-knowledge or similar: we hold no data and can still prove the person is verified." "Pitch it as: the EU is going there anyway; we provide the solution that is simply easier for customers and for businesses." On zkPassport: "it is another app. More friction for EU users, higher drop-off. With the EUDI wallet the success rate is higher because it is an application they already have and know." Constraint: "Ideally the user only needs the existing EUDI sandbox wallet."

Pool version and prior art (FACT, read from [local path, withheld] and [local path, withheld]): the novelty memo's surviving claim is the combination "EUDI PID over OpenID4VP, reduced to predicates, written as a revocable wallet-bound attestation, consumed by a v4 Permissioned Pool or ERC-3643 asset". Its central honesty problem stands: the PID has no zero-knowledge presentation at launch, so the verifier sees the full PID and is a trusted attester. This memo does not redo that check. It builds on it.

Team assets named in those files: klartext-verifier (Rust, Apache-2.0, real relying-party registration certificate), nachweis-android, augenmass-workbench relay, German sandbox wallet access with simulated face KYC. Read only under [local path, withheld]

Working definition used throughout. "Zero-data attestation": the consumer of the check receives a boolean or a small predicate set (over 18, EU resident, not on sanctions list at time T, controls address X), a validity window, an issuer identifier and a revocation handle. It receives no name, no date of birth, no document number. Whether the verifier in the middle ever sees the full PID is a separate question and is answered per architecture in section 2.5.

## 1. Consumers of one attestation, beyond pools

Ranking criteria: (a) demand evidence today, (b) crypto-native appeal to an ETHGlobal jury, (c) what the EUDI source adds over a passport chip read (zkPassport, Self, Rarimo) or a KYC vendor. Scores 1 to 3 per criterion, OPINION.

| Rank | Consumer | Demand today | Crypto-native appeal | EUDI add | Obliged or motivated party | Type |
|---|---|---|---|---|---|---|
| 1 | Exchange withdrawal or deposit to a self-hosted wallet: address ownership plus identity predicate | 3 | 2 | 2 | CASP, TFR since 2024-12-30, AMLR Art 40 from 2027-07-10 | Institutional buyer, crypto-native user |
| 2 | Token sale or airdrop jurisdiction and sanctions exclusion | 2 | 3 | 2 | Issuer or offeror (sanctions duty, MiCA white paper), sale platform | Crypto-native |
| 3 | Human-backed agent wallets | 1 | 3 | 2 | Nobody by law; agent marketplaces, x402 services, ERC-8004 registries | Crypto-native |
| 4 | Age-gated products (prediction markets, leverage) | 2 | 2 | 2 | Platform under DSA minors guidelines, national gambling regulators, MiFID firms | Mixed |
| 5 | Permissioned asset admission (v4 pools, ERC-3643 or ATS tokens) | 2 | 2 | 1 | Regulated operator (issuer, CASP, MTF) with full CDD; anonymous deployer: nobody | Institutional |
| 6 | DAO or grant eligibility (one person one vote with state ID, residency-based grants) | 1 | 2 | 3 | Nobody by law for DAOs; public funders for grants | Crypto-native |
| 7 | Payee verification in a project escrow (Work Order bridge) | 1 | 1 | 2 | Paying agency (tax, worker classification), not an AMLR obliged entity | Institutional |

Detail per consumer.

### 1.1 Exchange withdrawal or deposit to a self-hosted wallet

Rule. FACT: Regulation (EU) 2023/1113 applies from 2024-12-30 (Art 40). For transfers above EUR 1,000 to or from a self-hosted address the CASP "shall take adequate measures to assess whether that address is owned or controlled by" the originator or beneficiary (Art 14(5), Art 16(2)). Source: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1113 FACT: EBA/GL/2024/11 paragraph 83 lists the acceptable methods, including (d) "requesting the customer to digitally sign a specific message ... with the key corresponding to that address" and (e) "other suitable technical means as long as they allow for reliable and secure assessment". Paragraph 85: combine methods if one is not reliable. Source: https://www.eba.europa.eu/sites/default/files/2024-07/6de6e9b9-0ed9-49cd-985d-c0834b5b4356/Travel%20Rule%20Guidelines.pdf FACT: AMLR 2024/1624 Art 40 adds, from 2027-07-10, risk measures for self-hosted transfers including "taking risk-based measures to identify, and verify the identity of, the originator or beneficiary of a transfer made from or to a self-hosted address", with AMLA guidelines on ownership verification due by 2027-07-10. Source: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1624

Demand today. FACT: Kraken EU applies the EUR 1,000 threshold with a one-click self-attestation or a Satoshi test (https://support.kraken.com/articles/updates-to-crypto-transfer-procedures-for-uk-clients). CLAIM: Bitpanda offers WalletConnect or manual message signing, else self-declaration (https://support.bitpanda.com/hc/en-us/articles/27325159274012-How-to-verify-your-private-wallet-Self-hosted-wallet, page returned 403, snippet only). CLAIM: Bitvavo offers WalletConnect signing, else a screenshot (https://support.bitvavo.com/hc/en-us/articles/30464220050577-How-do-I-verify-my-wallet-address-with-a-screenshot). CLAIM: 331 authorised CASPs as of 2026-09-06, DE 76, FR 35, NL 29 (https://casptracker.eu/, third-party aggregation of the ESMA register; the ESMA page itself, last updated 2026-08-21, shows no count).

One-scene demo. A user withdraws 1,500 USDC from a demo exchange (Privy wallet) to MetaMask. Instead of a Satoshi test the exchange shows a QR; the user presents the sandbox PID from the EUDI wallet and signs a nonce with the MetaMask key in the same session. The verifier binds "address X is controlled by a PID holder over 18, resident DE" and writes the attestation. The exchange sees one boolean; the explorer shows a boolean, an expiry, and an issuer id. A second exchange later reads the same attestation without a new check.

What EUDI adds. OPINION: for the customer's own withdrawal, little. The customer is already identified at the CASP and a signed message is an expressly listed method (para 83(d)); no identity source is needed. The add is in the counterparty case that Art 40 opens: a CASP receiving funds from a self-hosted address that carries a state-ID-backed attestation gets a risk signal without data, and the attestation is portable across CASPs. That is a 2027 product, not a 2026 one. Honest framing: the EUDI presentation replaces a Satoshi test (an on-chain transaction and a wait) with one tap, and yields a reusable proof.

### 1.2 Token sale or airdrop: jurisdiction and sanctions exclusion

Rule. FACT: a pure crypto-asset issuer or offeror is not in the AMLR Art 3 list of obliged entities; the word "decentralised" does not occur in AMLR (legal notes, https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1624). FACT: the general sanctions duty binds every EU person (Regulation 269/2014 Art 2(2), https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32014R0269). A CASP placing the tokens owes CDD (AMLR Art 19(3), EUR 1,000 threshold).

Demand today. See section 3 for the Aztec sale and zkPassport. CLAIM: the Dragonfly airdrop report puts US-resident exclusion losses at USD 1.84 to 2.64 billion for 2020 to 2024, with IP, DNS and payment-location checks as the exclusion method (https://www.sec.gov/about/crypto-task-force/written-submission/dragonflys-state-airdrops-report-2025 and https://crypto.news/us-crypto-investors-likely-lost-up-to-5b-on-geoblocked-airdrops-research-shows/). No EU-specific exclusion pattern found: unverified.

One-scene demo. A sale contract on Sepolia with an allowlist gate. The user proves "resident of an EU member state, not on the EU consolidated sanctions list as of list version N, over 18" from the PID and gets a slot. The organiser never receives a name. Second scene: the same attestation admits the user to a different project's claim.

What EUDI adds. OPINION: reach inside the EU. The PID sits on national ID cards and does not require an NFC passport; zkPassport, Self and Rarimo need a chipped passport or a chipped ID card and their own app. EUDI is EU-only, so for a global sale it is a complement, not a replacement: the EU cohort presents the wallet, the rest present a passport. Residency proof from the PID is a positive proof of non-US residency, which is what most sales want. Nationality is a separate attribute and is also in the PID.

### 1.3 Human-backed agent wallets

Rule. None. OPINION: the nearest hooks are eIDAS Art 5b(10) (relying parties acting through intermediaries) and AMLR Art 20(1)(h),(i) on purpose and beneficial ownership when an agent transacts for a business (legal notes). No regulator has addressed agent wallets: unverified.

Demand today. FACT (read from [event wiki, local, withheld] and jury-patterns.md): agent trust and verification is the first 2026 meta-theme; World rewards "human-agent pairing and accountability"; ENS rewards agent identity with the new registry; Ledger rewards human-in-the-loop control.

One-scene demo. An agent has an ENSv2 subname on Sepolia. Its text record carries the attestation id "backed by a verified EU adult, valid until T, revocable". An x402 service charges the agent a lower price or lifts a rate limit when the record resolves. Revoking the attestation at the verifier flips the price.

What EUDI adds. OPINION: World ID proves a unique human; the EUDI attestation proves a legally identifiable adult exists behind the agent, with an issuer that is a member state, and can prove residency. It cannot de-anonymise (zero data), so "accountability" is limited to "a real EU adult stood behind this agent at time T". Say that plainly on stage.

### 1.4 Age-gated products

Rule. FACT: the Commission's age-verification blueprint (2025-07-14) is built on "only ... a proof that the user is over 18" with ZKP integration for unlinkability in progress (https://digital-strategy.ec.europa.eu/en/news/commission-makes-available-age-verification-blueprint). CLAIM: the Commission Recommendation on age verification of 2026-04-29 describes the app as "consistent with the EU Digital Identity Wallet"; DSA minors guidelines date from 2025-07-14; enforcement so far targets Meta and Snapchat, no crypto app (https://fpf.org/blog/the-eu-commissions-approach-to-age-verification-mobile-apps-dsa-enforcement-and-challenging-national-social-media-bans/).

Demand today. FACT: France ordered an ISP block of Polymarket on 2026-07-17 after 578,751 French visits in June 2026; the regulator ANJ lists 12 European jurisdictions with restrictions; Spain blocked Kalshi in May 2026 (https://cryptoslate.com/polymarket-blocked-french-transactions-but-578751-users-later-france-blocked-the-entire-site/). CLAIM: ESMA warned on 2026-07-04 that yes/no event contracts that are financial instruments are prohibited for EU retail (https://cryptonews.net/news/legal/33102914/).

One-scene demo. A prediction-market front end shows "18+ required"; one wallet presentation unlocks it; the market operator stores nothing.

What EUDI adds. OPINION: the EU's own age-assurance path is EUDI-shaped, so the check matches what regulators expect. The honest limit: for EU prediction markets the blocker is licensing and jurisdiction, not age. An age proof does not unlock Polymarket in France. This consumer is a good demo scene and a weak business.

### 1.5 Permissioned asset admission

Rule. OPINION on FACT: a regulated operator (issuer, CASP, MTF) is the obliged entity and needs the full AMLR Art 22(1)(a) data set and Art 77 retention for each participant; a credential can carry the verification under Art 22(6)(b) but cannot replace the data. An anonymous deployer is not an obliged entity; the credential then enforces protocol policy only, and the status of front ends and admin-key holders is unsettled (MiCA review consultation Q61 to Q63, replies were due 2026-08-31, https://finance.ec.europa.eu/document/download/62be7015-f066-4fac-b74e-71bacdbcc9f5_en?filename=2026-mica-review-targeted-consultation-document_en.pdf).

Demand today. FACT: Uniswap v4 Permissioned Pools announced 2026-07-23 with Superstate, Securitize and Dowgo (https://blog.uniswap.org/introducing-permissioned-pools-on-uniswap-v4); no production pool volume observable as of 2026-07-28 (https://andrewnalichaev.com/articles/uniswap-v4-permissioned-pools-rwa-liquidity); current volume unverified. FACT: Aave Horizon RWA market USD 539.8 million total assets, USD 163.5 million borrowed (https://thedefiant.io/news/defi/aave-s-horizon-rwa-market-nears-usd540-million-adds-vaneck-treasury-fund). Coinbase Verified Pools and Morpho vaults on Coinbase Verifications exist since 2024; TVL unverified.

What EUDI adds. OPINION: least of all consumers, because the paying operator must hold the data anyway. The zero-data claim misfits the regulated case. Keep the pool as one consumer scene, not the product.

### 1.6 DAO or grant eligibility

Demand today. FACT: Rarimo Freedom Tool reports 15,000 downloads on day one of the Russia2024 vote (https://docs.rarimo.com/freedom-tool/); no vote counts published. CLAIM: Self "Know Your Human" offers passport tiers for DAO voting on Celo (https://knowyourhuman.xyz/); no binding governance vote found: unverified.

What EUDI adds. OPINION: the highest technical add of any consumer. eIDAS Art 5a(4)(b) gives wallet pseudonyms and Art 5a(16)(b) requires unlinkability where identification is not required (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1183), which is exactly one-person-one-vote per relying party. Demand evidence is thin.

### 1.7 Payee verification in a project escrow

FACT (read from [local path, withheld]): the Work Order idea binds a client, an agency and subcontractor payees to allocations in USDC; a payee identity step is not in the file. OPINION: the insertion point is payee onboarding to an allocation ("EU resident adult, not sanctioned" before a payout). The paying agency is not an AMLR obliged entity. Useful as a Continuity bridge, not as a headline.

### 1.8 Other consumers found

- CASP onboarding itself (reusable KYC with selective disclosure of the Art 22(1)(a) fields). This is the largest paying market but it is not zero-data; see section 2.
- x402 paid APIs pricing by human-backed status (overlaps 1.3).
- Recovery and inheritance flows (Noah, ETHGlobal New York 2025 finalist) where a state credential re-binds a lost key: demand unverified.

## 2. Legal boundary of zero-data attestations

Corrections to the brief's assumed article numbers (FACT, from fetched texts): AMLR retention is Art 77, the EUR 1,000 CASP threshold is Art 19(3), self-hosted measures are Art 40; eIDAS unlinkability is Art 5a(16)(b), spelled "unlikeability" in the official text. The only ESMA and EBA joint report under MiCA Art 142 is dated 2025-01-16 (EBA/Rep/2025/01); no 2026 joint report exists.

### 2.1 What the law fixes

- FACT: AMLR applies from 2027-07-10 (Art 90). CASPs are obliged entities as financial institutions (Art 2(1)(6)(i)). CDD applies to CASP occasional transactions at EUR 1,000 (Art 19(3)); below that, identification and verification under Art 20(1)(a) still apply. Source: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1624
- FACT: Art 22(1)(a) identification data for a natural person: all names, place and full date of birth, nationalities plus national identification number where applicable, residence, tax identification number where available.
- FACT: Art 22(6)(b): verification may use "electronic identification means which meet the requirements of Regulation (EU) No 910/2014 with regard to the assurance levels 'substantial' or 'high' and relevant qualified trust services".
- FACT: Art 77(1)(a): retain "a copy of the documents and information obtained in the performance of customer due diligence ... including information obtained through electronic identification means" for five years; Art 77(2) allows references instead of copies where immediately producible and unalterable.
- FACT: Art 79(1) prohibits anonymous crypto-asset accounts and anonymity-enhancing coins at CASPs.
- FACT: eIDAS 2 (Regulation 2024/1183): Art 5a(4)(a) selective disclosure, (b) pseudonyms; Art 5a(16)(a) no tracking by the wallet provider, (b) unlinkability where identification is not required; Art 5b relying-party registration in the member state of establishment stating the intended use and "the data to be requested", 5b(3) no other data may be requested, 5b(9) pseudonyms may not be refused unless identification is required by law. Art 5f(2) mandatory acceptance for private relying parties required to use strong user authentication in "transport, energy, banking, financial services, social security, health, drinking water, postal services, digital infrastructure, education or telecommunications", microenterprises and small enterprises excepted. Source: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1183
- FACT: Implementing Regulation 2024/2977 entered into force 2024-12-24 (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R2977), so member-state wallets are due by 2026-12-24 and private relying-party acceptance under 5f(2) by 2027-12-24 (derived).
- FACT: GDPR Art 5(1)(c) data minimisation and Recital 26 (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679). EDPB Guidelines 02/2025 on blockchains, version 2.0 adopted 2026-07-07: encrypted data is still personal data (para 51); a salted or keyed hash on chain is still personal data (para 52); store on chain only proof-of-existence forms and keep verification data off chain (para 54); zero-knowledge proofs "can be helpful for reducing risks to data subjects" but "should be carefully tested, validated and will also need to be accompanied by other appropriate technical and organisational measures" (para 56). Source: https://www.edpb.europa.eu/system/files/2026-07/edpb_guidelines_202502_blockchain_v2_en.pdf
- FACT: ARF v3.0.0 released 2026-07-21; Annex 2 Topic 53 defines ZKP_01 to ZKP_09 (predicate proofs over PID or attestation attributes, validity, non-revocation, key binding, pseudonyms, no tracking, ECCG-approved algorithms) and ACP_03 (attestation binding SHOULD use ZKP). Source: https://eudi.dev/latest/ and https://raw.githubusercontent.com/eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework/main/docs/annexes/annex-1/annex-1-definitions.md CLAIM: Topic G discussion paper v1.4 (2025-03-30): "support for ZKP schemes is expected to be introduced following the launch of the EUDI Wallet" (https://eudi.dev/2.4.0/discussion-topics/g-zero-knowledge-proof/); a refinement round is scheduled 2026-09-23 to 2026-11-18.
- FACT: MiCA Recital 22: services "provided in a fully decentralised manner without any intermediary" are out of scope; Art 3(1)(15) defines CASP (https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1114). FACT: ESMA and EBA joint report 2025-01-16, para 87: "no CDD obligations apply to DeFi protocols"; para 92: unclear who could certify a protocol as fully decentralised (https://www.esma.europa.eu/sites/default/files/2025-01/ESMA75-453128700-1391_Joint_Report_on_recent_developments_in_crypto-assets__Art_142_MiCA_.pdf). The 2026 MiCA review consultation Q61 lists decentralisation criteria (identifiable intermediary, admin keys, governance concentration, custody, closed source, marketing by an identifiable entity).
- Sanctions: FACT, obligation on all EU persons (269/2014 Art 2(2)); obliged entities need a demonstrable screening system (AMLR Art 20(1)(d), EBA/GL/2024/15 section 4.1, https://www.eba.europa.eu/sites/default/files/2024-11/eaeae49d-81a5-4154-8af9-5014f6ee8881/Final%20Report%20Guidelines%20restrictive%20measures%20.pdf). No EU guidance on zero-knowledge sanctions proofs found: unverified.

### 2.2 Plain answers (OPINION unless marked)

| Check | Predicate or ZK "yes" sufficient? | Who is the obliged entity | Notes |
|---|---|---|---|
| Age over 18, consumer product, no AML relationship | Yes | Nobody under AMLR; DSA or national gambling law on the platform | The Commission blueprint is exactly this. Gambling licensees and MiFID firms owe full CDD anyway. |
| Residency or nationality exclusion for a sale or airdrop | Yes for the jurisdictional exclusion | Issuer or offeror: not an AMLR obliged entity; sanctions duty applies; a CASP placing tokens owes CDD | If the sale runs through a CASP, the CASP needs Art 22 data regardless. |
| Sanctions signal | Defensible for a non-obliged entity if list version, matching logic and issuer are auditable | Everyone has the outcome duty; obliged entities need a screening system | Unverified: no regulator has accepted a ZK sanctions proof. |
| Self-hosted address ownership at a CASP, above EUR 1,000 | Yes. Signed message is listed (para 83(d)); wallet presentation binding the key to the identified customer fits para 83(e) | CASP | The CASP documents the check and retains it; no new identity data needed because the customer is already identified. |
| Full onboarding at a CASP (business relationship) | No | CASP | Art 22(1)(a) data set plus Art 77 five-year retention are mandatory. A PID or QEAA presentation satisfies verification under Art 22(6)(b), but the attribute values must be received and retained. Selective disclosure limits the request to the Art 22(1)(a) fields; it does not remove them. |
| Admission to a permissioned pool or ERC-3643 token run by a regulated operator | No as a replacement, yes as a carrier | The operator | Same as onboarding. |
| Same, anonymous deployer | Yes for protocol policy; legally nobody is obliged | Nobody, unsettled for front ends and admin-key holders | Q61 criteria show where the line will fall. |
| Human-backed agent wallet | No law | Nobody | Product convention only. |
| DAO vote, one person one vote | Yes | Nobody | Pseudonym per relying party under eIDAS 5a(4)(b). |

### 2.3 The five-line boundary

1. A predicate proof is legally sufficient wherever the duty is defined by the predicate: age, residency, nationality, jurisdiction, address control, and sanctions as a signal for a non-obliged entity.
2. It is not sufficient where the duty is customer due diligence under AMLR: the law fixes the data set (Art 22(1)(a)) and five-year retention (Art 77). A CASP or regulated issuer must receive and keep the attributes even when they arrive from the EUDI wallet.
3. The EUDI wallet changes the verification step (Art 22(6)(b) accepts eIDAS means at substantial or high), not the retention step.
4. Whoever operates the allowlist and is regulated is the obliged entity; an attestation reused by a second venue does not transfer that venue's duty.
5. DeFi front ends, admin-key holders and governance-token holders are unsettled (joint report para 92, 2026 consultation Q61 to Q63). Say unsettled, not exempt.

### 2.4 What "zero data" can honestly mean per architecture

- Today's PID (SD-JWT VC or mdoc, selective disclosure, no ZK): the verifier sees the disclosed attributes (at minimum the ones needed for the predicate, e.g. date of birth for over 18, unless the issuer provides an age_over_18 claim; the German PID includes age_over_NN claims per the ARF PID rulebook, unverified for the sandbox issuer). The consumer sees a boolean. Honest wording: "the verifier sees it once, nobody stores it, the chain never sees it".
- Verifier inside a TEE (Chainlink CRE Confidential Workflow, handlerInTee): the operator of the verifier cannot read the attributes; only the boolean leaves the enclave. Honest wording: "we cannot see it, and we can prove that".
- ZK predicate proof from the wallet (ARF Topic 53, not shipped in member-state wallets): the verifier never receives attributes. Honest wording: "nobody sees it". Not available in the sandbox wallet as of today: CLAIM from the pool memo, consistent with Topic G.
- EDPB constraint for the on-chain part: store only a proof-of-existence form on chain (para 54); a wallet-bound attestation with a boolean and an expiry qualifies; a hash of the PID does not (para 52).

## 3. Objection matrix

Sources are official docs and repos fetched 2026-09-06 unless marked CLAIM; full notes with per-cell URLs in [temporary directory, withheld]

| Solution | What it proves | Trust model | Who stores what | EU legal recognition | Revocation | Friction for an EU user | What the EUDI route adds or lacks |
|---|---|---|---|---|---|---|---|
| zkPassport (https://docs.zkpassport.id/intro, https://docs.zkpassport.id/limitations) | Age, nationality, selected fields, in-circuit sanctions non-membership (OFAC, UK, EU, CH), FaceMatch liveness, scoped nullifier | Client-side ZK (Noir, UltraHonk), 10 to 50 s on device, cloud prover only for outer recursion on low-memory phones; roots: ICAO PKI plus a zkPassport certificate registry | No PII claimed off device; verifiers and registry roots on chain | None (not an eID means, not a QEAA) | Versioned registry Merkle roots; root-signer governance unverified | Own app (about 400 MB per docs), NFC read of passport, ID card or residence permit; ECDSA documents need near 2 GB RAM; Android FaceMatch refusals documented | Adds: no extra app for EU users once wallets ship, ID cards without NFC reads, state issuer at LoA high, residency attribute (a passport has none). Lacks: ZK today (Topic 53 not shipped), global coverage, in-circuit sanctions. Owned by Aztec Labs since 2026-05-27 (https://aztec-labs.com/blog/zkpassport-acquisition). |
| Self (https://docs.self.xyz/, https://github.com/selfxyz/tee-prover-server) | Name, nationality, date of birth, minimum age, excluded countries, OFAC; scope nullifier | Circom Groth16; proofs generated in a Self-run TEE (Google Cloud Confidential Space) that sees plaintext inside the enclave; registries upgradeable by Self | Commitments and nullifiers on Celo; enclave retention unverified | None | Expiry provable; per-document revocation unverified | Self app, NFC, about 30 s; 129 passport countries, 35 ID-card countries, Aadhaar | Same as zkPassport, plus: Self already uses a TEE prover, so "verified in an enclave" is not a differentiator against Self. EUDI adds the state issuer and no new app. Chains: Celo mainnet and Sepolia only. |
| Rarimo (https://docs.rarimo.com/zk-passport/) | Uniqueness, citizenship, age, fields; event-scoped nullifier; no liveness by default; multi-passport onboarding not prevented (documented) | Client-side Groth16 or UltraPlonk; passport commitment on the Rarimo ZK rollup settling to Ethereum; default verifier Rarimo-hosted, self-hostable | Commitment on chain | None | revoke() and reissueIdentity() exist | RariMe app, camera plus NFC; passports; ID-card support unverified | Adds: no app, ID cards, state issuer, liveness by the wallet's own onboarding. Lacks: the voting tooling (Freedom Tool) and ZK. |
| World ID (https://docs.world.org/world-id, https://world.org/blog/world/world-view-gdpr-anonymization-europe) | Orb proof of human (uniqueness); Document credential proves document uniqueness (no EU state in its country list per docs); Selfie Check beta low assurance; 4.0 one-time nullifiers | On-device ZK; iris uniqueness via multi-party compute nodes; trusted Orb hardware and World as issuer | Personal custody on device, MPC shares on nodes; BayLDA found plaintext iris codes stored 2023-07-24 to 2024-05-14 | None; BayLDA decision 2024-12-19 (reprimand, erasure order), appeal at VG Ansbach, outcome unverified; Spain and Portugal suspensions 2024 | Proof of human expires after 3 years | Orb visit, or NFC passport in World App | Adds: legal identity attributes (age, residency, nationality) and a state issuer; no biometric enrolment. Lacks: uniqueness across issuers (EUDI gives a pseudonym per relying party, not a global nullifier), 18 million verified users, the App distribution. Complement, not competitor: World Selfie Check as the low tier is coherent. |
| Coinbase Verifications (https://github.com/coinbase/verifications, https://base.easscan.org) | Verified Account, Verified Country (plaintext ISO code on chain), Coinbase One | Centralised attester, no ZK | Coinbase holds KYC; country public on chain; EAS on Base | None; README disclaims compliance use | EAS revocable; user can revoke after 24 h | Coinbase account plus one transaction; up to 3 wallets; no uniqueness | This is the closest shape (wallet-bound revocable attestation). EUDI adds: a state issuer instead of one exchange, no exchange account, no plaintext country on chain, LoA high. Lacks: Base distribution and 722k account plus 306k country attestations (easscan count, FACT). |
| Sumsub plus Chainlink ACE (https://chain.link/blog/automated-compliance-engine, https://sumsub.com/newsroom/sumsub-partners-with-chainlink-to-power-cross-chain-identity-for-on-chain-compliance/, https://docs.chain.link/ace/concepts/cross-chain-identity) | CCID credential: type hash, expiry, optional non-PII bytes such as age over 18 | Attestation, not ZK ("ZK future"); Sumsub as issuer, Chainlink Policy Manager | PII at Sumsub; mapping on chain | None; Apex and HKMA pilots | Identity Manager removes or renews; expiry | One Sumsub KYC, then reuse | Same product shape with a KYC vendor as issuer and Chainlink as rail. EUDI adds: the state issuer and zero vendor data. Lacks: ACE distribution. ACE is "private beta" per docs, not GA: a hackathon cannot build on it, and the Chainlink Confidential Workflow track is the open substitute. |
| Keyring (https://docs.keyring.network/connect/how-it-works, https://docs.keyring.network/connect/security/trust-model) | Facts pulled from an existing KYC'd web account via zkTLS (TLSNotary); credential with an encrypted commitment for authorities | zkTLS plus ZK plus blind signature | Raw data stays in the browser; policy, wallet, expiry on chain | None | Passive expiry, blacklist | Chromium extension, paid transaction; no new document if KYC'd elsewhere | Adds: state issuer instead of a web account; mobile-first. Lacks: the "no new document" trick and the authority-escrow design. Adopter: Euler markets with Laser Digital, 2026-09-02 (CLAIM, https://cryptobriefing.com/laser-digital-keyring-defi-fixed-income/). |
| ERC-3643 ONCHAINID (https://docs.erc3643.org/erc-3643/smart-contracts-library/onchain-identities/identity-registry/identity-registry-interface) | Signed claims by trusted issuers; investor country as uint16 on chain; isVerified() per transfer | Signed claims, no ZK | KYC file off chain at the issuer; claim data public | Not eIDAS; ESMA DLT Pilot report mentions it without endorsement | revokeClaimBySignature; removing an issuer voids its claims | Issuer-driven onboarding | EUDI adds: a claim issuer that is a state. The EUDI attestation can be an ONCHAINID claim, so ERC-3643 is a consumer, not a competitor. Apex holds a majority in Tokeny since 2025-05-21 (https://tokeny.com/apex-group-acquires-majority-stake-in-tokeny-to-catalyze-widespread-industry-tokenization-adoption/). |
| Plain KYC vendor (Sumsub or Onfido baseline, https://docs.sumsub.com/docs/german-eid-verification, https://sumsub.com/pricing/) | Document plus liveness, optional NFC, German eID | Vendor trusted; no ZK | Vendor as processor, EU data centres, five-year AML retention | Not an eID means; ETSI TS 119 461 certified; Sumsub German eID flow at eIDAS high | n/a | 22 s average, 94 percent pass rate (Sumsub 2025, CLAIM); USD 1.35 to 1.85 per verification (FACT) | This is what a CASP buys for onboarding and will keep buying under AMLR Art 22 and 77. EUDI adds: nothing for onboarding data retention, everything for predicate-only checks where the vendor's data is a liability. |

The builder's answer to "why not zkPassport": "it is another app. More friction for EU users, higher drop-off. With the EUDI wallet the success rate is higher because it is an application they already have and know."

Assessment (OPINION on the FACTs below):

- Is it true today? No. FACT: no member state has a certified or notified EUDI wallet as of 2026-09-06; Germany's state wallet launches 2027-01-02 (https://eudi-wallet.gov.de/en/app, https://eudi-wallet.gov.de/en/faq); Italy's Documenti su IO has about 12 million activations but no PID yet (CLAIM); national apps (Austria eAusweise, France Identité, Poland mObywatel) are not certified EUDI wallets. The user "already has" nothing yet. zkPassport is installable today.
- When does it become true? FACT: wallets due 2026-12-24 (eIDAS Art 5a(1) plus IR 2024/2977); private financial-services relying parties must accept by 2027-12-24 (Art 5f(2)). CLAIM: national rollout dates cluster in 2027 (Germany 2027-01-02, Netherlands 2027, Finland 2027, Ireland end 2026, Sweden 2029). Adoption of state eID apps is the base rate: German Online-Ausweis used by 25 percent, activated by 42 percent (CLAIM, eGovernment MONITOR 2025, https://initiatived21.de/uploads/03_Studien-Publikationen/eGovernment-MONITOR/2025/D21-eGovMon2025.pdf); itsme 8 million users in Belgium (CLAIM); MitID 97.2 percent of Danes over 15 (CLAIM). The claim becomes true for Denmark, Belgium and the Nordics quickly and for Germany slowly.
- Drop-off evidence, NFC passport reads versus wallet presentations. No vendor publishes NFC read completion rates: unverified. The circulating "iOS 88.6 / Android 46.7" figure could not be traced to a source: unverified. Attempt-level public data: UK EU Settlement Scheme app beta, 90 percent validated identity via the NFC app, under 80 percent in under 10 minutes, Android only (FACT, ICIBI 2019, https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/799439/An_inspection_of_the_EU_Settlement_Scheme_May_WEB.PDF); DigiD: 38 percent of 14.4 million users completed the one-time NFC ID check (FACT, CBS 2026, https://www.cbs.nl/nl-nl/nieuws/2026/29/38-procent-digid-gebruikers-logt-in-met-app-en-eenmalige-id-controle). For wallet presentations: no large-scale pilot published end-user completion rates (POTENTIAL reports 1,000 plus successful of 1,300 plus tests, CLAIM; DC4EU 70 percent first-attempt, CLAIM). Document plus selfie baseline: Sumsub 94 percent pass rate, 22 s (CLAIM); Signicat: 68 percent of consumers abandoned a financial onboarding at least once (CLAIM, 2022). Aztec sale: about 17,000 verified participants across 191 countries per Uniswap (FACT, https://blog.uniswap.org/aztec-cca), 16,741 participants per The Block (FACT, https://www.theblock.co/post/381618/aztec-network-raises-over-60-million), "more than 17,000 used ZKPassport" per Aztec Labs (FACT). The three figures are inconsistent and 191 countries exceeds zkPassport's 130 plus coverage; the ZKPassport versus Predicate-Sumsub fallback split and any drop-off are unverified.
- Honest version of the argument for the stage: "zkPassport needs a chipped passport, a 400 MB app and a 10 to 50 second proof; from 2027 every EU adult carries a state wallet that presents in one tap and covers ID cards. We build for that wallet and use a passport route as the fallback." Do not claim a measured drop-off difference; none exists.
- One more objection the jury will raise: Self already proves inside a TEE and zkPassport proves on device, so "we verify in an enclave" is table stakes. The EUDI-specific differentiators are the state issuer, the residency attribute, the relying-party registration under Art 5b, and the legal acceptance path in AMLR Art 22(6)(b).

## 4. Jury reading

Dataset: [event wiki, local, withheld] (5,446 projects, 14 events) and winners_all.json (1,641 winners, exact subset by uuid; prizes_full carries type track, pool, tier, finalist). Counting unit: projects. Text fields: name, tagline, meta.autoSummary (present for 817 projects), and description (winners only). Because winners carry far more text, counts over all text fields inflate winner shares; the name-plus-tagline count is the comparable one.

COUNT (name plus tagline only; terms: identity, credential, KYC, KYB, AML, compliance or compliant, sanction, passport, eIDAS, EUDI, accredited, ERC-3643, ONCHAINID, zk-KYC, jurisdiction, residency, nationality, age verification or age gate, travel rule, MiCA, World ID, Worldcoin, personhood, sybil, unique human, proof of human, Self Protocol, zkPassport, Rarimo, biometric, orb):

| Measure | Count |
|---|---|
| Identity or compliance projects, all 14 events | 302 of 5,446 |
| Of those, sponsor-prize winners of any type | 106 |
| Of those, ranked winners (track or tier prize, not pool) | 48 |
| Of those, finalists | 6 of 131 finalist entries |
| Online events: ETHOnline 2025 identity winners | 1 of 62 winners (633 projects, 10 finalists) |
| Online events: HackMoney 2026 identity winners | 9 of 166 winners (620 projects, 10 finalists) |
| Online events: Open Agents 2026 identity winners | 0 of 32 winners (468 projects, 7 finalists) |

COUNT (all text fields, strict clusters, excluding bare "identity" and "verifiable"): KYC or compliance cluster 161 projects, 97 winners, 5 finalists; proof-of-personhood cluster 237 projects, 139 winners, 12 finalists; both 42 projects, 40 winners, 2 finalists. Upper bound with bare "identity" and "verifiable" included: 1,006 projects, 614 winners, 48 finalists (that bound is noise; "verifiable" matches oracles and agents).

COUNT (sponsors awarding prizes to the 302 name-plus-tagline projects, top): World 39, ENS 21, Celo 10, Hedera 8, Blockscout 6, Coinbase Developer Platform 5, Privy 2, Chainlink 2, Self Protocol 2, Oasis 2, HashKey Chain 2. Among ETHOnline 2026 sponsors in the wider strict set: Uniswap Foundation 6, Arc 5, The Graph 4, Ledger 4, Chainlink 5.

COUNT (eIDAS or EUDI mentions): EUDI 0 projects; eIDAS 1 project (Blind Notary, Agents 2025, in the winner description only). OpenID4VP 0 (per the novelty memo, [local path, withheld]).

The 6 name-plus-tagline identity finalists: Void Tactics (New York 2026, World ID sybil resistance in a game; World, Dynamic), Halo (Buenos Aires, receipts to rewards for World ID humans; World, Fluence), Wrld Map (Prague, zk travel tracker for unique humans; World, Blockscout), Nomadia (Taipei, P2P currency exchange with World ID; no sponsor prize), claw2claw (HackMoney 2026, ENS identity for bots; ENS), Kyma Pay (New York 2025, "GENIUS Act compliant" stablecoin payments; no sponsor prize). In the wider strict set the finalists closest to this product are 0xCollateral (Prague, "anonymous and permissionless use of your Web2 creditworthiness to borrow Web3 assets", vlayer, Blockscout), Siphon Protocol (ETHOnline 2025, institutional DeFi privacy with AML and KYC in the description, Avail) and Hands Unchained (Lisbon 2026, nationality-based access, World, 0G).

Projects framed as a compliance layer won sponsor tracks and no finals: OpenCompliance (Cannes 2026, "shared compliance layer for institutional DeFi", Chainlink), Assura (Buenos Aires, compliance layer for smart contracts, Oasis), KYCGuard (Taipei, HashKey), luluchill (Taipei, Self plus EAS gating RWA pools, HashKey), Calary (Taipei, compliance toolkit, Celo and Uniswap Foundation), Wafer (New York 2026, KYC-gated tokenized pool on Hedera, Hedera).

OPINION, what framing made finalists. Identity became a finalist when it was a mechanic inside a product a non-expert wants (a game, a rewards app, a bot marketplace, a loan against a private fact) and when the identity input changed price, access or liability. The jury-patterns page says the same for World: "verified human as a core game mechanic, not a login". 0xCollateral is the closest precedent to this product's shape: prove a private fact, get money, reveal nothing. What did not make finals: "compliance layer", "KYC-gated pool", "toolkit". Those win Chainlink, Hedera, Celo and HashKey tracks and stop there. For an online final (ETHOnline 2025: 1 identity winner in 62), the odds for any identity framing are low; the sponsor-track odds are fine.

Three candidate one-sentence pitches, ranked (OPINION):

1. "Prove you are allowed without telling anyone who you are: one tap in the ID wallet every EU citizen gets by 2027, and a pool, a token sale, an exchange withdrawal or an agent accepts you, with nothing about you on chain or on our servers."
2. "The EU is making 331 exchanges and every token issuer check who you are; we turn that check into one presentation from your national ID wallet, verified inside an enclave we cannot read, reusable everywhere, and we never hold your data."
3. "Your national ID wallet is your on-chain compliance pass: age, residency, sanctions clearance and address ownership as booleans, revocable, portable across venues."

Why this order: the first is the user-facing unlock the finalist pattern rewards and it carries the builder's own framing. The second is the business rationale for sponsors and post-hackathon buyers and is the strongest answer to "who pays". The third is a feature list and reads as infrastructure, which is the framing that stops at sponsor tracks.

## 5. Sponsor map for an attestation service

Requirements are FACT from [event wiki, local, withheld]; fit is OPINION. Max three partner prizes per submission.

| Track | Role for the service | Hard requirements | Fit |
|---|---|---|---|
| Chainlink Best Confidential Workflow, USD 2,000, up to 2 teams | The verifier: OpenID4VP presentation verification and predicate extraction inside handlerInTee; only the boolean leaves the enclave; onchain write of the attestation | Registered TEE handler, at least one sensitive input processed inside the enclave, integrated into core functionality, evidence via CRE CLI simulation or live run | Strongest. The brief lists "identity" and "compliance data" as example inputs. Turns "we hold no data" into "we cannot read it". |
| ENS Best Use of ENSv2, USD 4,500 | Publication and lookup: attestation as a Permissioned Resolver record on a subname; agent subnames carry "human-backed" | ENSv2 central, Sepolia only, no hard-coded values, open source | Strong. Covers consumer 1.3 and the jury's agent-identity taste. |
| Uniswap Best Stack Contribution, USD 3,000, up to 3 teams | One consumer: a v4 Permissioned Pool reading the attestation | Public repo, FEEDBACK.md, developer feedback form, README pointing to exact contracts | Adequate. Small prize, audited review, and the pool is the consumer where zero data adds least. |
| Hedera Tokenization of Anything, USD 6,000, up to 3 teams | One consumer: ATS ERC-3643 token whose transfer restriction reads the attestation | ATS used, Hedera testnet, HashScan verification, video with issuance and one lifecycle op; extra points for KYC and transfer restrictions | Strong on money and on the "KYC-gated" reward, but adds a second chain to a Sepolia stack. |
| World Selfie Check, USD 3,500 | Low-assurance tier for caps where no PID is available | World ID Sandbox App access by form, feedback document mandatory | Conditional. Sandbox access is gated; keep the pool memo's kill date of 2026-09-08. |
| Privy Best financial flow, USD 2,500 | The exchange-withdrawal scene (consumer 1.1) with a Privy wallet transfer | Privy wallet plus one generally available flow live | Adequate. Only if scene 1.1 is in the demo. |
| The Graph Composable products, USD 5,000 | Attestation subgraph | Two Graph products composed or a standardized schema; single subgraph does not qualify | Weak. Composition requirement does not fit one attestation contract. |
| Arc, USD 1,667 per track | USDC settlement in the withdrawal scene | Functional MVP, architecture diagram, mainnet by 2026-09-30 for the launch track | Weak fit for an identity service. |
| 1inch, Ledger, Bazantic | None natural | | Skip. |

Recommended triangle: Chainlink Confidential Workflow (verifier) plus ENSv2 (publication and agent consumer) plus Uniswap Permissioned Pool (asset consumer). Reason: all three live on Sepolia, so one attestation contract serves one demo; the roles are distinct (verify, publish, consume) so every integration is load-bearing and none is a badge; Chainlink's track has at most two winners and names identity and compliance data; ENS's jury rewards Permissioned Resolvers as the product's core; Uniswap's requirement is documentation discipline, which the team controls. Higher-payout alternative: Chainlink plus Hedera ATS plus ENS, at the cost of a second chain.

## 6. After the hackathon

### 6.1 Who could pay in 2027

- CASPs. CLAIM: 331 authorised under MiCA as of 2026-09-06 (https://casptracker.eu/); 333 on 2026-08-21 per https://www.outrun.at/micar-dashboard. No exchange has stated an EUDI wallet plan or a reusable-KYC cost target: unverified after targeted searches. Generic vendor cost claim: wallet-based onboarding at EUR 3 to 8 per customer against EUR 70 to 100 (CLAIM, https://asquared.company/en/blog/eudi-wallet-often-underestimated-three-quarters-of-the-eudi-obligation-lie-outside-onboarding-1423/). The concrete 2027 hooks are AMLR Art 22(6)(b) verification and Art 40 self-hosted address measures, both dated 2027-07-10, and eIDAS Art 5f(2) mandatory acceptance for financial services from 2027-12-24.
- Tokenized-asset issuers. FACT: Midas retail access requires Midas KYC with one to four business days (https://docs.midas.app/resources/access-midas-tokens/verifications-and-screenings). FACT: 21X authorised under the DLT Pilot Regime (https://21x.eu/21x-rings-the-bell/). No issuer states EUDI plans: unverified.
- Wallet-integration tenders and grants. FACT: SPRIND Funke EUDI wallet prototypes paid EUR 300,000 per team per stage and EUR 450,000 per finalist (https://www.sprind.org/en/actions/challenges/eudi-wallet-prototypes). FACT: TED notice 69603-2026, SPRIND "EUDI Wallet Ecosystem Management Portal", value unverified (https://ted.europa.eu/en/notice/-/detail/69603-2026). CLAIM: WE BUILD large-scale pilot about EUR 25 million (https://www.webuildconsortium.eu/). Relying-party sandbox entry in Germany via partner@eudi.sprind.org (FACT, https://www.biometricupdate.com/202601/germany-launches-eudi-wallet-sandbox-to-test-key-functions-apply-specific-use-cases).
- Relying-party tooling vendors already selling EUDI verifiers: Lissi, IDnow (the only one naming crypto as a served industry, https://idnow.io/solutions/identity-verification/eudi-identity-wallets/), Signicat, Verimi, walt.id, Animo, Ubique, Procivis, Sphereon, Namirial, Digidentity. None sells a CASP-specific product: FACT by absence on their pages, 2026-09-06.

### 6.2 EUDI-ON community angle

FACT: EUDI ON 2026 took place 2026-06-25 in Berlin, hybrid, organised by BMDS with the national EUDI-Wallet project led by SPRIND, about 400 participants, 12 sandbox exhibitors, five hackathon winners presented (hackathon 2026-06-04 to 06-05, online, 42 solutions; tracks public sector, private-sector identity verification and fraud, builders and IoT, creative, developer tools; no finance or crypto track). No call for demos, no relying-party onboarding call, no next date on the page. Sources: https://bmds.bund.de/aktuelles/aktuelle-meldungen/detail/eudi-on-2026-bringt-europaeische-eudi-wallet-community-zusammen and https://eudi-wallet.gov.de/en/news/eudi-on-community-event-2026 and https://eudi-wallet.gov.de/news/eudi-wallet-hackathon-2026 Next state milestone: first stage of the German state wallet early 2027 (FACT, same source). Commission Relying Party Engagement Programme: first webinar 2026-09-18, travel sector (FACT, https://ec.europa.eu/digital-building-blocks/sites/spaces/EUDIGITALIDENTITYWALLET/pages/978681884/Relying+Party+Engagement+Programme). No crypto or CASP use case in any large-scale pilot (FACT by absence, https://ec.europa.eu/digital-building-blocks/sites/spaces/EUDIGITALIDENTITYWALLET/pages/694487808/What+are+the+Large+Scale+Pilot+Projects).

OPINION: the community angle is an entry ticket to the German sandbox and to the 2027 relying-party wave, and it is worth exactly one sentence in the pitch ("we are already a registered relying party in the German sandbox"). It is not a distribution channel to crypto buyers; nobody in that room is a CASP.

### 6.3 The absorption risk, with the Tessaliq note

FACT: https://github.com/tessaliq/tessaliq-open ("Open-source ZK circuits, SDK and SD-JWT library for zero-knowledge identity verification", MIT) was archived on 2026-08-02 with 0 stars. README verbatim (https://raw.githubusercontent.com/tessaliq/tessaliq-open/main/README.md): "This project is archived and no longer maintained. Tessaliq ran from March 2026 to August 2026." Under "Why it was stopped": "Not for technical reasons. The verifier worked and passed conformance testing." "Accepting wallet credentials became a feature absorbed into existing identity products rather than a product of its own, and the platform wallets (Google, Apple) took the consumer volume." "Open standards did their job: they made this layer interoperable, and therefore non-differentiating. By mid-2026 several established vendors shipped the same capability within weeks of each other." The README also states the decision was made "without having run customer interviews ... the market hypothesis was never directly tested, only inferred from the ecosystem." Its production path was mdoc and OpenID4VP attribute checks; the ZK path stayed disabled (ZK_PATH_ENABLED=false). tessaliq.com returns 404.

OPINION: Tessaliq is this product minus the crypto consumers. Its own diagnosis is correct for the verifier layer: OpenID4VP verification is a commodity that Lissi, IDnow, Signicat and the open-source reference verifier all ship. What is not commoditised as of 2026-09-06: the on-chain attestation format, wallet-key binding to a PID presentation, the CASP self-hosted address flow, and a TEE-verified predicate that regulators and EDPB para 54 would accept. That is the defensible slice, and it is narrow. The second risk is that the wallet vendors themselves (Google and Apple, per Tessaliq) or the crypto identity vendors (World ID Credentials, Coinbase Verifications) add EUDI as an input within months of member-state wallets going live at the end of 2026.

## Recommendation with kill criterion

Recommendation (OPINION): build the attestation service with three consumers in the demo (exchange withdrawal, token sale allowlist, human-backed agent subname) and the pool as a fourth read-only scene; verify inside a Chainlink Confidential Workflow; publish via ENSv2 Permissioned Resolver records; submit the triangle Chainlink, ENS, Uniswap. Pitch sentence 1 on stage, sentence 2 in the README and to every sponsor judge. State the zero-data claim per section 2.4 exactly: "the enclave sees it once, nobody stores it, the chain never sees it", and name the ZK path as the ARF Topic 53 roadmap, not as shipped.

Kill criteria:

1. Kill the "zero data" wording if by 2026-09-08 the sandbox PID cannot be presented over OpenID4VP with only the predicate claims (age_over_18, resident country) disclosed, or if the verification cannot run inside handlerInTee with a boolean-only output. Fallback wording: "no data leaves the verifier".
2. Kill the exchange-withdrawal scene if the wallet-key binding (nonce signed by the EOA inside the same session as the PID presentation) is not reproducible end to end by 2026-09-09. Fallback: sale allowlist plus agent subname only.
3. Kill the post-hackathon direction if by 2027-03-31 no CASP, tokenized-asset issuer or sale platform has agreed to a paid pilot or a signed letter of intent; Tessaliq's note is the base rate for the verifier-only business.
4. Kill the Uniswap leg if the Permissioned Pool cannot be deployed with a custom gate on Sepolia by 2026-09-08 (carried over from the pool memo); replace with Hedera ATS.

## URLs accessed

Legal:
- https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1113
- https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1624
- https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1183
- https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R2977
- https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1114
- https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679
- https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32014R0269
- https://www.eba.europa.eu/sites/default/files/2024-07/6de6e9b9-0ed9-49cd-985d-c0834b5b4356/Travel%20Rule%20Guidelines.pdf
- https://www.eba.europa.eu/sites/default/files/2024-11/eaeae49d-81a5-4154-8af9-5014f6ee8881/Final%20Report%20Guidelines%20restrictive%20measures%20.pdf
- https://www.esma.europa.eu/sites/default/files/2025-01/ESMA75-453128700-1391_Joint_Report_on_recent_developments_in_crypto-assets__Art_142_MiCA_.pdf
- https://finance.ec.europa.eu/document/download/62be7015-f066-4fac-b74e-71bacdbcc9f5_en?filename=2026-mica-review-targeted-consultation-document_en.pdf
- https://www.edpb.europa.eu/system/files/2026-07/edpb_guidelines_202502_blockchain_v2_en.pdf
- https://eudi.dev/latest/
- https://eudi.dev/latest/discussion-topics/
- https://eudi.dev/2.4.0/discussion-topics/g-zero-knowledge-proof/
- https://raw.githubusercontent.com/eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework/main/docs/annexes/annex-1/annex-1-definitions.md
- https://digital-strategy.ec.europa.eu/en/news/commission-makes-available-age-verification-blueprint

Market and demand:
- https://github.com/tessaliq
- https://github.com/tessaliq/tessaliq-open
- https://raw.githubusercontent.com/tessaliq/tessaliq-open/main/README.md
- https://tessaliq.com
- https://bmds.bund.de/aktuelles/aktuelle-meldungen/detail/eudi-on-2026-bringt-europaeische-eudi-wallet-community-zusammen
- https://eudi-wallet.gov.de/en/news/eudi-on-community-event-2026
- https://eudi-wallet.gov.de/news/eudi-wallet-hackathon-2026
- https://eudi-wallet.gov.de/en/faq
- https://www.biometricupdate.com/202601/germany-launches-eudi-wallet-sandbox-to-test-key-functions-apply-specific-use-cases
- https://www.corbado.com/blog/eudi-wallet-2026-deadline-rollout-eic-2026
- https://ec.europa.eu/digital-building-blocks/sites/spaces/EUDIGITALIDENTITYWALLET/pages/694487808/What+are+the+Large+Scale+Pilot+Projects
- https://ec.europa.eu/digital-building-blocks/sites/spaces/EUDIGITALIDENTITYWALLET/pages/978681884/Relying+Party+Engagement+Programme
- https://www.webuildconsortium.eu/
- https://www.sprind.org/en/actions/challenges/eudi-wallet-prototypes
- https://www.sprind.org/taten/strategische-projekte/eudi-wallet
- https://ted.europa.eu/en/notice/-/detail/69603-2026
- https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica
- https://casptracker.eu/
- https://www.outrun.at/micar-dashboard
- https://asquared.company/en/blog/eudi-wallet-often-underestimated-three-quarters-of-the-eudi-obligation-lie-outside-onboarding-1423/
- https://docs.midas.app/resources/access-midas-tokens/verifications-and-screenings
- https://21x.eu/21x-rings-the-bell/
- https://www.bitbond.com/resources/a-guide-to-digital-bonds-under-germany-s-ewpg
- https://www.lissi.id/
- https://idnow.io/solutions/identity-verification/eudi-identity-wallets/
- https://www.signicat.com/use-cases/eudi-wallet
- https://verimi.de/en/eudi-wallet-sdk-digital-identity-digital-credentials-in-your-app/
- https://www.digidentity.eu/eudi-wallet-verifier
- https://blog.uniswap.org/introducing-permissioned-pools-on-uniswap-v4
- https://andrewnalichaev.com/articles/uniswap-v4-permissioned-pools-rwa-liquidity
- https://thedefiant.io/news/defi/aave-s-horizon-rwa-market-nears-usd540-million-adds-vaneck-treasury-fund
- https://x.com/Morpho/status/1828764717332251011
- https://cryptoslate.com/polymarket-blocked-french-transactions-but-578751-users-later-france-blocked-the-entire-site/
- https://cryptonews.net/news/legal/33102914/
- https://www.ccn.com/education/crypto/countries-banned-restricted-polymarket-kalshi/
- https://fpf.org/blog/the-eu-commissions-approach-to-age-verification-mobile-apps-dsa-enforcement-and-challenging-national-social-media-bans/
- https://support.kraken.com/articles/updates-to-crypto-transfer-procedures-for-uk-clients
- https://support.bitpanda.com/hc/en-us/articles/27325159274012-How-to-verify-your-private-wallet-Self-hosted-wallet
- https://support.bitvavo.com/hc/en-us/articles/30464220050577-How-do-I-verify-my-wallet-address-with-a-screenshot
- https://www.sec.gov/about/crypto-task-force/written-submission/dragonflys-state-airdrops-report-2025
- https://crypto.news/us-crypto-investors-likely-lost-up-to-5b-on-geoblocked-airdrops-research-shows/
- https://docs.rarimo.com/freedom-tool/
- https://knowyourhuman.xyz/

Competitors and drop-off:
- https://docs.zkpassport.id/intro
- https://docs.zkpassport.id/limitations
- https://docs.zkpassport.id/faq
- https://github.com/zkpassport/cloud-prover
- https://aztec-labs.com/blog/zkpassport-acquisition
- https://aztec.network/auction-terms-conditions
- https://blog.uniswap.org/aztec-cca
- https://www.theblock.co/post/381618/aztec-network-raises-over-60-million
- https://docs.self.xyz/
- https://github.com/selfxyz/tee-prover-server
- https://blog.celo.org/the-first-f-air-drop-is-here-introducing-self-and-google-clouds-usa-mainnet-faucet-a8bc3dbdc82e
- https://docs.rarimo.com/zk-passport/
- https://docs.world.org/world-id
- https://docs.world.org/world-id/credentials/9303.md
- https://world.org/blog/world/world-view-gdpr-anonymization-europe
- https://world.org/blog/announcements/world-year-two
- https://github.com/coinbase/verifications
- https://base.easscan.org/schema/view/0x1801901fabd0e6189356b4fb52bb0ab855276d84f7ec140839fbd1f6801ca065
- https://chain.link/blog/automated-compliance-engine
- https://docs.chain.link/ace/concepts/cross-chain-identity
- https://sumsub.com/newsroom/sumsub-partners-with-chainlink-to-power-cross-chain-identity-for-on-chain-compliance/
- https://docs.keyring.network/connect/how-it-works
- https://docs.keyring.network/connect/security/trust-model
- https://cryptobriefing.com/laser-digital-keyring-defi-fixed-income/
- https://docs.erc3643.org/erc-3643/smart-contracts-library/onchain-identities/identity-registry/identity-registry-interface
- https://tokeny.com/apex-group-acquires-majority-stake-in-tokeny-to-catalyze-widespread-industry-tokenization-adoption/
- https://docs.sumsub.com/docs/german-eid-verification
- https://sumsub.com/pricing/
- https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/799439/An_inspection_of_the_EU_Settlement_Scheme_May_WEB.PDF
- https://www.cbs.nl/nl-nl/nieuws/2026/29/38-procent-digid-gebruikers-logt-in-met-app-en-eenmalige-id-controle
- https://initiatived21.de/uploads/03_Studien-Publikationen/eGovernment-MONITOR/2025/D21-eGovMon2025.pdf
- https://itdaily.com/news/business/itsme-8-million-users/
- https://eudi-wallet.gov.de/en/app
- https://www.bundesdruckerei.de/de/newsroom/pressemitteilungen/bundesdruckerei-und-sprind-schaffen-grundlage-fuer-eudi-wallet
- https://digital-strategy.ec.europa.eu/en/faqs/eu-age-verification-solution

Local files read:
- [local path, withheld]
- [local path, withheld]
- [local path, withheld]
- [local path, withheld]
- [event wiki, local, withheld]
- [event wiki, local, withheld]
- [event wiki, local, withheld]
- [event wiki, local, withheld]
- [event wiki, local, withheld]

Subagent working notes (scratch, not part of the wiki): [temporary directory, withheld] and market.md and competitors.md
