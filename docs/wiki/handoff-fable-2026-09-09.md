---
type: handoff
title: Handoff for the next Fable session, 2026-09-09
updated: 2026-09-09
sources:
  - log.md (entries of 2026-09-08 and 2026-09-09)
  - wiki/work-packages.md (WP16 to WP30)
  - nachweis-app (opus inventory 2026-09-09, read-only, main 5f5ceb9)
  - wiki/track-decision.md, spec-privy.md, submission-checklist.md
---

# Handoff for the next Fable session

Self-contained. Read this, then AGENTS.md, index.md, decisions.md, work-packages.md, and the log entries after 2026-09-09 if any exist.

## What Attestat is

Attestat (repositories still named nachweis) helps token issuers accept EUDI identity evidence and apply their approval to customers' linked crypto wallets, without putting identity documents on chain. The investor scans a QR code with the official German EUDI test wallet (sample identity from the SPRIND sandbox); the wallet's encrypted response passes through the issuer's verifier unopened (blind relay); the investor's browser tab (or the laptop companion) decrypts it and proves in a Noir circuit that a PID signed by the pinned sandbox issuer key, bound to this crypto address, says over 18; the bridge submits the proof to the AttestationRegistry on the chain; the issuer approves as a separate on-chain step; then Subscribe on the fund token and a swap in a Uniswap v4 permissioned pool are open, and one revoke closes both. A second proof route (SP1 Groth16, server side) exists as fallback. The builder is a team of one; agents wrote the code under his instruction. ETHOnline 2026, deadline 2026-09-13 16:00 UTC.

## State as of the last log entry (2026-09-09)

All of WP16 to WP30 are merged on nachweis-app main; head 5f5ceb9 "Evidence: official wallet through the browser path, attested, approved, subscribed on anvil" (FACT, git log 2026-09-09, 23:59 on 2026-09-08). Every branch except wp12-ios is merged into main; all 31 local branches exist on origin. Nothing is deployed to any network.

Evidence table (all FACT from the records named; measured on the builder's M3 Max unless stated):

| What | Number | Record |
|---|---|---|
| Companion proof over the official wallet's real presentation | bb prove 4.41 s, proof 10,304 bytes, 86 public inputs | nachweis-app/docs/evidence/g0-2026-09-08.md |
| Main route on anvil with that proof (scripts/real-proof-local.sh) | PASS; attestWithProof 4,583,028 gas, approve 53,327, subscribe 90,664, revoke 51,260; replay refused | same record; log 2026-09-08 WP24, WP25 |
| Browser proof, official wallet on the iPhone, Chrome hand-clicked | prove 11.1 s (worker: witness 1.2 s, bb init 1.5 s, verify 4.0 s); 42.8 s click to attested; attest 4,582,956 gas; approve, subscribe confirmed, 100 NDF | nachweis-app/docs/evidence/browser-real-wallet-2026-09-08.md |
| Browser proof, Playwright stub wallet | 32.2 s click to attested (lead rerun) | log 2026-09-08 WP29 |
| Android container on the Chromebook (Lenovo IdeaPad Duet 3, ARC, Android 13, 3.2 GB), bundled vector | prove 47.0 to 49.0 s, wall 57.6 to 59.9 s, peak RSS 1.65 to 1.69 GB, three runs, all verify on the desktop; two-device flow attested 4,583,016 gas | work-packages.md WP28 |
| Suites on main (lead's runs 2026-09-08) | forge 97 passed, 10 skipped without RPC; cargo service 12 unit plus 3 anvil; companion 22; nargo 9 | log 2026-09-08 WP23, WP25 |

Logs of the wallet runs hold no claim names (both records). Wallet version string: "not recorded (builder to add)" in both records.

Evidence classes (docs/process.md): L local, W official wallet, D physical device, S Sepolia. WP29 and WP30 are green for W; WP28 for D; nothing is green for S.

## How to run each flow

All scripts are in nachweis-app/scripts/ and build their own binaries. Tool pins first (below). Docs cited path:line from the inventory.

- scripts/g0-up.sh and g0-down.sh: relay verifier plus cloudflared tunnel for a phone run. Env optional: VERIFIER_DIR (default klartext-verifier (branch nachweis-relay, local checkout)), RP_KEY_PATH (default [local secrets path, withheld]), RP_LEAF_PATH, TUNNEL, RESULT_TOKEN (never printed). Doc: docs/g0-runbook.md:131 and :155; template docs/evidence/g0-template.md.
- scripts/real-proof-local.sh: the main route on anvil with a companion session file from a private G0 run (env SESSION; `--keep`). Doc: docs/demo-runbook.md:362, docs/two-device.md:78. Expected: `REAL-PROOF-LOCAL PASS` in about 4 to 15 s with a cached proof.
- scripts/browser-real-wallet-up.sh and -down.sh: the WP30 stack (g0-up, anvil, Deploy, Honk and NoirPidVerifier pinned to PID_ISSUER_KEY_HASH, checker, bridge with a fresh BRIDGE_ISSUER_TOKEN, Vite with COOP and COEP). Doc: docs/browser-real-wallet.md:13 and :168. The builder scans with the iPhone and clicks.
- scripts/two-device-local.sh: browser binds, companion or Android device proves (`--phone`, env ANDROID_SERIAL). Doc: docs/two-device.md:59. Expected `TWO-DEVICE OK`.
- scripts/e2e-local.sh: SP1 route on an anvil fork of Sepolia (`--mode mock|execute|groth16`, needs SEPOLIA_RPC_URL for the fork). Doc: docs/e2e-local.md:3. Expected PASS; mock about 15 s, execute about 21 s.
- scripts/app-e2e-local.sh: Playwright stack (`--mode noir|browser|sp1-mock`, `--test`). Doc: docs/demo-runbook.md:353, docs/spec-browser-prover.md:89.
- Tests per component and expected counts: contracts `forge test` 97 passed, 10 skipped (log 2026-09-08; docs/demo-runbook.md:14 still says 87, stale); service `cargo test` 12 unit plus `cargo test --test anvil` 3; companion `bun test` 22 (companion/README.md:20 says 21, stale); circuits `nargo test` 9 (docs/demo-runbook.md:58 says 4, stale) plus circuits/pid-sdjwt/test-negative.sh; prover-ios `xcodebuild test` 7; app `tsc --noEmit` and the Playwright specs; verifier relay worktree `ZK_ARTIFACTS_OPTIONAL=1 cargo test --workspace` 207 (log 2026-09-08 WP17).

## Private evidence and secrets (never commit; the builder deletes)

- nachweis-app/docs/evidence/private/ is gitignored (docs/evidence/.gitignore). It holds four run directories (20260908-204840, 20260908-205820, 20260908-205938, 20260908-233432-browser) with session.json (the wallet's presentation and proof inputs), logs, env.sh, env.json, and one issuer-token file. Read-only for agents; sanitized records are the two committed files above.
- nachweis-app/.e2e/ is gitignored: test issuer keys (issuer.pk8.pem, issuer.sec1) and certificates.
- Outside the repositories: [local secrets path, withheld] (RP key for the registrar leaf). Never read it into a chat.
- No .env files exist; three .env.example files list the variables (root: SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY placeholder, ETHERSCAN_API_KEY, addresses; app: VITE_* including VITE_DEV_PRIVATE_KEY and VITE_DEV_OPERATOR_KEY which are absent from the example).
- Untracked file at the app repository root: [session transcript, not published] (92 KB transcript, matches no ignore rule, would be committed by `git add -A`). Builder moves it out (item below). The wiki root holds a tracked 380 KB transcript, [session transcript, not published], to be reviewed before the wiki goes public.

## Tool pins (FACT, docs/g0-runbook.md:29 to :37, docs/demo-runbook.md:30 to :36, app/package.json)

nargo 1.0.0-beta.21 at nargo (local install); bb 5.0.0-nightly.20260324 at bb (local install); never run noirup or bbup (a version bump changes the VK and every fixture). bb.js and noir_js pinned to the same versions in app/package.json and spikes/browser-prover/package.json. foundry 1.7.1, solc 0.8.28 cancun; rustc 1.92.0; cargo-prove sp1 with sdk 6.1.0 (`sp1-sdk = "=6.1.0"`); cloudflared 2026.8.2. bun for everything JavaScript, never npm or npx.

## Worktrees and branches (FACT, git worktree list 2026-09-09)

nachweis-app main 5f5ceb9; nachweis-app-wt-app wp30-browser-real-wallet; nachweis-app-wt-circuit wp22-header-window; nachweis-app-wt-service wp28-android-device; nachweis-app-wt-sp1 wp23-kb-exp; nachweis-app-wt-uniswap wp26-browser-prover. All of these are merged into main; the worktrees are free for new packages (check out a new branch from main in each). Only wp12-ios is unmerged (iOS prover, superseded by prover-mobile-core adoption; keep). Verifier: klartext-verifier (branch nachweis-relay, local checkout) on branch nachweis-relay, head 7262a32, 10 commits on base a08d72c, unpushed; the patch series in nachweis-app/vendor/verifier-relay-patches is the public copy. Site: nachweis-site main 3727280.

## Open decisions (builder)

1. Track: Classic with the verifier disclosed as the builder's own public library, or Continuity "Extend Open Source". Facts, risks, OPINION and the notice: wiki/track-decision.md. Recorded as open in decisions.md.
2. Privy: build only if ETHGlobal says the entry is eligible; spec with kill criteria in wiki/spec-privy.md. Note: the Privy question was never sent to ETHGlobal; earlier pages saying "asked 2026-09-01" were wrong and are corrected (log 2026-09-09).
3. Wiki publication: make devdotbo/nachweis public or copy the pages into nachweis-app/docs (spec-driven artifact rule). Review the transcript file first.
4. Repository visibility: nachweis-app is PRIVATE (FACT, gh repo view 2026-09-08); must be public before the Uniswap form and the deadline.

## Builder-only items, exact wording

- Sepolia deployer key: put a funded Sepolia key into a local signer (for example `cast wallet import nachweis-deployer --interactive`, or a `.env` with DEPLOYER_PRIVATE_KEY that stays gitignored) and tell the lead the account name; never paste the key into a chat. Also SEPOLIA_RPC_URL.
- Check-in 2: 2026-09-11 05:59 Vienna. Draft: wiki/checkin-2026-09-11.md (updated 2026-09-09 with the two questions). Confirm afterwards whether check-in 1 of 2026-09-08 was submitted.
- The written notice to ETHGlobal (196 words, paste-ready, bottom of track-decision.md): send it, then tell the lead the date and channel so log.md records it.
- DNS: attestat.dev at Porkbun, steps in nachweis-site/docs/hosting.md (GitHub Pages recommended); .app, .xyz, .tech as 301 forwards.
- Video constraints (FACT, event details page): 2 to 4 minutes, at least 720p, no speedup, no AI voice; our rules: intro at most about 20 s, only green packages, simulated steps captioned, "official test wallet, sample identity". Shot list: nachweis-app/docs/video-shotlist.md.
- Wallet version string: read it from the iPhone's wallet app (settings or about screen) and give it to the lead for both evidence records (docs/evidence/g0-2026-09-08.md and docs/evidence/browser-real-wallet-2026-09-08.md, both say "not recorded (builder to add)").
- Move the exported transcript [session transcript, not published] out of the app repository (agents do not run rm or mv on it).
- Uniswap Developer Feedback Form after the repository is public: wiki/uniswap-feedback-form.md.

## Next agent actions, in order

1. Sepolia deployment and the real flow with receipts, once the key exists: Deploy.s.sol and DeployNoirVerifier.s.sol pinned to the sandbox issuer key hash 0xb4f2bfa1...e079, checker, pool onboarding (contracts/script), then the browser flow against Sepolia with the official wallet (builder clicks), attest, approve, subscribe, swap, revoke, refused swap; record with transaction hashes in docs/evidence; README "Deployment status" line, FEEDBACK.md TODO lines, submission-text.md [deploy] sentences. Also update the stale test counts (docs/demo-runbook.md:14 and :58, companion/README.md:20), DISCLOSURE.md section 2 (10 commits, 3,456 insertions, not 8 and 2,650), and docs/ai-attribution.md's closing sentence ("no official-wallet presentation ... has been recorded" is stale since the two evidence runs).
2. Privy, only if ETHGlobal answers yes: spec-privy.md as one bounded teammate package on Sepolia.
3. Submission package: submission-checklist.md items, submission-text.md with the track field filled from the ETHGlobal answer, README links, repository public, wiki published.
4. Video shot list update: docs/video-shotlist.md with the browser route as beat 3 (WP29 and WP30 numbers), Sepolia hashes on screen, the 40-word ZK line from narrative-zk.md.

## Honesty rules that bind every public sentence

From wiki/product.md: official test wallet, sample identity, never "real state-issued identity"; "no identity documents on chain, and nothing we could use to find her", never "nothing about you on chain"; state where the proof is made (browser tab or laptop companion today, phone provers measured on emulator, simulator and one Android container, wallet-side proof when the EUDI framework selects a ZK scheme, none selected as of ARF v3.0.0); simulated checks captioned simulated, manual revocation captioned manual; no "first", no "only", no yield figures, no "second KYC removed"; KYC appears only in the Uniswap form field kycUrl; sponsors on screen only if integrated (Uniswap; Privy only if green). Evidence classes: nothing with only local evidence is called a wallet run, a device run or a deployment. Numbers carry the machine they were measured on.

## Quota discipline for teammates

One bounded task per teammate with a stated return format, then close; no teammate waits for a build, a human or another agent for more than a few minutes (the wait goes to the lead). Teammates spawn their own subagents on `model: opus` for mechanical steps (file inventories, greps, running a suite and returning counts, applying a specified diff) and keep their own context small (read ranges, grep before read, summaries under 2k tokens). Non-trivial code, debugging, reviews and log triage stay on Fable. Close a teammate as soon as nothing is pending on it; reuse only within a few minutes or under about 150k tokens of context. Browser automation, if any, runs on a Sonnet teammate. Never let a subagent touch Sepolia or any key; deployments run on the lead's thread under the builder's authorization.
