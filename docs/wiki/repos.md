---
type: reference
title: Repositories and paths
updated: 2026-09-07
---

# Repositories and paths

All GitHub repositories are private under devdotbo during the build (FACT, `git remote -v` in nachweis-app shows github-devdotbo:devdotbo/nachweis-app.git, 2026-09-07). nachweis-app is flipped to public for submission (submission-checklist.md).

| Path | Remote | What lives there |
|---|---|---|
| /Users/bioharz/git/ethglobal/nachweis | github devdotbo/nachweis, private | This wiki: schema, index, log, wiki pages, raw copies. No code. |
| /Users/bioharz/git/ethglobal/nachweis-app | github devdotbo/nachweis-app, private | Submission monorepo: contracts (Foundry: AttestationRegistry, FundToken, Subscription, interfaces IEligibility and IProofVerifier, MockProofVerifier, tests in contracts/test/Nachweis.t.sol), service (bridge to the verifier), app (front end), circuits (WP4 output), prover-sp1 (SP1 guest, host script, fixtures, NOTES.md with the measurements), docs, DISCLOSURE.md, README.md. Worktrees: /Users/bioharz/git/ethglobal/nachweis-app-wt-uniswap on branch wp7-uniswap; /Users/bioharz/git/ethglobal/nachweis-app-wt-app on branch wp8-app. |
| /Users/bioharz/git/ethglobal/nachweis-site | github devdotbo/nachweis-site, private | Landing page (index.html, style.css, app.js, fonts, v1, _preview). Served locally on port 8787. Target domain attestat.dev (bought 2026-09-07 with attestat.app and attestat.xyz; DNS pending). Product name is Attestat since 2026-09-07; repository names unchanged. |
| /Users/bioharz/git/ethglobal/nachweis-verifier-relay | none (git worktree of the verifier repo), branch nachweis-relay | WP3 blind relay and address binding in verifier-service. The verifier main branch is never modified during the event. |
| /Users/bioharz/git/nachweis-sp1-spike | local only | Original SP1 feasibility spike (nachweis-pid workspace, NOTES.md). Sources moved into nachweis-app/prover-sp1; the spike directory is the historical record. |
| /Users/bioharz/git/ethglobal/nachweis-refs | not a repo; reference clones with INVENTORY.md | Shallow clones, read-only: eid-privacy-zkp-android (commit 1f1fcedf, MPL 2.0), multipaz (3210f211, Apache), sp1 (cd7850de, Apache and MIT), eudi-lib-android-wallet-core (6533dd10, Apache). Commit ids and dates in /Users/bioharz/git/ethglobal/nachweis-refs/INVENTORY.md. |

## Pre-existing code (disclosed, not modified in place)

| Path | What it is | Note |
|---|---|---|
| /Users/bioharz/git/eudi-wallet-hackathon/verifier | Rust workspace: verifier-core (SD-JWT and mdoc PID verification, trust, DCQL; pid.rs holds the claim model), verifier-service (OpenID4VP relying party, handlers, zk.rs), verifier-zk (Longfellow proof verification, fail-closed), zk-vectors, fixtures (oracle fixtures incl. erica-vp-VALID.sdjwt and the synthetic PID anchor), docs/live-phone-path.md (runbook, no completed live run recorded before the event) | Last commit before the event 2026-08-17 (DISCLOSURE.md). Used as an external dependency; event changes only on branch nachweis-relay. |
| klartext-verifier | Verifier front end, builder's prior work | Path not recorded here; unverified. |
| nachweis-android | Android holder app on wallet-core 0.28.1, SD-JWT only, no mdoc, no ZK | Last commit 2026-07-13. Not a fork of the EU reference app. Not the product. |

## Wiki ancestors (read-only, outside this repo)

- /Users/bioharz/git/ethglobal/new-path/eudi-zk (wiki and teammate memos of the research phase; copies of the relevant files under /Users/bioharz/git/ethglobal/nachweis/raw).
- /Users/bioharz/git/ethglobal/new-path/ai-jury (the three-juror discussion; positions.md and money-question-2026-09-07.md).
- /Users/bioharz/git/ethglobal/ethonline2026 (event wiki: prizes, rules, odds, front-door brief).
