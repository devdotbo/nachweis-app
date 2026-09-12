---
type: wiki
title: Build plan, Sep 7 to Sep 13, sized to six Claude Code sessions plus two GPT sessions
sources:
  - wiki/synthesis.md
  - raw/teammate-memos/2026-09-06-sponsor-integration.md
  - raw/teammate-memos/2026-09-06-zk-feasibility.md
updated: 2026-09-06 (consolidated after jury turns 9 to 11)
author: claude (lead)
---

# Build plan

Submission 2026-09-13 12:00 EDT (18:00 Vienna). One scene only: identity-evidence acceptance at a demo fund issuer (jury turns 10 and 11, [local path, withheld]). The token-sale and euro-yield scenes from earlier versions of this page are withdrawn. The human is the bottleneck on three things no agent can do: the phone runs, the sponsor forms, and the video voice. Everything else is a lane an agent session owns. Effort sizes, not hours. Each lane has a stated return format so the lead can verify without reading dumps.

## Gates (human)

- G0, Sep 7: the registered minimal request (given_name, family_name, age_equal_or_over.18; FACT verifier-core/src/pid.rs:140-146, default in verifier-service/src/handlers.rs:366-368) completes end to end from the Android sandbox wallet to verifier-service through a cloudflared tunnel, issuer trust enforced. Names are received by the service and never leave it. resident_country is a bonus exhibit if the wallet delivers it, not a gate condition. Known blockers from the runbook: iOS nested age claim (use Android), dev leaf SAN is localhost (reissue for the tunnel host or confirm the wallet does not check SAN). Record the run. If it fails, stop this plan; the fallback is the small true sandbox over-ask submission on the official wallet (Work Order was withdrawn by the moderator on 2026-09-06).
- G1, Sep 8: refuse, present, issuer approve, address binding, subscribe, swap, withdraw, both refuse, on Sepolia. From a script is enough.
- G2, Sep 10: on-phone ZK stretch green on legs (a) compile on wallet-core 0.29 and (c) local proof, or the stretch is dropped.
- G3, Sep 11: feature freeze. Sep 12: video. Sep 13 morning: submission package, forms, FEEDBACK.md.

## Lanes

| Lane | Owner | Scope | Effort | Return format |
|---|---|---|---|---|
| L1 Contracts | Claude session 1 | Foundry on Sepolia: AttestationRegistry (attest, withdraw, isEligible, tier, expiry, policy id, issuer role), EudiAllowlistChecker implementing IAllowlistChecker, transfer-restricted demo fund token whose compliance check reads the registry, subscription contract, tests. The chain sees predicate bits, tier, expiry, policy id; never names | small to medium | addresses, test output, ABI paths |
| L2 Verifier bridge | Claude session 2 | verifier-service on a branch: signed predicate result endpoint (booleans, expiry), names never in the response; Ethereum address binding built from scratch (not implemented, not on the verifier roadmap, FACT grep 2026-09-06): the wallet signs the OpenID4VP nonce or a session-bound message with the EVM key, the service verifies and binds the presentation to the address; issuer record match (name plus age) as a service-side step with a separate approval event; a small writer that calls attest. Builder task in the verifier repo, outside this wiki's write scope: fix the SD-JWT residence claim path in verifier-core/src/pid.rs:72-90 (address.resident_country) to the German reference shape (address.country and similar, https://bmi.usercontent.opencode.de/eudi-wallet/developer-guide/resources/pid_reference/, matching the builder's fixture verifier/fixtures/oracle/erica-pid-template-normal.json:25-28) before any residence request is trusted | small to medium | endpoint spec, sample response, binding test, run log |
| L3 Chainlink CRE (conditional) | GPT session 1 (CLI heavy) | Confidential Workflow in TypeScript: handlerInTee receives the name-bearing verifier decision (the one genuinely confidential operation in the flow), emits only the predicate result, writeReport into a receiver that calls the registry; cre workflow simulate with broadcast on Sepolia. Not required by the product. Kill Sep 9 if the simulator write is not done; no ENS substitute, the submission then runs on Uniswap plus Privy. On-screen caption mandatory: simulator, same enclave code, real Sepolia transaction through the Chainlink forwarder | medium | workflow repo path, simulate log, Sepolia tx hash |
| L4 Uniswap pool | Claude session 3 | Seven steps on Sepolia with the published factory, restricted test token, adapter, hook approval, pool init, one swap through the Universal Router from a script; FEEDBACK.md draft; README lines | medium | addresses, swap tx hash, FEEDBACK.md draft |
| L5 Front end | Claude session 4 | Privy embedded wallet app (investor side) plus a minimal issuer approval screen: login, "identity evidence required" state, QR to the verifier, address-control signature, issuer screen showing the record match with remaining checks labelled "simulated" and a separate Approve action, permitted state, subscribe, swap in the pool, withdrawn state. No console. One screen per beat | small to medium | deployed URL, screenshots per beat |
| L6 ZK exhibit | Claude session 5 | verifier-zk demo site regenerated with the current evidence bundle (predicates age over 18 and issuing country; the mdoc request in verifier-service/src/zk.rs:45-52 carries no names), on-screen caption that the official wallet does not produce this proof, and one bounded attempt to feed an EUDIPLO-issued mdoc PID to the software prover (unverified) | small | demo URL, evidence bundle path, attempt result |
| L7 ZK stretch (optional) | GPT session 2 | The four-leg tripwire from nullwissen: wallet-core 0.29 bump in a scratch app, mdoc import from EUDIPLO, configureZkp, local proof. Hard stop at G2 | large | leg status table, device proving time if any |
| L8 Package | Claude session 6 plus human | Remotion video from the beat list, README with reuse disclosure (klartext-verifier, verifier-zk as published dependencies), submission text, sponsor forms. Classification: Continuity, because of the reuse, unless ETHGlobal rules otherwise; Uniswap has a 2,000 USD Continuity twin, Privy's tracks have none and Privy eligibility is unverified (asked 2026-09-01, no answer, [event wiki, local, withheld]); moderator decides whether to ask again. The word KYC appears only in the sponsor form field kycUrl, which is populated with the verifier URL | medium | draft video, README, form checklist |
| L9 zkPassport (optional) | Claude or GPT session | One Bun service around the zkPassport SDK, tier B, seven-day expiry, same attester key, devMode mock first, then one real Austrian passport scan. Supplementary input only: shows over 18, nationality, document validity; never claims residence. Kill Sep 9 evening after two attempts | small to medium | service path, proof result, attempt log |
| Stretch, after G3 | none this week | Uniswap CCA validation hook: IValidationHook.validate(uint256 maxPrice, uint128 amount, address owner, address sender, bytes hookData), revert to reject (FACT, fetched 2026-09-06, https://raw.githubusercontent.com/Uniswap/continuous-clearing-auction/main/src/interfaces/IValidationHook.sol). A third consumer of the same EligibilityDecision for one contract. Named in the README as a second scene, not built this week | small | none |

Lane rules: one bounded task per session, delegate reading inward, return summaries not dumps, no session waits on another for more than a few minutes; hand the wait to the lead. No lane deploys to anything but Sepolia and the CRE simulator. Nothing from the eudi-wallet-hackathon repos is modified in place; the verifier changes go on a branch and the lead reviews the diff.

## The video, six beats plus one, under three minutes

Spoken opening: "Your ID wallet should work where you invest."

1. A labelled investor whose onboarding with a named demo issuer type (demo fund issuer or demo transfer agent) is complete opens the fund app from her own wallet. The address is not yet permitted. Caption: "identity evidence required".
2. QR. The official sandbox wallet presents the registered request: given name, family name, over 18. She taps once. Caption: "names go to the issuer, not to the chain".
3. The issuer's screen matches the presentation to its onboarding record (name match plus age). Remaining checks are visibly labelled "simulated". A separate issuer approval event. Then the address is permitted; the explorer shows predicate bits, tier, expiry and policy id, no name.
3a. Address-control proof: her wallet signs a nonce with the Ethereum key, binding the presentation to the address.
4. She subscribes to the demo fund token with test assets, then swaps in the Uniswap permissioned pool without a second presentation. Spoken: "One permission, two doors."
5. Separately captioned ZK exhibit, ten seconds: verifier-zk, software prover, predicates over 18 and issuing country. Caption: "the official wallet does not produce this proof today".
6. The issuer withdraws approval manually. Fund and pool both refuse. Caption: "manual withdrawal".

Closing card: "Nachweis helps token issuers accept digital ID wallets and carry their approval into the financial apps their customers use, without putting identity documents on chain." Below it: "no document on chain".

Not in the spoken text: yield figures, "second KYC removed", "everyone has this wallet by 2027", "the thing SPRIND is lacking", KYC. Spiko appears in the README only as "an instrument like", never as a partner.

## Today, Sep 6, before sleeping

- Decide whether World Selfie Check is wanted; if yes, send both access requests tonight.
- Confirm cloudflared and the Android sandbox wallet still open and hold a PID (PIDs are single use with a small batch; issue fresh ones).
- Read the four memos' recommendation sections, or the synthesis, and say yes or no to the direction.

## Wave 2 amendments (2026-09-06 evening), superseded

The wave 2 amendments (euro-yield lead scene, GatedSale replaced by a fund subscription contract, L9 zkPassport, L3 caption, L7 behind G2, Arc only with EURC) are folded into the lanes and beats above. What survives: the fund token as the gated instrument, the L3 caption, L7 behind G2, L9 as a supplementary input. What is withdrawn: euro-yield as the spoken lead (grok turn 9: Spiko's conversation is CFO and treasury), the Austrian founder entering the fund on a passport (residence unproven), Arc (Privy is the wallet sponsor; Arc is a post-Sep-16 Circle grant option), and the post-onboarding address-refresh framing (gpt turn 10, claude turn 11: Superstate and Dinari name no ID step for adding a wallet).
