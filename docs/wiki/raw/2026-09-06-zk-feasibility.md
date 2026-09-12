---
type: memo
agent: zk-feasibility
title: Which ZK presentation of an EUDI credential a solo builder can demonstrate by 2026-09-13
fetched: 2026-09-06
method: Read-only inventory of the repos under [local path, withheld] (three Explore subagents on grep, sed, ls, git log; nothing built, run, or modified), three web research subagents (WebSearch and WebFetch, every URL dated 2026-09-06), plus direct reads of the nullwissen sandbox report, plan, KT-a results and Route 3 recon by the memo author. Evidence labels FACT, COUNT, CLAIM, OPINION; "unverified" where not confirmed.
---

# ZK feasibility for the ETHOnline 2026 submission (deadline 2026-09-13 12:00 EDT)

## Summary

1. FACT: no shipped component can take the German sandbox PID and produce a zero-knowledge proof. The sandbox is locked to the official SPRIND wallet, and that wallet does not generate ZK proofs. Any "real sandbox PID in ZK" claim would be false.
2. FACT: the builder already owns a fail-closed Rust verifier for `mso_mdoc_zk` (Longfellow) that verifies real proofs from Google's unmodified v7 circuits, with 139 ZK-path tests and a recorded evidence bundle. The prover in that demo is a software generator on the laptop and the issuer is a development CA.
3. FACT: the builder's Android app nachweis-android is not a fork of the EU reference app. It is an original app on wallet-core 0.28.1, holds only an SD-JWT PID, has no mdoc path and no ZK wiring. wallet-core 0.28.1 exposes Longfellow only for proximity BLE and the Digital Credentials API, not for remote OpenID4VP.
4. FACT: on-device Longfellow proving has never been measured in the builder's repos; only a laptop host-JVM run exists (282 to 615 ms). Published third-party figures put a Pixel 6 Pro at about 800 ms.
5. FACT: the registrar certificate covers only `dc+sd-jwt`, three claims, SAN localhost. Any mdoc or ZK request is outside the registered scope. A ZK presentation from the builder's own wallet to the builder's own verifier involves no SPRIND component and is ungated, but must not be presented as sandbox-registered.
6. FACT: standards are not settled. OpenID4VP 1.0 Final and the 1.1 editor's draft contain no ZK text; issue 627 sits open at milestone "1.2 or later". ARF 3.0.0 states no ZKP scheme is selected. ETSI TS 119 476-2 is an early draft (v0.0.4, 2026-07-08) with publication targeted 2027-02-28. Only Google Wallet's DC API verifier docs and the ISO 18013-5 second edition draft define `mso_mdoc_zk`.
7. OPINION: the only demo that is fully real today is option A (sandbox wallet, selective disclosure) plus option B (real proof verification, simulated wallet). Option C (own Android holder app proving on the phone) is the credible stretch and is large, with the wallet-core bump and the OpenID4VP ZK glue as the net-new code, and device proving time as the unmeasured unknown.
8. OPINION: the passport-chip route (option D) works today with an Austrian passport in zkPassport or Rarimo, but it is a second app, proving takes tens of seconds, and it is exactly the objection the moderator expects. Use it only as a side-by-side comparison, not as the product.
9. Recommendation: ship B as the guaranteed on-camera ZK verification with A as the real-credential baseline, honestly labelled; attempt C behind the four-leg tripwire already written in nullwissen; kill C if legs (a) compile on wallet-core 0.29 or newer and (c) local proof generation do not pass before the demo recording is due.
10. Kill criterion for the whole ZK direction: if C fails the tripwire and the jury story cannot survive "the phone side is simulated", fall back to the selective-disclosure and over-ask story that already runs end to end against the sandbox wallet.

## What exists in the builder's repos

| Component | Path | State | Evidence |
|---|---|---|---|
| OpenID4VP verifier, SD-JWT German PID path | klartext-verifier/verifier-core/src/pid.rs | Runs end to end against sandbox iOS and Android wallets (2026-06-25) | FACT: nullwissen/research/sandbox-surface/report.md:148; verifier/docs/live-phone-path.md:1-13 |
| `mso_mdoc_zk` verifier crate (Longfellow, fail-closed) | klartext-verifier/verifier-zk/src/lib.rs | Working; pinned to google/longfellow-zk rev 3dfaac72 as cargo git deps; 139 ZK-path tests, 37 negative tests against a real proof | FACT: verifier-zk/README.md:26-41; verifier-zk/Cargo.toml:14-19; lib.rs:76 |
| ZK demo site (local only) | klartext-verifier/README.md:143-186 | Serves at http://127.0.0.1:8090/zk/demo; refuses to start without registry plus trust anchors | FACT: README.md:151-153, 173; no hosted URL found (unverified) |
| Software prover and mdoc minter (`zk-vectors`) | klartext-verifier/zk-vectors/src/{lib,mint}.rs | Mints its own mdoc under doctype eu.europa.ec.eudi.pid.1 and proves with the pinned Longfellow prover on the laptop | FACT: zk-vectors/src/lib.rs:4-7; mint.rs:23 |
| Evidence bundle of the ZK demo | klartext-verifier/docs/evidence/zk-demo/README.md | Three recorded runs (200, 422 DOWNGRADE_TOTAL, 422 PROOF_INVALID); proof about 365 KB, not committed | FACT: README.md:36-53, 57-63; "No end-to-end run with a real wallet on a phone" at :65-71 |
| Circuits (Google upstream, unmodified) | [local path, withheld] | Two files (540,415 B and 480,913 B), provenance recorded in MANIFEST.json | FACT: kit/vectors/README.md:213-216; MANIFEST.json:310-325 |
| Interop kit, 30 session-binding vectors | [local path, withheld] | V01 to V30 all passing; decision memo Codex-accepted | FACT: nullwissen/wiki/decisions/session-binding.md:12, 101-128 |
| KT-a byte-fit gate (EUDIPLO-issued mdoc fits Longfellow v7 bounds) | [local path, withheld] | PASS for a minimal four-claim PID (largest item 114 B of 119, margin 5 B); FAIL for the full 23-claim PID (resident_street 124 B) | FACT: results.md:157-160, 196-198 |
| KT-b fixture verification on the pinned Rust tree | [local path, withheld] | PASS: 281 tests, 242/242 fixtures, all 4 mutations rejected; host is Apple Silicon, not a phone | FACT: results.md:7-8, 14-19 |
| Bench harness for Multipaz Longfellow on Android | [local path, withheld] | Eight cells defined; "No device numbers exist yet"; only a host-JVM plumbing run (v7 one attribute warm 323 ms, proof 361 KB) | FACT: README.md:23-32, 306-312 |
| Route 3 tripwire recon (own Kotlin glue in nachweis) | [local path, withheld] | Verdict: attemptable without a phone; blockers are the 0.28.1 to 0.29 bump, SD-JWT-only gates, DefaultOid4vpGateway API migration | FACT: recon.md:22-24, 157-178, 304-311 |
| Android holder app | [local path, withheld] | Original app (30 commits, no upstream remote), wallet-core 0.28.1 from Maven Central, SD-JWT PID only, no ZK strings anywhere, live verification only on emulator | FACT: gradle/libs.versions.toml:10,52; README.md:3-14, 56; grep for configureZkp/zkp/longfellow: zero hits |
| wallet-core checkout | [local path, withheld] | v0.28.1 shallow clone, dirty tree (PR #369 patch on SubmitRequest.kt); ships ZKP.md, four bundled v7 circuits, multipaz 0.99.0 | FACT: gradle.properties:44; ZKP.md:29-38; wallet-core/src/main/assets/circuits/longfellow-libzk-v1/ (4 files, about 1.3 MB) |
| wallet-core ZK transports | .../eudi-lib-android-wallet-core/wallet-core/src/main/java/eu/europa/ec/eudi/wallet/EudiWallet.kt | zkSystemRepository passed to BLE TransferManager (:557) and DCAPIRequestProcessor (:455); OpenId4VpManager (:435-445) receives none | FACT: grep for zk under transfer/openId4vp/: zero hits |
| Own issuer (EUDIPLO) | https://api-sandbox.nachweis.tech, config in nachweis-android/app/build.gradle.kts:46-47 | Deployed, self-operated; has a pid-mdoc config per the sandbox report; KT-a issued from it | FACT: sandbox-surface/report.md:305-311; kt-a/results.md:1-11 |
| Relay for phone-reachable response_uri | augenmass serve, https://wallet.augenmass.tech/r/<run-id>/ | Described as live in the sandbox report; not re-verified now (unverified) | CLAIM: sandbox-surface/report.md:327-329 |
| Registrar RP entry | RP 2af138a8-59ea-4a84-aea3-666cafdb1369 "Hackathon - Reza" | Active 2026-06-02 to 2027-06-02; format dc+sd-jwt, vct urn:eudi:pid:de:1, claims given_name, family_name, age_equal_or_over.18; SAN DNS:localhost | FACT: sandbox-surface/report.md:116-129 |
| Sandbox rules | [local path, withheld] | Official wallet is "the only wallet that you can use"; own wallet cannot pull the sandbox PID; presentation to own verifier ungated; no ZK mention; second sandbox edition planned Oct/Nov 2026 | FACT: sandbox-constraints.md:11, 13, 30 |
| Outbound drafts (ARF #700 questions, Longfellow namespace defect report, OpenID4VP ZK profile) | [local path, withheld] | All three staged, none sent; novelty check not done | FACT: outbound/*.md status lines |

COUNT: the nullwissen and verifier repos were last committed 2026-08-01 and 2026-08-17 respectively; nachweis-android on 2026-07-13. Nothing in the builder's ZK stack has moved in the last three weeks.

## State of the art (fetched 2026-09-06 unless dated otherwise)

Longfellow ZK (google/longfellow-zk)
- FACT (https://api.github.com/repos/google/longfellow-zk/releases/latest): v0.9, 2026-03-31; prover memory under 200 MB. v0.8.6 (2026-01-13) introduced circuit version 7. Last commit 2026-09-03.
- FACT (https://raw.githubusercontent.com/google/longfellow-zk/main/README.md): Apache-2.0; "currently undergoing two independent security reviews"; no production-readiness statement; no timing numbers in the repo.
- FACT (https://google.github.io/longfellow-zk/docs/reviews/): Trail of Bits 2025-08-18 (two high-severity, addressed), ISRG finding fixed in v0.8.4, Ligero analysis 2025-12-15.
- FACT (https://eprint.iacr.org/2024/2010): mdoc proofs "in a few hundred ms on mobile devices", no device named. TS13 v1.0.1 quotes about 800 ms on Pixel 6 Pro, 0.6 s verify, about 400 KB proof.
- FACT (repo tree): no Kotlin or JNI binding in the Google repo; android.sh is an arm64 cross-compile script only.

Multipaz (openwallet-foundation/multipaz)
- FACT (https://api.github.com/repos/openwallet-foundation/multipaz/releases/latest): 0.100.0, 2026-07-08, "ZKP improvements, including issuing ZKP-friendly mDLs in the test app and surfacing ZKP errors to Kotlin". 0.99.0 (2026-05-04) bundled Longfellow v0.9 and circuits. 0.96.0 added iOS.
- FACT (https://central.sonatype.com/artifact/org.multipaz/multipaz-longfellow-android): Maven artifact at 0.100.0, jniLibs for arm64-v8a and x86_64, eight bundled circuits (v6 and v7, one to four attributes).
- Whether the Multipaz test app presents ZK over OpenID4VP (versus DC API or proximity): unverified.

EU reference wallet
- FACT (https://api.github.com/repos/eu-digital-identity-wallet/eudi-lib-android-wallet-core/releases): latest v0.30.2, 2026-08-26; "zkp support" since v0.23.0 (2026-01-16); multipaz 0.99.0 on main.
- FACT (https://raw.githubusercontent.com/eu-digital-identity-wallet/eudi-lib-android-wallet-core/main/ZKP.md): configureZkp API, v7 circuits bundled, limits IssuerSignedItem 119 B, elementValue 64 B, MSO 2533 B; automatic fallback to a plain DeviceResponse when proof generation fails; no mention of OpenID4VP or DC API.
- FACT (eudi-app-android-wallet-ui releases/latest): Demo 2026.08.41, no ZK mention; whether it calls configureZkp: unverified.
- FACT (eudi-lib-ios-wallet-kit releases): v0.50.0, 2026-09-03, no ZK. The separate av-lib-ios-longfellow-zkp v0.15.0 (2026-07-09) says WalletKit "will automatically generate zero-knowledge proofs for ZK-enabled requests in both proximity and OpenID4VP use cases" once the app injects a ZkSystemRepository; "strongly recommend to not put this version into production". The builder's KT-c source trace confirms: YES over direct_post at library level, NO over DC API, official iOS app injects nothing (FACT: nullwissen/research/kt-c/report.md:17-30).
- FACT (eudi-srv-web-verifier-endpoint-23220-4-kt releases): v0.11.0, 2026-07-24, no ZK support.

OpenID4VP and ISO
- FACT (https://api.github.com/repos/openid/OpenID4VP/issues/627): "Support for mdoc ZKP requests", open since 2025-06-03, milestone "1.2 or later", no linked PR.
- FACT (https://openid.net/specs/openid-4-verifiable-presentations-1_0.html and the 1.1 wg-draft, August 2026): no mso_mdoc_zk, no zk_system_type, no ZK appendix.
- FACT (https://developers.google.com/wallet/identity/verify/accepting-ids-from-wallet-online, updated 2026-06-29): Google defines `"format": "mso_mdoc_zk"` with `meta.zk_system_type = [{system: "longfellow-libzk-v1", circuit_hash, num_attributes, version}]` over the DC API. This is the only production definition of the format.
- CLAIM (search summary citing TS13): ISO 18013-5 second edition CD text defines ZkRequest and ZkDocument; the ISO text itself is paywalled, unverified.

ARF, TS13, TS14, ETSI
- FACT (ARF main, docs/main/07-...md section 7.4.3.5.3): "No specific ZKP has been selected to be supported by components in the EUDI Wallet ecosystem." ARF v3.0.0 released 2026-07-23. Annex 2 Topic 53 carries ZKP_01 to ZKP_09; ZKP_08 restricts to ECCG agreed mechanisms.
- FACT (https://eudi.dev/latest/discussion-topics/): Topic G refinement round, Iteration 6, 2026-09-23 to 2026-11-18. The discussion paper is still v1.4 of 2025-03-30.
- FACT (TS13 v1.0.1, 2026-01-30): defines ZK type `longfellow-libzk-v1`, exploratory, to be handed to ETSI. TS14 v1.0 (2026-02-27) is BBS-based.
- FACT (https://portal.etsi.org/webapp/WorkProgram/Report_WorkItem.asp?WKI_ID=74931): TS 119 476-2 early draft v0.0.4 uploaded 2026-07-08; publication target 2027-02-28 (issue #498 comments). Only TR 119 476 v1.2.1 (2024-07) is published.

Microsoft Crescent
- FACT (https://raw.githubusercontent.com/microsoft/crescent-credentials/main/README.md): JWT (RS256) and device-bound mDL, Groth16, single pre-release v0.4 (2024-12-13), last commit 2026-08-24, browser-extension sample only, no Android or iOS app, "not audited, not for production". SD-JWT VC with ES256 (the German PID shape) is not a listed parameter set. Not a candidate for this deadline.

German wallet and member states
- FACT (https://bmi.usercontent.opencode.de/eudi-wallet/wallet-development-documentation-public/latest/architecture-concept/02-architecture/03-cryptography.html): ECDSA P-256 throughout, no ZKP, BBS or Longfellow.
- FACT (https://eprint.iacr.org/2026/330): SPRIND and HPI SoK on anonymous credentials, February 2026; research, not deployment.
- CLAIM (corbado.com, 2026-06-10): SPRIND and HPI presented anonymous-credential work at EIC 2026; German public availability "early 2027". No member-state ZKP deployment announcement found for 2026 (unverified beyond the searches run).
- FACT (https://blog.google/products-and-platforms/platforms/google-pay/secure-identity-payment-tools/, 2026-06-04): Sparkasse age credential live in Google Wallet; whether that flow uses ZKP or plain selective disclosure is contradicted between secondary sources (unverified).

Passport-chip stacks (comparison points)
- FACT (https://docs.zkpassport.id/faq): Noir plus Barretenberg UltraHonk on device; base proofs 10 to 50 s, disclosure under 1 to 10 s, up to 2 GB RAM for ECDSA; brainpool P512r1 with SHA-512 listed as supported (the German DSC profile); circuits Apache-2.0; self-hostable proof verifier. Acquired by Aztec Labs 2026-05-27. Coverage map is JS-only; Austrian and German passport status unverified.
- FACT (https://github.com/selfxyz/tee-prover-server): Self's register and DSC proofs run in a Google Confidential Space TEE, although the site says "on-device"; @selfxyz/core 1.2.0-beta.1 (2026-02-05); enterprise plane needs API key.
- FACT (https://github.com/rarimo/passport-zk-circuits-noir): Android bench brainpoolP512r1 67 s and 2.7 GB RAM; a "D<< (Germany, KMS)" circuit exists since v0.2.5 (2024-12-05); self-hosted verificator-svc, MIT; no 2026 news found.
- FACT: none of the three mentions EUDI, ARF, mdoc or SD-JWT. None reads the German Personalausweis (PACE/EAC, not ICAO 9303).

## Candidate architectures

### A. German sandbox wallet, selective disclosure, real state-issued sandbox PID (baseline)

- Exists: verifier SD-JWT path (klartext-verifier/verifier-core/src/pid.rs), live-phone runbook (verifier/docs/live-phone-path.md), registrar entry, over-ask check.
- To build: replace placeholder privacy and support URLs (README.md:224-226); add `redirect_uri` to the response JSON for a clean same-device close (sandbox report step "Also build").
- Effort: small.
- Real on camera: a state-issued sandbox PID, the official wallet, a signed OpenID4VP request checked against the registrar certificate, selective disclosure of three claims, over-ask refusal.
- Simulated: nothing, but there is no ZK. Trust anchors are sandbox mock anchors (README.md:202-204).
- Outside the builder's control: sandbox wallet availability, single-use PID batch of ten.
- Biggest risk: the jury hears "selective disclosure" as "not ZK". OPINION.
- Kill criterion: none technical; kill only if the sandbox wallet stops issuing during the recording week.

### B. verifier-zk accepting a Longfellow proof from the software prover over a credential minted by an issuer the builder controls

- Exists: verifier-zk crate, zk-vectors prover and minter, demo site, evidence bundle, registry recipe with circuit hash 5aebdaaa..., development CA. All under klartext-verifier (local checkout) and nullwissen/kit/vectors.
- To build: optionally swap the development CA for the deployed EUDIPLO issuer's certificate and prove over an mdoc actually issued by api-sandbox.nachweis.tech (KT-a already produced such a credential, [local path, withheld]). That makes the issuer real and leaves only the holder simulated. Whether zk-vectors can take an externally issued mdoc as input rather than minting its own: unverified, read zk-vectors/src/lib.rs before promising it.
- Effort: small (as is) to medium (with the EUDIPLO-issued credential).
- Real on camera: a real Longfellow proof (about 365 KB) over Google's unmodified v7 circuit, verified fail-closed; negative runs (plain document rejected with DOWNGRADE_TOTAL, wrong binding rejected with PROOF_INVALID); the verifier refuses to start half-configured.
- Simulated: the wallet. The proof is generated on the laptop by zk-vectors, not on a phone. Must be declared as such on screen.
- Outside the builder's control: nothing at runtime.
- Biggest risk: the jury sees a server talking to itself. OPINION.
- Kill criterion: none; this is the floor. If the ZK story is dropped entirely, B is not shown.

### C. Own Android holder app proving on the phone, presented over OpenID4VP to verifier-zk

- Exists: nachweis-android (OpenID4VCI, OpenID4VP, WRPRC check, SD-JWT PID), wallet-core 0.28.1 with bundled v7 circuits and configureZkp, EUDIPLO issuer with a pid-mdoc config, KT-a minimal four-claim mdoc that fits the circuit bounds, verifier-zk, augenmass relay, Route 3 tripwire recon with per-leg blockers.
- To build (from the recon and the sandbox report): (1) bump wallet-core 0.28.1 to 0.29.0 or 0.30.2, migrating DefaultOid4vpGateway.kt:93 and its test to the new suspend API and CredentialPresentmentSelection; (2) widen OfferEvaluation.kt:19 and the document model to accept mso_mdoc with doctype eu.europa.ec.eudi.pid.1; (3) issue the minimal four-claim mdoc PID from EUDIPLO into the app on a physical phone; (4) call LongfellowZkSystem yourself from the OpenID4VP gateway when DCQL carries format mso_mdoc_zk and a supported zk_system_type, build the SessionTranscript per the D1 handover shape, and place the ZkDocument in the vp_token; (5) make it fail closed (no plain-document fallback; wallet-core's own fallback at ZKP.md:105-109 is the opposite); (6) provision the EUDIPLO issuer certificate as the verifier's ZK trust anchor via ZK_TRUST_ANCHOR_PATH and the two-link path profile (verifier-zk/README.md:190-235); (7) record on a physical device.
- Effort: large. Count of decision points needing human judgment: the wallet-core bump (breaking changes, persisted-metadata schema incompatible, PR #369 status on 0.29 or newer unverified), the transcript construction, the fail-closed policy, StrongBox versus software keystore.
- Real on camera: a credential issued by a real OpenID4VCI issuer into a real wallet app on a real phone, a Longfellow proof generated on the phone, carried over OpenID4VP direct_post to the fail-closed verifier, plus a negative run.
- Simulated or to be declared: the issuer is the builder's own (not a state), the wallet is the builder's own (not the sandbox wallet), the protocol shape is pre-standard (TS13 shape, not in OpenID4VP 1.x), the trust anchor is self-managed.
- Outside the builder's control: wallet-core 0.29 or newer API surface and whether it independently fixed issue #353 (unverified); multipaz-longfellow JNI on the specific phone; Longfellow's namespace-unbound soundness gap (documented in the builder's own outbound draft, unsent).
- Biggest unknowns: on-device proving time and memory (no device number exists anywhere in the repos; published figures are 0.8 to 1.2 s on Pixel-class hardware, but v7 circuits with four attributes on the builder's phone are unmeasured); whether the four-claim mdoc round-trips the app's storage; circuit identity matching between the wallet-core bundled v7 file and the verifier registry hash (the registry recipe pins 5aebdaaa... which is Multipaz's 7_4 circuit, so this should match, unverified by test).
- Biggest risk: the wallet-core bump consumes the budget before any ZK code is written. OPINION.
- Kill criterion (tripwire from [local path, withheld]): legs (a) compiles on wallet-core 0.29 or newer from a clean checkout, (b) imports an actual EUDIPLO mdoc on a clean install, (c) generates and locally verifies a proof for a fixed transcript, (d) ZkDocument round-trips CBOR. If (a) and (c) are not green with two full working sessions of budget left before the recording, stop C and ship A plus B.
- Sub-variant C2, Multipaz test app over the DC API (plan Route 2): uses a named wallet with documented ZK support and avoids the nachweis bump, but the verifier's D2 decision rejects DC API handover (session-binding.md:39-42), so the verifier would need a new binding path. Not cheaper. Transport support in the test app unverified.

### D. Passport-chip route (zkPassport, Self, Rarimo) with the Austrian passport, side by side with the EUDI path

- Exists: zkPassport app and TypeScript SDK (Apache-2.0, self-hostable proof verifier), Rarimo app plus MIT SDK and self-hosted verificator-svc, Self app plus MIT core SDK (TEE proving).
- To build: a verifier page calling one SDK; a short integration into the same demo site.
- Effort: small for zkPassport or Rarimo; Self needs an API key or credits for the managed plane.
- Real on camera: a real ICAO chip read of a real Austrian passport, a real proof of age or nationality, verified by a self-hosted verifier.
- Simulated: nothing, but it is not EUDI. No mdoc, no SD-JWT, no ARF alignment, no German Personalausweis (PACE/EAC is not ICAO 9303).
- Outside the builder's control: whether the Austrian passport's signature algorithm is in the coverage set (zkPassport lists brainpool P512r1 with SHA-512; Austrian DSC profile unverified); app store availability; proving 10 to 50 s (zkPassport) or about 60 s and 2.7 GB (Rarimo brainpool).
- Biggest risk: it undermines the pitch. The moderator's own answer to "why not zkPassport" is "another app, more friction". Showing it as the working path hands the jury that answer against the builder. OPINION.
- Kill criterion: do not build D as a product path. Use it only as a 30-second comparison clip if C fails and the narrative needs a working on-phone ZK to contrast with; kill even that if the Austrian passport does not prove within one attempt.

### E. EU Age Verification app plus hosted AV test issuer, presenting to verifier-zk (the only shipped ZK-capable EU wallet)

- Exists: av-app-android-wallet-ui (wallet-core based, OpenID4VP v1 plus DCQL), hosted AV test services, av-lib-ios-longfellow-zkp v0.15.0 for iOS.
- To build: an mso_mdoc_zk DCQL request from verifier-service; the AV app's reader trust for the builder's verifier.
- Effort: small to try, unknown to finish.
- Real on camera: an EU-published wallet app generating a Longfellow proof over a proof-of-age attestation.
- Simulated or to be declared: the credential is a proof-of-age attestation, not a PID; the issuer is the Commission's test service.
- Outside the builder's control: whether the Android AV app's ZK path is reachable by a third-party OpenID4VP verifier at all. The builder's own KT-c found the iOS library path is YES over direct_post but the official iOS app injects no ZkSystemRepository; the Android AV app's behaviour is unverified. The AV verifier endpoint was archived 2026-07-06.
- Biggest risk: a day spent discovering the ZK path is not exposed. OPINION.
- Kill criterion: one bounded attempt. If no ZkDocument reaches POST /response/:id from the AV app, drop E.

### F. Own iOS app on WalletKit plus av-lib-ios-longfellow-zkp (Route 1 in the builder's plan)

- Exists: library-level ZK over direct_post confirmed by source trace (KT-c), Swift package with prebuilt MdocZK.xcframework.
- To build: an iOS app that injects the ZkSystemRepository, imports the EUDIPLO mdoc, and presents; reader trust provisioning (KT-g).
- Effort: medium to large, and it requires an iOS toolchain, an Apple developer account and an iPhone. The builder's iOS capacity is unverified; every existing app asset is Android.
- Real on camera: same as C, on iOS, with less glue (the library already emits ZkDocument over direct_post).
- Biggest risk: starting a second platform in the final week. OPINION.
- Kill criterion: only pursue if the builder already has a signed iOS build pipeline; otherwise do not start.

Rejected: Crescent on SD-JWT (no ES256 SD-JWT parameter set, no phone, pre-release), BBS and TS14 (needs new issuance, no issuer or wallet support), any "sandbox PID in ZK" claim.

## The two answers

### (1) Can the German sandbox PID in mdoc form feed a Longfellow proof, and can a sandbox credential be exported into an own holder app?

Doctype and format: FACT, the sandbox presentation profile lists mso_mdoc with doctype eu.europa.ec.eudi.pid.1 next to dc+sd-jwt (sandbox-surface/report.md:146), and verifier-zk pins exactly that doctype (verifier-service/src/zk.rs:45-46). Doctype would match.

Attribute fit: the sandbox mdoc's item sizes are unverified; nobody has measured them because no one outside the official wallet holds one. FACT for the builder's EUDIPLO mdoc: a four-claim PID fits (largest item 114 of 119 bytes), the full 23-claim PID does not (kt-a/results.md:157-198). A full sandbox PID mdoc with resident_street would very likely fail the 119-byte bound as well (OPINION, same rulebook). Only circuits for one to four attributes exist.

Issuer key path: verifier-zk needs the issuer's leaf in msoX5chain and a trust anchor in ZK_TRUST_ANCHOR_PATH with a two-link path (verifier-zk/README.md:190-235). The sandbox PID issuer's IACA certificate would have to be obtained from the sandbox trust list; availability and chain depth unverified.

All of this is moot: FACT, the sandbox PID is obtainable only by the official wallet (sandbox-constraints.md:13, 30) and that wallet does not generate ZK proofs (sandbox-surface/report.md:22-23, 243-246). The blocking chain has four independently sourced links.

Export into an own holder app: technically no. A Longfellow mdoc proof must cover a device signature over the session transcript with the credential's device key ("asserts ... the issuer key, the validity window and the transcript", verifier-zk/src/lib.rs:20-27). That key lives in the official wallet's keystore; the issuer required key attestation at iso_18045_high (sandbox-surface/report.md:144). Copying the issuer-signed bytes without the key yields an mdoc no circuit can prove device binding for. Legally: the sandbox constraints document carries no export rule at all (grep for export, WSCD, HSM: zero hits), so the legal position is unverified; the organiser statement "it is the only wallet that you can use" is the operative rule. Do not plan around export.

### (2) Is a ZK presentation to a custom verifier inside the builder's registered relying-party scope?

Outside. FACT: the registration certificate covers format dc+sd-jwt, vct urn:eudi:pid:de:1, claims given_name, family_name, age_equal_or_over.18, SAN DNS:localhost (sandbox-surface/report.md:116-129). An mso_mdoc or mso_mdoc_zk request with age_over_18 is not in that set. Consequences:
- Against the sandbox wallet: a ZK request is refused or flagged as over-ask by the wallet's registration check; and the sandbox wallet could not answer it anyway.
- Against the builder's own wallet: FACT, presentation to a self-operated verifier is ungated, trust is the builder's own reader trust store, no wallet attestation is involved (sandbox-constraints.md:11). But nachweis-android's own WRPRC check (Wrprc.kt, Dcql.kt) will correctly flag the request as outside the registration unless the demo uses a self-issued WRPRC covering mso_mdoc and age_over_18, which the demo flavour already does with a self-managed trust bundle (nachweis-android/README.md:55).
- For the demo: state plainly that the ZK presentation runs between the builder's wallet, issuer and verifier, outside the SPRIND registration, because the registered format is SD-JWT and no ZK format is registrable today (mso_mdoc_zk is not an OpenID4VP format). Requesting a new registration certificate for mso_mdoc plus age_over_18 (augenmass register --target sandbox, dry-run by default) is a third-party contact that needs explicit user authorisation; whether the registrar accepts a ZK-flavoured purpose is unverified, and it would not make the sandbox wallet answer.

## Recommendation with kill criterion

Ship A plus B as the guaranteed demo, honestly labelled on screen: "left, a real state-issued sandbox PID, selectively disclosed by the official wallet; right, a real Longfellow proof over a PID-shaped mdoc, verified fail-closed; the phone side of the ZK path is a software prover because no wallet in the sandbox can prove yet". OPINION: this is defensible in front of a jury and consistent with every honesty statement already in the builder's repos.

Attempt C in parallel as the stretch, in the order the tripwire prescribes: (a) wallet-core bump and compile, (c) local proof generation with the bundled v7 circuit and a fixed transcript on the JVM, then (b) EUDIPLO mdoc import on a phone, then (d) and the OpenID4VP glue. Measure proving time on the builder's phone at leg (c) and write the number into the bench README; that number alone is new evidence nobody in the repos has.

Kill criterion for C: if legs (a) and (c) are not both green while two full working sessions of budget remain before the recording deadline, stop C, keep the measured numbers, and record the demo with A plus B. Kill criterion for the ZK direction as a whole: if the moderator judges that "the phone side is simulated" cannot be said on camera, the ZK direction is not pitchable this week and the over-ask story on the sandbox wallet is the submission.

Do not build D as the product. Do not claim any sandbox PID in ZK. Do not send the outbound drafts as part of the demo week.

## Paths and URLs accessed

Local (all read only):
[local path, withheld]
[local path, withheld]
klartext-verifier/README.md
klartext-verifier/verifier-zk/README.md
klartext-verifier/verifier-zk/src/lib.rs
klartext-verifier/verifier-zk/src/trust.rs
klartext-verifier/verifier-zk/Cargo.toml
klartext-verifier/verifier-service/src/{main,handlers,zk}.rs
klartext-verifier/verifier-core/src/pid.rs
klartext-verifier/zk-vectors/src/{lib,mint}.rs
klartext-verifier/docs/evidence/zk-demo/README.md
klartext-verifier/docs/live-phone-path.md
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld],longfellow-namespace-report,zk-profile-openid4vp}.md
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]
[local path, withheld]

Web (all fetched 2026-09-06):
https://github.com/google/longfellow-zk
https://api.github.com/repos/google/longfellow-zk/releases/latest
https://api.github.com/repos/google/longfellow-zk/releases?per_page=10
https://api.github.com/repos/google/longfellow-zk/commits?per_page=1
https://raw.githubusercontent.com/google/longfellow-zk/main/README.md
https://raw.githubusercontent.com/google/longfellow-zk/main/android.sh
https://google.github.io/longfellow-zk/docs/reviews/
https://eprint.iacr.org/2024/2010
https://www.ietf.org/archive/id/draft-google-cfrg-libzk-01.html
https://datatracker.ietf.org/doc/draft-google-cfrg-libzk/
https://github.com/dyne/longfellow-zk
https://github.com/openwallet-foundation/multipaz
https://api.github.com/repos/openwallet-foundation/multipaz/releases/latest
https://api.github.com/repos/openwallet-foundation/multipaz/releases/tags/0.99.0
https://api.github.com/repos/openwallet-foundation/multipaz/releases/tags/0.93.0
https://github.com/openwallet-foundation/multipaz/tree/main/multipaz-longfellow/src
https://github.com/openwallet-foundation/multipaz/tree/main/multipaz-longfellow/src/commonMain/circuits
https://central.sonatype.com/artifact/org.multipaz/multipaz-longfellow-android
https://github.com/eu-digital-identity-wallet/eudi-lib-android-wallet-core
https://api.github.com/repos/eu-digital-identity-wallet/eudi-lib-android-wallet-core/releases?per_page=30
https://raw.githubusercontent.com/eu-digital-identity-wallet/eudi-lib-android-wallet-core/main/ZKP.md
https://raw.githubusercontent.com/eu-digital-identity-wallet/eudi-lib-android-wallet-core/main/gradle/libs.versions.toml
https://api.github.com/repos/eu-digital-identity-wallet/eudi-app-android-wallet-ui/releases/latest
https://api.github.com/repos/eu-digital-identity-wallet/eudi-lib-ios-wallet-kit/releases?per_page=5
https://raw.githubusercontent.com/eu-digital-identity-wallet/av-lib-ios-longfellow-zkp/main/README.md
https://api.github.com/repos/eu-digital-identity-wallet/av-lib-ios-longfellow-zkp/releases?per_page=5
https://api.github.com/repos/eu-digital-identity-wallet/eudi-srv-web-verifier-endpoint-23220-4-kt/releases?per_page=5
https://github.com/eu-digital-identity-wallet/av-srv-web-verifier-endpoint-23220-4-kt
https://github.com/eu-digital-identity-wallet/eudi-doc-standards-and-technical-specifications/discussions/440
https://github.com/eu-digital-identity-wallet/eudi-doc-standards-and-technical-specifications/issues/498
https://github.com/eu-digital-identity-wallet/eudi-doc-standards-and-technical-specifications (ts4-zkp.md, ts13-zksnarks.md, ts14-zkps-from-mms.md)
https://api.github.com/repos/eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework/releases/latest
https://github.com/eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework (docs/main/07-wallet-solution-certification-and-risk-management.md, Annex 2.02 Topic 53)
https://github.com/eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework/issues/337
https://github.com/eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework/discussions/408
https://eudi.dev/latest/discussion-topics/g-zero-knowledge-proof/
https://eudi.dev/latest/discussion-topics/
https://portal.etsi.org/webapp/WorkProgram/Report_WorkItem.asp?WKI_ID=74931
https://api.github.com/repos/openid/OpenID4VP/issues/627
https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
https://openid.github.io/OpenID4VP/openid-4-verifiable-presentations-1_1-wg-draft.html
https://openid.github.io/OpenID4VP/openid-4-verifiable-presentations-1_0-wg-draft.html
https://developers.google.com/wallet/identity/verify/accepting-ids-from-wallet-online
https://w3c-fedid.github.io/digital-credentials/
https://raw.githubusercontent.com/microsoft/crescent-credentials/main/README.md
https://api.github.com/repos/microsoft/crescent-credentials/releases
https://raw.githubusercontent.com/microsoft/crescent-credentials/main/sample/README.md
https://eprint.iacr.org/2024/2013
https://idtechwire.com/microsofts-crescent-aims-to-make-everyday-credentials-private-unlinkable-and-easy-to-deploy/
https://bmi.usercontent.opencode.de/eudi-wallet/wallet-development-documentation-public/latest/architecture-concept/02-architecture/03-cryptography.html
https://eudi-wallet.gov.de/en/faq
https://eprint.iacr.org/2026/330
https://www.corbado.com/blog/eudi-wallet-2026-deadline-rollout-eic-2026
https://www.biometricupdate.com/202512/the-german-approach-to-eudi-wallet-sprind-launches-sandbox-for-relying-parties
https://www.eideasy.com/blog/eu-digital-identity-wallets-august-2026
https://blog.google/products-and-platforms/platforms/google-pay/google-wallet-age-identity-verifications/
https://blog.google/innovation-and-ai/technology/safety-security/opening-up-zero-knowledge-proof-technology-to-promote-privacy-in-age-assurance/
https://blog.google/products-and-platforms/platforms/google-pay/secure-identity-payment-tools/
https://www.drweb.de/altersnachweis-per-google-wallet-privat-nicht-anonym-2/
https://zkpassport.id
https://docs.zkpassport.id/faq
https://docs.zkpassport.id/limitations
https://docs.zkpassport.id/intro
https://docs.zkpassport.id/changelog
https://github.com/zkpassport/circuits
https://github.com/zkpassport/zkpassport-proof-verifier
https://github.com/zkpassport/mobile-app
https://registry.npmjs.org/@zkpassport/sdk/latest
https://aztec-labs.com/blog/zkpassport-acquisition
https://self.xyz
https://self.xyz/blog/self-raises-9m-seed-round-and-launches-self-points
https://github.com/selfxyz/self
https://github.com/selfxyz/self/issues/126
https://github.com/selfxyz/tee-prover-server
https://docs.self.xyz/docs/self-enterprise/get-started/what-is-self-enterprise/
https://docs.celo.org/build-on-celo/build-with-self
https://registry.npmjs.org/@selfxyz/core
https://rarimo.com
https://docs.rarimo.com/zk-passport/
https://docs.rarimo.com/zk-passport/contracts/
https://docs.rarimo.com/zk-passport/guide-off-chain-verification/
https://docs.rarimo.com/zk-passport/guide-setting-up-verificator-svc/
https://github.com/rarimo/passport-zk-circuits/releases
https://github.com/rarimo/passport-zk-circuits-noir
https://registry.npmjs.org/@rarimo/zk-passport

Failed or unreadable fetches (unverified): registry.zkpassport.id/map (JS only), map.self.xyz, docs.self.xyz country pages (404), multipaz-longfellow README raw (404), repo1.maven.org (403), ISO 18013-5 second edition text (paywalled), ETSI TS 119 476-2 draft v0.0.4 (not downloadable).
