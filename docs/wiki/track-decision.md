---
type: decision
title: Track decision, Classic or Continuity
updated: 2026-09-09
sources:
  - https://ethglobal.com/rules (fetched 2026-09-09 by the lead and again by an opus subagent)
  - https://ethglobal.com/events/ethonline2026/info/details (fetched 2026-09-09, twice)
  - https://ethglobal.com/events/ethonline2026/info/start (fetched 2026-09-09, subagent)
  - https://ethglobal.com/events/ethonline2026/prizes (fetched 2026-09-09)
  - https://ethglobal.com/events/ethonline2026/prizes/privy (fetched 2026-09-09)
  - https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation (fetched 2026-09-09)
  - https://ethdaily.io/ethglobal-introduces-continuity-track (fetched 2026-09-09, secondary)
  - /Users/bioharz/git/ethglobal/nachweis-app/DISCLOSURE.md (read 2026-09-09)
  - /Users/bioharz/git/eudi-wallet-hackathon/verifier (git, read-only, 2026-09-09)
---

# Track decision: Classic or Continuity

Status: open. The builder decides after ETHGlobal answers the written notice at the end of this page. This page holds the facts, the two options with their risks under the quoted rules, one OPINION, and the paste-ready notice.

Correction recorded 2026-09-09: earlier wiki pages said the Privy eligibility question was "asked 2026-09-01". The builder states it was never sent. Every page that said so is corrected today (decisions.md, sponsors.md, open-questions.md, checkin-2026-09-11.md; checkin-2026-09-08.md is left as the historical draft with a note). The event wiki outside this repository, /Users/bioharz/git/ethglobal/ethonline2026/wiki/continuity-track.md, still says "asked in writing 2026-09-01" and is not edited from here.

## The builder's framing (FACT, builder message relayed by the lead, 2026-09-09)

Attestat is a new project. The earlier project, the EUDI verifier from the builder's prior hackathon work (GitHub Klartext-ID/klartext-verifier, Apache-2.0), is what a Continuity entry would be continuing. Attestat consumes that verifier; it does not continue it as a product.

## Rules as fetched 2026-09-09 (FACT, verbatim)

From https://ethglobal.com/rules:

- Classic: "If you're participating in the Classic 'From Scratch' track, you must begin your project when hacking officially begins at event kick-off." "Pre-existing project-specific code, designs, or assets are not allowed for Classic track submissions."
- Continuity: "If you've selected a Continuity track (for example, 'Extend Open Source' or 'Ship a Feature'), you may build on an existing codebase according to the rules of that track." "Continuity-track submissions must clearly document what work existed before the hackathon and must include substantive new features, improvements, or functionality developed during the event." "All new parts of extending an existing project must remain open source."
- Disclosure: "In all cases, you must disclose any pre-existing work in writing to the ETHGlobal team and include full details in your submission (repo history, video, and description)."
- Consequence: "If you are not participating on an approved Continuity track, using pre-existing project-specific work will make your submission ineligible for Partner prizes and the Finalist category. For Continuity-track submissions, eligibility for specific partner prizes may vary" (the fetch of 2026-09-01 in /Users/bioharz/git/ethglobal/ethonline2026/raw/ethglobal-rules-2026-09-01.md adds "check the event and partner rules" and the sentence "Historically, projects that use a majority of pre-existing work do not score as high in the judging as projects which present wholly new and novel approaches").
- Version control: "you must also use version control for your code throughout the course of the event."

From https://ethglobal.com/events/ethonline2026/info/details:

- "If you're entering the Classic 'From Scratch' track, all work on your project must begin after the hackathon officially starts."
- "Any prior project-specific code, designs, or assets are not allowed unless they're from public libraries or starter kits" (lead's fetch 2026-09-09).
- "You're welcome to use open-source libraries and starter kits to kickstart your project, but be transparent."
- "Projects built before the event may still participate but won't qualify for partner prizes or the Finalist category."
- "If you've selected a Continuity track, you may build on an existing codebase according to that track's rules." "Continuity submissions must clearly document pre-existing work and include new features or functionality developed during the hackathon." The page names the options "Extend Open Source / Ship a Feature".
- Finalist category: "Typically, only the top 20% of projects advance to the live judging session."

From https://ethglobal.com/events/ethonline2026/info/start: "your project must be started and developed during the hackathon. You may use public libraries or boilerplate, but pre-existing project-specific code, designs, or assets are not allowed."

Sub-track definitions beyond the names: no ETHGlobal page defines "Extend Open Source" or "Ship a Feature" in more words than quoted above (subagent search 2026-09-09). CLAIM, ETH Daily 2026-05-18 (https://ethdaily.io/ethglobal-introduces-continuity-track): teams can "extend an open-source repo they already maintain or ship a new feature to a private product, releasing whatever they build over the weekend as open source". The event wiki's reading of 2026-08-31 (/Users/bioharz/git/ethglobal/ethonline2026/wiki/continuity-track.md): Extend Open Source, "bring a repo you already maintain, ship a feature during the event"; Ship a Feature, "build one new feature on an existing private/commercial product and release that feature as open source".

Prize pools (FACT, https://ethglobal.com/events/ethonline2026/prizes, fetched 2026-09-09): 80,000 USD across 11 sponsors; no separate ETHGlobal Finalist pool with an amount is listed on the page (unverified whether one exists elsewhere). Continuity-only pools carry the marker "This prize is only available to Continuity Track participants". Relevant to us: Uniswap Foundation 5,000 USD (Stack Contribution 3,000 open, up to three teams at 1,000; Stack Contribution 2,000 Continuity-only, 1,000 and 1,000). Privy 5,000 USD (Best B2B Financial Product 2,500; Best Financial Flow 2,500; both open, no Continuity pool). The full Continuity-only list (20,166 USD of the 80,000) is in /Users/bioharz/git/ethglobal/ethonline2026/wiki/continuity-track.md (fetch of 2026-09-06).

## What is new event code and what is pre-existing (FACT)

Pre-existing, the verifier (read-only git inspection of /Users/bioharz/git/eudi-wallet-hackathon/verifier on 2026-09-09):

- Repository Klartext-ID/klartext-verifier, PUBLIC on GitHub, Apache-2.0, created 2026-06-04, last push before the event 2026-08-20 (gh repo view 2026-09-09). Rust workspace: verifier-core, verifier-service, verifier-zk, zk-vectors, fixtures; about 18,400 lines of Rust across all crates and tests (wc -l over *.rs excluding target, rough).
- The event work sits on branch nachweis-relay, base commit a08d72c of 2026-08-17. That base is not on main (origin/main a4ed59c, 2026-08-17) but is pushed as branch origin/nullwissen-zk (21 commits from 2026-07-30 to 2026-08-17, verifier-zk and zk-vectors work). So the whole pre-existing base is public on GitHub, on two branches.
- Event changes to the verifier: 10 commits, 13 files, 3,456 insertions, 32 deletions on a08d72c..nachweis-relay (head 7262a32, 2026-09-08): blind relay endpoints, bridge-mode request and minimized result endpoints, tokens, limits. The branch is unpushed; the same changes are exported as a patch series in nachweis-app/vendor/verifier-relay-patches (log 2026-09-08). How nachweis-app references the verifier: see DISCLOSURE.md (inventory below).

New during the event, all in /Users/bioharz/git/ethglobal/nachweis-app (repository created 2026-09-07, continuous small commits; head 5f5ceb9 of 2026-09-08 23:59):

- contracts (Foundry): registry with two proof adapters, fund token, subscription, Uniswap v4 allowlist checker, onboarding scripts, 97 tests.
- circuits: the Noir SD-JWT circuit adapted from eid-privacy (MPL-2.0 origin, disclosed as adapted third-party code), header window, fixtures, generator.
- prover-sp1: SP1 guest and host, fixtures.
- service (bridge): sessions, EIP-191 wallet session signature, prover in the loop, chain writes.
- app: Vite and React investor and issuer screens, browser proving in a worker (noir_js plus bb.js), phone handoff, bridge mode.
- companion: the laptop prover CLI; prover-mobile-core, prover-android, prover-ios: the phone provers (emulator, simulator and one Android container measured).
- scripts and docs: the local flows, runbooks, evidence records.

Sizes: see the inventory table below (subagent line count of 2026-09-09; the command is quoted so it can be rerun).

Inventory (FACT, opus subagent 2026-09-09 on nachweis-app main 5f5ceb9, command per directory: `find <dir> -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.sol' -o -name '*.nr' -o -name '*.rs' -o -name '*.sh' -o -name '*.kt' -o -name '*.swift' -o -name '*.py' \) -not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/.git/*' | xargs wc -l | tail -1`; json and toml excluded; contracts counted without lib/, out/ and cache/):

| Directory | Lines | Note |
|---|---|---|
| contracts (own code) | 6,438 | includes the bb-generated PidSdJwtUltraHonkVerifier.sol; vendored forge-std and OpenZeppelin excluded |
| app | 3,727 | 42 files |
| service (bridge) | 2,985 | Rust |
| prover-ios | 2,098 | |
| companion | 1,831 | |
| scripts | 1,813 | |
| prover-android | 1,305 | |
| prover-mobile-core | 1,289 | |
| prover-sp1 | 946 | |
| shared | 914 | |
| circuits | 842 | Noir plus tooling; main.nr adapted from eid-privacy |
| spikes | 344 | |
| Total event code in nachweis-app | about 24,500 | rough sum of the rows |
| Verifier, pre-existing | about 18,400 | Rust, all crates and tests, base a08d72c |
| Verifier, event branch | 3,456 inserted, 32 deleted | 10 commits, 13 files, a08d72c..7262a32; DISCLOSURE.md section 2 still says 8 commits and 2,650 insertions from before the two WP17 commits, to be updated |

How nachweis-app uses the verifier (FACT, inventory): over HTTP at runtime (service/src/main.rs:39 verifier mode; app VITE_VERIFIER_URL), by filesystem path in the scripts (VERIFIER_DIR default /Users/bioharz/git/ethglobal/nachweis-verifier-relay, scripts/g0-up.sh:35), and as the committed patch series vendor/verifier-relay-patches (10 patches, 4,768 lines, README names upstream Klartext-ID/klartext-verifier, base a08d72c, head 7262a32). service/Cargo.toml declares no verifier crate; no submodule, no vendored verifier source. Commit counts per component are in DISCLOSURE.md section 4 (145 commits on main up to 0fd7312 on 2026-09-08).

Adapted third-party code inside nachweis-app (disclosed in DISCLOSURE.md as its own class): the eid-privacy Noir circuit and zkp-android packaging. This class exists in both track options and does not change the question; it is public open-source code from others, allowed under the "public libraries" wording if disclosed.

## Option A: Classic, verifier disclosed as the builder's own public open-source library

Reading: Attestat began on 2026-09-07; nachweis-app holds no pre-event code. The verifier is a public, Apache-2.0, general-purpose EUDI verifier that anyone could have consumed, so it falls under "public libraries or starter kits" and "open-source libraries ... but be transparent". The blind-relay branch is new event work on that library and is exported into the submission repository as patches.

What Classic buys: eligibility for the Finalist category and every open partner track (Privy's two 2,500 USD tracks, Uniswap's 3,000 USD open pool) without the "may vary" clause.

Risk under the quoted rules:

- "Pre-existing project-specific code" is not defined. A reviewer can read a verifier for exactly the credential that Attestat verifies, written by the same person, modified during the event for this project, as project-specific. The rule's consequence for that reading is severe: "ineligible for Partner prizes and the Finalist category", and the disclosure clause adds disqualification and a ban only for undisclosed or misrepresented work, which does not apply if the notice is sent.
- The verifier is the identity half of the pipeline. Judges may weigh the "majority of pre-existing work" sentence even though, by line count, the event code is larger than the verifier (inventory table).
- The relay branch is on the builder's private disk, not on the public repository; only the patch export is public once nachweis-app is public. A reviewer checking "repo history" sees the base on GitHub and the patches in the submission repository, which satisfies the letter but needs the README to explain it.

Mitigation if chosen: the written notice below, the DISCLOSURE.md classes, README sentence "uses the builder's public verifier as a dependency; event changes to it are the vendored patch series", and the verifier repository linked in the submission.

## Option B: Continuity, "Extend Open Source", verifier as the extended codebase

Reading: the builder maintains a public open-source repository (the verifier) and shipped a feature on it during the event (blind relay and bridge mode, 3,456 lines), plus a new application around it. Continuity rules are met by construction: pre-existing work documented (DISCLOSURE.md, git history on GitHub), substantive new functionality, new parts open source (Apache-2.0).

What Continuity buys: no interpretation risk on "project-specific". Uniswap's Continuity pool (2,000 USD, two places) is named on Uniswap's page, so that eligibility is on the page.

Risk under the quoted rules:

- Partner prizes: "eligibility for specific partner prizes may vary". Privy has no Continuity pool; whether a Continuity entry may compete for Privy's open tracks is exactly the unasked question. Uniswap's open 3,000 USD pool: same uncertainty (the platform tags the open pool building-from-scratch, event wiki 2026-09-01).
- Finalist category: the rules say pre-existing work outside an approved Continuity track disqualifies from Finalist, which implies Continuity entries stay eligible; no sentence says so directly (unverified). The event wiki records "only work done during the hackathon is judged".
- Framing cost: the submission text must present Attestat as the continuation of the verifier, which the builder says it is not. The honest sentence is "Attestat is a new application; the Continuity base is the verifier it extends", which fits "Extend Open Source" but reads less clean than "From Scratch".

## OPINION (this agent, 2026-09-09)

Send the notice today and let ETHGlobal answer; the rules require the written disclosure in all cases, so the notice costs nothing and settles the track. If no answer arrives before the submission form, enter Continuity "Extend Open Source": the downside of a wrong Classic entry is loss of Finalist and partner eligibility on a reviewer's reading of "project-specific", while the downside of Continuity is a smaller Uniswap pool and an uncertain Privy entry. Ask both questions in one message so that a Classic answer also settles Privy. Do not build Privy until the answer says the entry is eligible (spec-privy.md).

## Written notice to ETHGlobal (paste-ready, builder sends; 196 words)

Subject: Pre-existing work disclosure and track question, ETHOnline 2026, project Attestat

Hello ETHGlobal team,

I am a team of one submitting Attestat (GitHub devdotbo/nachweis-app) to ETHOnline 2026. As the rules require, I disclose pre-existing work in writing.

Pre-existing: my EUDI wallet verifier, Klartext-ID/klartext-verifier on GitHub, public, Apache-2.0, built for an earlier hackathon, last pre-event commit 2026-08-17. Attestat uses it as a dependency. During the event I added a blind-relay feature to it on a branch (10 commits, about 3,500 lines), exported as a patch series inside the submission repository.

New during the event: everything in nachweis-app, created 2026-09-07 with continuous commit history: smart contracts, the adapted zero-knowledge circuit, the SP1 prover, the bridge service, the web app, the laptop companion and the phone provers. DISCLOSURE.md in the repository lists every class of code with versions and licenses.

Two questions:

1. Which track do you consider correct for this entry: Classic, with the verifier disclosed as my own public open-source library, or Continuity "Extend Open Source", with the verifier as the extended codebase?

2. In either case, is the entry eligible for Privy's two open tracks and for Uniswap's open Stack Contribution track?

Thank you,
[builder's name]

Where to send: the channel ETHGlobal names for written disclosure is unverified (the rules say "in writing to the ETHGlobal team"); the check-in form's free text and the event Discord are the two channels the wiki knows. Record the date and channel in log.md when sent.
