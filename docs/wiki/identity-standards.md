---
type: reference
title: Identity standards compatible with the Attestat toolkit (national and regional systems)
updated: 2026-09-09
sources:
  - every fact below was fetched on 2026-09-09; the URL sits next to each fact in wiki/identity-standards-notes.md, which holds the verbatim quotes and the per-system detail
  - wiki/architecture.md, zkpassport.md, narrative-zk.md (what the toolkit consumes today)
  - klartext-verifier/verifier-zk/src and nachweis-app/circuits/README.md (read 2026-09-09)
---

# Identity standards compatible with the Attestat toolkit

Purpose: the showcase brief says Attestat "plugs into the EUDI wallet (and optionally zkPassport, and other national identity systems where compatible)". This page says, per system, whether that is true today, true after named work, or not true. Labels: FACT (fetched 2026-09-09, quote and URL in the notes file), CLAIM (a source says it, not confirmed on an official page), OPINION (ours), unverified (no source found). Nothing here was tested against a live wallet except the German EUDI sandbox and zkPassport; every other verdict is read from specifications and official documentation.

## The yardstick (what "same stack as EUDI" means)

The toolkit today consumes an OpenID4VP presentation (DCQL, response encrypted to the verifier) of an SD-JWT VC signed with ES256, SHA-256 disclosure digests, a KB-JWT whose nonce binds the crypto address, and an issuer key that the verifier chains to a trust anchor and that the contract pins by hash (FACT, architecture.md and circuits/README.md). The Noir circuit and the SP1 guest see the SD-JWT bytes and the pinned key, not the trust mechanism, so an issuer anchored by a DID document or a trust list instead of an x5c chain is a change in verifier-service, not in the circuit (OPINION, see notes section 0). The pre-existing verifier-zk crate additionally accepts OpenID4VP responses in the draft format mso_mdoc_zk carrying a Longfellow proof (system longfellow-libzk-v1) over an ISO 18013-5 mdoc, anchored to a configured issuer certificate (FACT, verifier-zk/src). On chain, every route ends in the same registry through IProofVerifier; a new route is a new verifier contract, never a new registry or consumer.

Three verdicts are used:

- supported now: OpenID4VP plus SD-JWT VC (ES256, SHA-256) or mdoc, with an issuer anchor we can pin, and a relying-party path a company can walk.
- supportable: same family, but one named piece is missing (a circuit, a verifier adapter, a registration we do not hold, or a launch date that has not passed).
- not compatible: no verifiable credential leaves the system in a form a third party can verify cryptographically, or the trust model excludes third parties.

## Summary table

| System | Format | Protocol | Trust model | State (2026-09-09) | Verdict |
|---|---|---|---|---|---|
| EU, EUDI wallet (German sandbox) | SD-JWT VC (dc+sd-jwt) and ISO mdoc, both allowed by the PID rulebook | OpenID4VP 1.0, DCQL; DC API profile in ARF | x5c chain to member-state anchors, registrar certificates | German state wallet due early 2027; sandbox live and used by us | supported now (the reference route) |
| Switzerland, swiyu e-ID | SD-JWT VC (dc+sd-jwt, ES256, SHA-256) | OpenID4VP 1.0, DCQL, JAR, direct_post.jwt | did:webvh on the federal base registry, trust registry, public register of verifier queries | Public Beta live with Beta-ID; e-ID expected 1 December 2026 | supported now for the Beta-ID stack, production after go-live; one adapter change (DID-resolved issuer key, own verifier DID) |
| United Kingdom, GOV.UK Wallet | ISO mdoc (mDL); W3C VC without selective disclosure | ISO 18013-5 proximity first; OpenID4VP remote announced | GDS certificate authority, DVS register | Wallet live for government documents; remote flows and trust framework 1.0 coming into force from 1 September 2026 at the earliest | supportable: mdoc circuit plus a certified DVS partner |
| United States, state mDLs in Apple and Google Wallet | ISO mdoc | Apple: ISO 18013-7 Annex C over the DC API (Safari 26); Google: OpenID4VP 1.0 over the DC API, and mso_mdoc_zk with Longfellow | AAMVA VICAL (free download) or issuer IACA; Apple Business Register or Google RP onboarding | Live in about 22 states per TSA; Chrome 141 and Safari 26 ship the DC API | supportable: mdoc circuit; Google's Longfellow path matches verifier-zk today |
| Google Wallet ID pass (US, UK, BR, IN, SG, TW) | ISO mdoc issued by Google | OpenID4VP 1.0 over the DC API, mso_mdoc_zk | Google-hosted IACA, not the state | Live per Google's issuer list | supportable with the same mdoc work; anchor is Google, say so |
| ICAO passport chip via zkPassport | Doc 9303 LDS, X.509 CSCA and DSC | zkPassport app and SDK, proof to the page | CSCA master list (ICAO PKD, public download), mirrored in zkPassport's registry | Live on mainnet, Sepolia, Base; adapter built (WP33) | supported now through the zkPassport adapter; no relying-party registration exists |
| Estonia | X.509 (ID-card, Mobile-ID, Smart-ID); EUDI wallet format unverified | OIDC (TARA), Smart-ID RP API | SK ID Solutions and state CA chains | Wallet tender of 18 May 2026, contract about a year later; RP register MVP end of 2026 | not compatible today (authentication, no attribute credential); supportable when the wallet ships |
| Ukraine, Diia | PDF plus JSON metadata | Deep link, Diia.Signature, barcode | none published for third parties | Live, free, mandatory acceptance in Ukraine | not compatible (no verifiable credential leaves the system) |
| Singapore, Singpass | JSON over OAuth 2.0 (Myinfo, Verify) | OAuth 2.0 and OIDC, QR | Singpass servers; Singapore-registered entities only | Live at scale; Verify API closed to new onboarding | not compatible (attribute API, not a credential); Google ID pass is the only mdoc |
| Australia | Federal: JWT over OIDC (AGDIS); states: ISO 18013-5 licences | OIDC; QR and screen checks; online 18013-7 unverified | AGDIS regulator approval; state IACAs not published | AGDIS live for public sector, private from 30 November 2026 (CLAIM); QLD and NSW licences live | federal not compatible; state mDLs supportable if an IACA can be obtained |
| Japan, My Number Card | X.509 (JPKI); licence on the chip | OIDC through the Digital Agency; PIN-protected reader app | JPKI certificate authorities, RP registration with the Digital Agency | Live; iPhone card since 24 June 2025; licence on card since 24 March 2025 | not compatible today (authentication); a smartphone mDL is a press claim for end of 2026 |
| South Korea, mobile ID | DID-based VC, own module | proprietary integration module, KOMSCO approval | blockchain anchor, KOMSCO review | Live: licence 2022, resident card March 2025, private wallets 2025 | not compatible (no OpenID4VP or ISO path; approval process) |
| Taiwan, Digital Identity Wallet (moda) | SD-JWT (vc+sd-jwt, ES256, jku-hosted issuer key) | OpenID4VP with presentation_definition, deep link openid4vp://, moda's verifier module on the verifier's server | issuer and holder DIDs; trust list planned (CLAIM) | Sandbox open to organisations and individuals since 31 March 2025; spec 1.2 of 12 December 2025; trial operation, no statute yet (CLAIM) | supportable, close: SD-JWT fits the circuit shape; profile, digest algorithm, holder binding and age claim unverified |
| United Arab Emirates, UAE Pass | JSON over OAuth 2.0 and OIDC; PAdES PDF signatures | OIDC, SOAP verification | UAE Pass onboarding, trade licence and service provider agreement | Live; document sharing for private organisations | not compatible (attribute API, no credential) |
| Brazil, gov.br | OIDC JSON with reliability levels; licence as QR checked by the Vio app, PDF with P7S | OIDC, QR | gov.br and Serpro; ICP-Brasil (CLAIM) | Live; staging environment public | not compatible today; Google ID pass is the only mdoc |
| India, Aadhaar and DigiLocker | signed XML (DigiLocker 1.9), Aadhaar offline verification credentials | proprietary callback and app intent; Requester API 1.12 | UIDAI registration of the verifier, DigiLocker terms of service | Live; OVSE page updated 8 September 2026 | not compatible (registration-bound APIs, no SD-JWT or mdoc); Google's Aadhaar ID pass is a Google credential |
| Canada | AnonCreds (BC Wallet, CLAIM); PCTF is format neutral | Aries (CLAIM) | no published trust list | BC person credential in pilot; Quebec suspended (CLAIM) | not compatible today |

## Switzerland (swiyu)

FACT: the e-ID Act passed the referendum on 28 September 2025 with 50.39 percent; the e-ID "is expected to go live on December 1, 2026"; verifiers "will be required to register their desired data queries and their purpose in advance in a publicly accessible federal register"; the e-ID "will be technically unlinkable from the moment it is introduced" (eid.admin.ch, 2026-02-25). Unlinkability is by batch issuance of one-time ECDSA credentials, not by anonymous credentials (FACT, swiyu community tech concept). FACT: the stack is SD-JWT VC with ECDSA, OpenID4VP 1.0 with DCQL, JAR-signed requests, response_mode direct_post.jwt, format dc+sd-jwt, ES256, _sd_alg sha-256, KB-JWT with aud equal to the verifier's client_id, issuers and verifiers identified by did:webvh on the federal base registry, token status lists. FACT: the Beta-ID, "open to anyone who is interested", holds "the same identity attributes as the coming e-ID", including age_over_18, age_over_16, age_over_65, birth_date, nationality, with vct betaid-sdjwt. Onboarding is self-service through the swiyu Service Portal (DID, base registry, trust registry) with per-DID costs not stated.

Verdict: supported now for the Beta-ID stack, production after 1 December 2026. What changes against the German route: the issuer key is read from a DID document instead of an x5c header (verifier-service resolves did:webvh, the contract pins the key hash as it does today); the vct changes; our verifier needs its own did:webvh entry to send JAR requests; the SD-JWT header order differs from Bundesdruckerei's, which the circuit's header window is built for but which no Beta-ID vector has exercised (unverified). The Noir circuit and the SP1 guest consume the SD-JWT as is (OPINION on the fit, from the profile facts). ZK angle: Switzerland publishes no ZK scheme; our relying-party-side proof applies unchanged.

## United Kingdom

FACT: GOV.UK Wallet holds "mdoc-based credentials for the digital driving licence" and W3C VCs "without selective disclosure support"; since 20 May 2026 "new issuers must use the mdoc format". Sharing protocols announced: OpenID4VP for remote flows and ISO/IEC 18013-5 for proximity, with proximity first and remote "in the future". Trust: GDS operates a certificate authority and pins a root in the app; the wallet releases data outside government only to a Digital Verification Service "certified against the trust framework" and on the DVS register; certification by a UKAS-accredited body; trust framework 1.0 in force "no earlier than 1 September 2026"; the sandbox requires DVS enrolment. Predicate: age_over_{nn} on the mDL, with age_over_18 as the documented example. GOV.UK One Login itself is OIDC login, not a credential.

Verdict: supportable. Needed: the mdoc path (a Longfellow proof through verifier-zk, or an mdoc circuit of our own) and a certified DVS as the registered relying party, because the wallet will not answer an unregistered verifier. Not before the remote OpenID4VP flow ships (date unverified).

## United States (state mDLs, Apple, Google, the DC API)

FACT: AAMVA issuers "must adhere to the ISO 18013-5 standard"; the VICAL of issuer certificates is a free download under terms; TSA accepts digital IDs from 22 states plus Puerto Rico. Apple: any ISO 18013-5 reader can verify Wallet IDs; online presentation runs over the W3C Digital Credentials API in Safari 26 with ISO 18013-7 Annex C request format, org-iso-mdoc only; businesses register with Apple Business Register or Business Connect; AgeThresholdElementWithAge:18 returns a boolean. Google: ISO mdoc IDs over OpenID4VP 1.0 with DCQL and the openid4vp-v1-signed protocol, age_over_18 in the ISO namespace, JWE responses, open sandbox, production after the Relying Party Onboarding Form; and "change your request format to mso_mdoc_zk" for a Longfellow proof, verified "using Google's longfellow-zk library". Chrome 141 ships the DC API on Android and desktop. Google also issues an "ID pass" for the United States, Brazil, India (Aadhaar), Singapore, Taiwan and the United Kingdom under a Google-hosted IACA.

Verdict: supportable, and the Google path is the closest to running code we have: verifier-zk already emits an mso_mdoc_zk DCQL query for longfellow-libzk-v1 and verifies the proof against a configured issuer anchor. Needed: an on-chain verifier for that path (Longfellow proofs are not EVM-verifiable today; the honest design is the SP1 route wrapping the Longfellow verification, or attestation by the operator after off-chain verification, stated on screen), the VICAL or issuer IACA as the anchor, and Google relying-party onboarding. Apple's path is mdoc without ZK and without OpenID4VP; it needs an mdoc verifier and Apple registration. The ID pass is a Google credential, not a state one.

## ICAO passport chip (zkPassport)

FACT: the ICAO Master List "contains the Country Signing Certificate Authority (CSCA) public key certificates of ICAO PKD members", 579 certificates in the version of 15 July 2026, downloadable by the public under terms; the PKD has 111 participants on its page; a private-sector programme on a paid basis replaces the pilot, expected 2027. FACT (zkpassport.md): the app proves over the chip's signature chain in Noir on the phone, binds the crypto address and chain id, and the root verifier is live on mainnet, Sepolia and Base; our adapter and tests exist.

Verdict: supported now through the zkPassport adapter. No relying-party registration exists on this route; the trust anchor is the issuing country's CSCA. It covers every country with a chip passport, including all the countries below whose national systems are not compatible. It is a different ZK stack (zkPassport's circuits), consumed as a proof, not as a credential.

## Estonia

FACT: the current eID is certificate based (SK ID Solutions and state CA chains) and used for authentication and signing, through OIDC for the public sector and the Smart-ID RP API for companies. The EUDI wallet is at the tender stage (announced 18 May 2026, about a year to contract); the RP register MVP is planned for end of 2026 or early 2027; format not named. Verdict: not compatible today (an authenticated identity, not a presentable credential with an issuer signature over claims); supportable when the Estonian EUDI wallet ships, on the EUDI route.

## Ukraine (Diia)

FACT: a company "receives a copy of the document in PDF format and / or imports the document's metadata"; the flow is a deep link confirmed with Diia.Signature, or a barcode offline; integration is free and legally mandatory to accept in Ukraine; no trust list or root for third parties is published. Verdict: not compatible. The document is delivered by Diia's platform, not signed as a credential a third party verifies against a public anchor. CLAIM: Ukraine takes part in the EU pilot POTENTIAL; no format or date.

## Singapore (Singpass)

FACT: Myinfo and Verify return JSON over OAuth 2.0; onboarding requires "a Singapore-registered entity"; Verify "is no longer supporting new onboarding"; no SD-JWT VC, mdoc, W3C VC or OpenID4VP on any fetched page. Verdict: not compatible as a credential system. The one mdoc that exists is Google's ID pass for Singapore, which is a Google credential.

## Australia

FACT: the federal AGDIS uses "the AGDIS OpenID Connect Profile" as "the only federation protocol" with JWTs; private relying parties can apply to the regulator from 30 November 2026 (CLAIM, the official site refused our fetches). Queensland's licence follows ISO 18013-5 and shows an over-18 view without name or address; NSW offers an ISO 18013-5 "Verifiable Credential" upgrade; neither publishes an IACA for third-party download (unverified). Verdict: federal not compatible (login, not credential); state mDLs supportable with the mdoc path once an issuer anchor is obtainable.

## Japan (My Number Card)

FACT: JPKI issues X.509 certificates; the Digital Agency authentication service is OAuth 2.0 and OIDC with RP registration; the driver's licence lives on the card's chip since 24 March 2025 and is read by a PIN-protected app; the card is in Apple Wallet since 24 June 2025. No mdoc, SD-JWT VC or OpenID4VP on official pages. Verdict: not compatible today (authentication and signature certificates). CLAIM: an ISO 18013-5 smartphone licence is targeted for end of 2026; if it ships, the US verdict applies.

## South Korea (mobile ID)

FACT: relying parties file a DID document, an application and a scenario video with KOMSCO, install the integration module, and may use only some modes; the design is DID and blockchain based with selective disclosure; licence since 2022, resident card since March 2025, Samsung Wallet and banks as private wallets. No ISO 18013-5, OpenID4VP or SD-JWT VC statement found. Verdict: not compatible (proprietary module and approval process, no format our verifiers parse).

## Taiwan (Digital Identity Wallet)

FACT: the Ministry of Digital Affairs publishes the wallet under the MIT licence; the API specification (revision 1.2, 12 December 2025) exchanges credentials "in accordance with the OID4VCI and OID4VP international standards"; the credential is "an SD-JWT format VC token" with header typ vc+sd-jwt, alg ES256, the issuer key located by jku and kid, issuer and holder identified by DIDs, a status list, and selective disclosure per field; the verifier runs a module provided by the ministry on its own server, the flow returns a QR code and an openid4vp:// deep link, and requests use presentation_definition. The sandbox has been open since 31 March 2025 to organisations, businesses, civil groups "and individuals". CLAIM: trust lists are planned and the system is in trial operation without a dedicated statute.

Verdict: supportable, and the closest of the non-EU systems after Switzerland. The SD-JWT is the shape the Noir circuit parses (ES256, an issuer key we can pin from the JWKS). Open until a sandbox credential is read: the digest algorithm, whether the holder signature is a KB-JWT, the claim names of the natural-person credential and whether it carries an age boolean, and the request profile (Presentation Exchange, not DCQL, so verifier-service needs a second query dialect or the ministry's module in front of it).

## United Arab Emirates (UAE Pass)

FACT: UAE Pass offers OAuth 2.0 and OpenID Connect login returning proprietary JSON attributes, PAdES signatures over PDF, and document sharing for private organisations; onboarding needs a UAE trade licence and a service provider agreement; the full documentation contains no verifiable credential, SD-JWT, mdoc or OpenID4VP. Verdict: not compatible (an attribute API, not a credential a third party verifies against a public anchor).

## Brazil (gov.br)

FACT: gov.br login is OpenID Connect with bronze, silver and gold reliability levels; the digital driver's licence is checked by QR code in the Vio app or exported as PDF with a P7S signature; www.gov.br was unreachable to our fetches. CLAIM: private companies integrate through paid Serpro or Dataprev contracts. Verdict: not compatible today. Google's ID pass for Brazil is a Google mdoc, not a gov.br credential.

## India (Aadhaar, DigiLocker)

FACT: Aadhaar offline verification requires registration as an Offline Verification Seeking Entity with UIDAI, uses a callback or app intent flow, allows "complete or selective" verification and forbids verifying "on behalf of another entity"; DigiLocker issues signed XML (format 1.9) and requires a signed terms of service for requesters. CLAIM: the 2025 Aadhaar app answers over-18 without the date of birth. Verdict: not compatible (registration-bound national APIs, no SD-JWT or mdoc). Google's Aadhaar ID pass is a Google credential under Google's anchor.

## Canada

FACT: the Pan-Canadian Trust Framework is format neutral; BC Wallet presents credentials and the BC person credential "is only accepted by select pilot projects"; no private relying-party path or trust list found. CLAIM: AnonCreds over Aries; Quebec's identity project suspended. Verdict: not compatible today.

## What the toolkit would need per verdict

Supported now (EUDI SD-JWT, swiyu Beta-ID, zkPassport):

- swiyu: a did:webvh for the verifier on the base registry, JAR signing with that DID, DID resolution of the issuer key in verifier-service, a Beta-ID test vector through the Noir circuit and the SP1 guest, the vct and key hash as contract parameters. No circuit change expected; unverified until the vector runs.
- zkPassport: already built (WP33); the builder decides on 2026-09-10 whether the route stays.

Supportable (Taiwan, UK, US mDLs, Google ID pass, Australian state mDLs, Japan if the mDL ships, Estonia when its wallet ships):

- Taiwan: read one sandbox credential, confirm the digest algorithm and the holder binding, run it through the circuit, add Presentation Exchange to verifier-service or sit behind the ministry's verifier module, pin the JWKS key. No mdoc work.

- an mdoc path. Cheapest: consume mso_mdoc_zk Longfellow proofs through the existing verifier-zk crate, which buys the same "the relying party never sees the claims" property as our Noir route, but with Google's circuit and, today, no EVM verifier for Longfellow proofs; the chain would take an SP1 proof of the Longfellow verification or an operator attestation with that limit stated. Alternative: an mdoc circuit of our own (COSE_Sign1 over the MSO, SHA-256 digests of IssuerSignedItems, ES256 issuer key, DeviceAuth over the SessionTranscript), which is new circuit work of a size comparable to the SD-JWT circuit.
- a trust anchor we can pin: AAMVA VICAL or issuer IACA (US), the GDS root (UK, after DVS certification), Google's IACA (ID pass), state IACAs (Australia, not published).
- a relying-party registration we do not hold: DVS certification (UK), Apple Business Register or Google onboarding (US), regulator approval (Australia).

Not compatible (Ukraine, Singapore, Korea, Japan today, Estonia today, AGDIS, UAE, Brazil, India, Canada):

- no verifiable credential leaves the system, or the trust model is an approved integration rather than a public anchor. The honest offer is the passport route, which works for these citizens regardless of the national system.

ZK angle in one list: the Noir SD-JWT circuit consumes EUDI SD-JWT PIDs and, after the adapter changes, swiyu credentials and probably Taiwan's; the Longfellow route (verifier-zk) consumes mdocs from Google Wallet today and from any wallet that adopts mso_mdoc_zk; zkPassport brings its own circuits; nothing consumes Diia, Singpass, Korean mobile ID or JPKI.

## Sentences we may use on the landing page and in the pitch

- "Attestat consumes OpenID4VP presentations of SD-JWT credentials. Today that is the EU wallet; the Swiss e-ID uses the same formats and protocol, and its test credential carries the same over-18 claim."
- "Switzerland's e-ID is expected to go live on 1 December 2026 on SD-JWT VC and OpenID4VP 1.0; we expect our verifier to need a Swiss DID and a new issuer key rather than a new circuit, and a Beta-ID test vector is the next step."
- "A biometric passport works anywhere: the zkPassport route proves over 18 from the chip on the phone, and the same registry stores the decision."
- "Mobile driving licences in Apple and Google Wallet are ISO mdocs. Google's wallet already answers age requests with a Longfellow zero-knowledge proof; our verifier accepts that proof format off chain today, and an on-chain path for it is planned."
- "GOV.UK Wallet is moving to mdoc and OpenID4VP; verifying it requires a certified UK digital verification service, which we are not."
- "Taiwan's digital identity wallet issues SD-JWT credentials over OpenID4VP; the same circuit should apply once we have read a sandbox credential."
- "Singpass, Diia, UAE Pass, gov.br, Aadhaar, Korea's mobile ID and Japan's My Number Card do not hand a third party a credential it can verify against a public anchor; for those citizens the passport route applies."
- "No demo here used a live national wallet other than the German EUDI test wallet and zkPassport; every other statement is read from the published specifications."

## Unverified

- Whether a swiyu Beta-ID SD-JWT passes the Noir circuit and the SP1 guest unchanged (header order, vct length, disclosure layout). No vector has been run.
- The production e-ID vct and claim list (the Beta-ID list is stated to match).
- Cost per DID on the swiyu base registry; eligibility of foreign companies as verifiers; Beta-ID versus production onboarding differences.
- ISO/IEC 18013-7:2025 annex contents on the official host (iso.org returned 403); the third edition date 2026-12-21 comes from an EUDI GitHub issue.
- Longfellow circuits for SD-JWT (the README names JWT as a target; only mdoc circuits are deployed anywhere we found).
- The date GOV.UK Wallet's remote OpenID4VP flow ships; the UK Veteran Card and licence rollout dates (blog claims).
- The number of US mDL states and DTS members (AAMVA map is a graphic); Apple and Google fees; foreign relying-party eligibility at Apple, Google, Singpass, KOMSCO, the Digital Agency.
- Australian federal dates (official site refused fetches); state IACA availability; online 18013-7 presentation for QLD and NSW.
- Japan's ISO 18013-5 smartphone licence (press only).
- Korea's DID method and any ISO conformance; the adult-status-only disclosure as a clean fact.
- Estonia's wallet credential format; Ukraine's participation details in POTENTIAL; Canada's BC Wallet format and any RP path.
- Taiwan: the digest algorithm, the holder-binding form, the natural-person credential's claims and age boolean, the trust list, foreign verifier eligibility, the statute.
- UAE Pass trust root and age predicate; gov.br private-sector terms and any wallet anchor (site unreachable); India's over-18 feature (PIB returned 403) and any DigiLocker VC format.
