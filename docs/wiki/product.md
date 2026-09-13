---
type: reference
title: Product
updated: 2026-09-13
---

# Product

## The sentence

Attestat helps token issuers accept EUDI identity evidence and apply their approval to customers' linked crypto wallets, without putting identity documents on chain. (FACT, sentence decided 2026-09-07 by the builder and the lead, name Attestat decided 2026-09-07 evening, wiki/decisions.md; the rest of this page still says Nachweis where it was written before the rename, same product, see wiki/name-and-domains.md)

Spoken line: "Your ID wallet should work where you invest."

## Who buys

The issuer of a gated instrument: a fund issuer, transfer agent or launchpad that today gates its token behind its own document funnel and allowlist. The issuer is the obliged entity; Nachweis is its tool. The investor never pays Nachweis and never uploads a document to it.

Why this buyer (OPINION, from raw/verdict-2026-09-06.md and raw/2026-09-06-live-gated-products.md): the only gates that exist in crypto today are thrown by issuers of permissioned instruments and by launchpads. Secondary markets for tokenized stocks are ungated. No live product accepts an external attestation without a contract (COUNT 0, live-gated-products memo), so the buyer must be the party that already owns the gate.

Why now (CLAIM, income-paths memo cited in raw/money-question-2026-09-07.md): member-state wallets by 2026-12-24, private relying parties in listed sectors that must use strong user authentication by law or contract also accept the wallet at the user's request from 2027-12-24 (eIDAS 2, Art 5f(2), micro and small enterprises exempt). No named operator has yet said which step Nachweis would replace; that is the business gate after 2026-09-13.

Why now, second reason (FACT for the incidents, OPINION for the reading; wiki/incidents-idscan-revolut-2026-09.md): in the twelve days before the deadline an ID-scanning vendor's licence scans surfaced on a dark-web service (IDScan.net, company notice 2026-09-04) and a bank handed customers' passport copies to a fraudulent request (Revolut, notices 2026-09-11). The vendor kept its copies under a "do not delete" default; the bank's own notice says the law requires it to keep the document copy. On the browser route the issuer never receives a document image, so there is no image to retain by default or to hand over; a decision and predicate bits remain, and those are personal data too. A predicate is not customer due diligence; an obliged entity still keeps its compliance file, and Attestat does not shrink it.

## What it does, in one flow

1. The investor's official test wallet answers the issuer's registered request (given name, family name, over 18) to the issuer's verifier. Names reach the issuer only on the server route; on the browser route the relay holds the encrypted answer unopened and the names stay in the browser tab. Never on chain.
2. The issuer matches the presentation to its onboarding record and approves in a separate step. Remaining checks (sanctions and similar) are stubs in this build and are labelled simulated.
3. The investor binds a crypto wallet address by signing a nonce with the EVM key.
4. An EligibilityDecision (policy id, predicate bits, tier, expiry, status reference) is written on Sepolia against the address. No name, no document.
5. The fund token's transfer check and the Uniswap permissioned pool's allowlist checker both read the same decision. One permission, two doors.
6. The issuer withdraws approval; both doors refuse.

Details: wiki/architecture.md, wiki/pitch.md.

## What it is not

- Not KYC as a service. The issuer verifies, the issuer decides. Nachweis carries the decision.
- Not a data holder. Nachweis stores no identity document because it never receives one in the target deployment (blind relay or on-device proof). In the server-side proof deployment the verifier does see the presentation; say so (see honesty rules).
- Not a wallet. The state wallet is the wallet. An own wallet cannot hold a sandbox PID and certification in Germany is not expected before 2028 (decision 2026-09-07, rejected alternative).
- Not an attestation hub or a compliance layer. Identity is a mechanic inside a product the issuer wants (COUNT: six finalists out of 302 identity projects, all with identity inside a wanted product, none as a layer; raw/synthesis.md).
- Not onboarding. It is eligibility. The issuer keeps its compliance file; a predicate never satisfies full customer due diligence (AMLR Art 22 and Art 77, CLAIM from the product-pitch-legal memo).

## Honesty rules for every public sentence

- The sandbox wallet is a test environment with sample data (FACT, https://eudi-wallet.gov.de/en/news/testing-digital-credentials-in-the-eudi-wallet-sandbox, fetched 2026-09-07). Say "official test wallet, sample identity". Never "real state-issued identity" for the demo.
- Say "no identity documents on chain, and nothing we could use to find her". Never "nothing about you on chain": predicate bits and an expiry bound to an address are still personal data in the EDPB's reading (CLAIM, product-pitch-legal memo).
- Where the proof is made must be stated on screen: the browser tab today (the investor's own computer; FACT, Sepolia record 2026-09-12, nachweis-app/docs/evidence/sepolia-phone-2026-09-12.md), the laptop companion (FACT, G0 record 2026-09-08) and the phone prover as alternatives on the same core, wallet when the EUDI framework selects a ZK scheme (FACT, ARF v3.0.0 chapter 7: no scheme selected, wallet-side support expected after launch; see wiki/narrative-zk.md). Never say "on the device" when the recorded proof is on the Mac. The regulation's published text spells the unlinkability duty "unlikeability" in Art 5a(16)(b); quote it only verbatim. If the proof is made by our server, say "the chain does not trust our server, but the server did see the presentation".
- Simulated checks are captioned simulated. Manual withdrawal is captioned manual.
- No "first", no "only", no "the thing SPRIND is lacking", no yield figures, no "second KYC removed", no "everyone has this wallet by 2027" (rules carried over from raw/build-plan.md and raw/front-door-brief-2026-09-02.md). The word KYC appears only in the Uniswap form field kycUrl.
- OPINION (lead, 2026-09-13): the tagline of 2026-09-13, "EUDI evidence, proven in zero knowledge, one on-chain decision any contract can read", names the mechanism (one decision any contract can read) and stays inside "no toolkit framing", because it claims an interface that consumer contracts read, not a product for developers.
- Spiko and similar issuers appear only as "an instrument like", never as partners.
- Open jury questions that touch the product sentence stay listed in wiki/open-questions.md until answered; the pitch does not paper over them.
