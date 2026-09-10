---
type: handoff
title: Handoff for the builder's morning and the next Fable session, 2026-09-10
updated: 2026-09-10
sources:
  - log.md (entries of 2026-09-09 from "Builder (night)" onward)
  - wiki/decisions.md (section "2026-09-09 night")
  - wiki/work-packages.md (WP31 to WP39)
  - wiki/privy-cases/README.md and evaluation.md (sections 1, 7, 11a)
  - wiki/showcase-brief.md, pitch-toolkit.md, zkpassport.md, identity-standards.md
  - nachweis-app (opus inventory 2026-09-09 night, read-only, main 56424b4: README.md, docs/privy-standing-order.md, docs/showcase/*.md, docs/swap.md, docs/zkpassport.md, docs/ui/README.md, scripts/*.sh, the .env.example files, docs/evidence, DISCLOSURE.md, docs/ai-attribution.md)
  - wiki/handoff-fable-2026-09-09.md (structure, honesty rules and quota section carried over)
---

# Handoff for the builder's morning and the next Fable session

Self-contained. Read this, then AGENTS.md, index.md, decisions.md, work-packages.md, and the log entries after the last entry of 2026-09-09 if any exist. The previous handoff, wiki/handoff-fable-2026-09-09.md, still holds for the evidence table of the wallet runs, the tool pins and the private evidence directories; this page repeats what changed and what the morning needs.

## What Attestat is now

The product sentence is unchanged (product.md): Attestat helps token issuers accept EUDI identity evidence and apply their approval to customers' linked crypto wallets, without putting identity documents on chain. The investor scans a QR code with the official German EUDI test wallet (sample identity from the SPRIND sandbox); the wallet's encrypted response passes through the issuer's verifier unopened (blind relay); the investor's browser tab (or the laptop companion) decrypts it and proves in a Noir circuit that a PID signed by the pinned sandbox issuer key, bound to this crypto address, says over 18; the bridge submits the proof to the AttestationRegistry; the issuer approves as a separate on-chain step; then Subscribe on the fund token and a swap in a Uniswap v4 permissioned pool are open, and one revoke closes both.

New since 2026-09-09 night (FACT, decisions.md section "2026-09-09 night"): Attestat is pitched as the toolkit plus a showcase. The toolkit plugs into the EUDI wallet (optionally zkPassport, and other national identity systems where compatible), proves the statement in zero knowledge, writes one eligibility decision on chain, and lets any consumer read it: a fund token, a Uniswap permissioned pool, a payout contract, a Privy policy. The showcase is the EUDI investor flow, the Uniswap pool, and five Privy business cases (standing order, back office, payout desk, investor money, savings plan), each with a demo route in the product app and a landing page that is also its pitch, indexed by a gallery. Every showcase page states: these are demos built on the toolkit, none is a live product, no named company uses one (pitch-toolkit.md, verbatim lines). Attestat is a new project, Classic track (FACT, builder message 2026-09-09 night); the Privy open tracks are in scope. The builder is a team of one; agents wrote the code under his instruction. ETHOnline 2026, deadline 2026-09-13 16:00 UTC.

## State of every repository (FACT, git, 2026-09-09 night)

- nachweis-app: nachweis-app, main 56424b4 "Merge wp38-investor-money: fund desk demo for an email investor". `git branch --no-merged main` lists wp12-ios alone (125 ahead, 284 behind; iOS prover, superseded, keep). Every worktree branch is 0 commits ahead of main. 41 local branches. `git status --porcelain` shows exactly one line: the untracked transcript 2026-09-08-205144-i-told-gpt-6-astra.txt (92,837 bytes, no ignore rule matches it). Repository visibility PRIVATE (FACT, gh repo view 2026-09-08; not re-checked tonight). Nothing is deployed to any network; README.md:35 still says so.
- nachweis-site: nachweis-site, main b5b273d "Gallery: Swiss e-ID and other national systems from the identity-standards research", working tree clean. Holds the reframed main page, showcase/index.html (gallery), showcase/links.js, and the five case pages under showcase/.
- wiki: the wiki repository, main 17ec382 "log: all demos merged", clean at the start of this turn. The tracked 380 KB transcript at the wiki root (2026-09-08-192458-we-did-a-lot-and-we-pivoted-many-times-check-sp.txt) is still there; review before publication.
- verifier: klartext-verifier (branch nachweis-relay, local checkout) on branch nachweis-relay, head 7262a32, unchanged tonight; public copy as the patch series in nachweis-app/vendor/verifier-relay-patches; the upstream repository Klartext-ID/klartext-verifier is public, Apache-2.0 (track-decision.md).

Worktrees (FACT, `git worktree list` 2026-09-09 night):

| Path | Branch | Head | Note |
|---|---|---|---|
| nachweis-app | main | 56424b4 | |
| nachweis-app | wp40-showcase-shots | 56424b4 | branch at main, no WP40 row in work-packages.md and no log entry (see contradictions below) |
| nachweis-app | wp38-backoffice | b6d0718 | merged |
| nachweis-app | wp38-savings-plan | ea0333a | merged; worktree created tonight |
| nachweis-app | wp33-zkpassport | 7dcfd95 | merged |
| nachweis-app | wp38-payout-desk | ea4f930 | merged |
| nachweis-app | wp35-swap-ui | 9ef1d79 | merged; worktree created tonight |
| nachweis-app | wp32-privy-standing-order | 6f187f6 | merged |

All seven worktrees are free for new packages (check out a new branch from main in each).

## Merged tonight, one line each (FACT, log.md 2026-09-09 and work-packages.md WP31 to WP39)

Evidence classes per docs/process.md: L local (anvil or an anvil fork), W official wallet, D physical device, S Sepolia. Nothing tonight is green for W, D or S.

- WP31 product UI, merged dfa6bb0: investor portal (journey rail, connect options, present, prove picker, eligibility with proof-location captions, two doors, holdings, history, what-the-chain-sees) and issuer console (counts, queue, decisions table, receipts, registry events, revoke by address); 16 screenshots in docs/ui. Class L (Playwright sp1-mock, noir, browser green; browser click to attested 32.0 s on the M3 Max).
- WP33 zkPassport route, merged 3828d23 behind VITE_ZKPASSPORT (off by default): ZkPassportVerifier adapter plus EvidenceRouter on IProofVerifier, mock root on anvil; ZKPASSPORT-LOCAL PASS, attest 176,956 gas with the mock root. Class L. Phone run and bound fixture are builder steps. Removal is one revert commit.
- WP32 Privy standing order, merged d6e41a5 plus a follow-up commit: automation/ (policy builder, local evaluator, watcher, tick, HTTP server, 13 tests), lazily loaded Privy provider tree behind VITE_PRIVY_APP_ID, "Sign in with email, wallet by Privy" connect option, StandingOrderCard, issuer AutomationLog, docs/privy-standing-order.md. STANDING-ORDER-LOCAL PASS in 17 s. Class L, plus a live policy API check (create 200, createRule 200, get, deleteRule, delete; nothing left on the app). The Sepolia tick is not done.
- WP34 Privy dashboard facts: read through the builder's Chrome session by a Sonnet teammate; app "Attestat" created; facts in evaluation.md section 11a. FACT for the dashboard state on 2026-09-09.
- WP35 swap door, merged a4766c2: scripts/pool-local.sh (anvil fork of Sepolia, pool, liquidity, probe swap 100 mUSD to 90.65 NDF, revoke, refused swap) POOL-LOCAL PASS in 24 s; in-app Swap door with pool state, quote, the isEligible question, swap through Permit2 and the UniversalRouter (gas 217,841), refusal decoded as Unauthorized from PermissionedHooks.beforeSwap; four screenshots in docs/ui. Class L (fork). No Sepolia broadcast, no sell direction, no hand-driven MetaMask run.
- WP36 five landing pages and WP39 gallery, nachweis-site a4dda6f and b5b273d: showcase/index.html with system map, eight demo cards with evidence badges, use-case table, honesty strip; five case pages; main page toolkit paragraph, Showcase link and teaser; links.js with DEFAULT_ORIGIN http://localhost:5173 and a "runs locally" note on every demo link. Verified headless at 1440 and 390 px. Badges and screenshots are hand-written as of 2026-09-09 and need a final pass.
- WP37 identity standards, wiki/identity-standards.md: 17 systems, every fact fetched 2026-09-09. Supported now: EUDI, Switzerland swiyu (one adapter change), zkPassport. Supportable: Taiwan DIW, UK GOV.UK Wallet, US and Google Wallet mDLs. Not compatible today: Ukraine, Singapore, Australia AGDIS, Japan, Korea, UAE, Brazil, India, Estonia, Canada. Not built; sentences from its "Sentences we may use" section are quoted on the gallery.
- WP38 backoffice demo, merged 2e351f6: desk service showcase/backoffice (35 tests), app /showcase gallery route and registry, BackofficeDesk panel, docs/showcase/backoffice.md; SHOWCASE-BACKOFFICE-LOCAL PASS in about 8 s. Class L, plus live Privy objects (below); on Sepolia the approve passed the policy and failed on gas (unfunded wallet).
- WP38 savings-plan demo, merged 282ef72: DeploySecondIssuer.s.sol (FundToken B and Subscription B on the same registry and policy), automation run history and plan timer (16 tests), SavingsPlanBoard with four doors; SHOWCASE-SAVINGS-PLAN-LOCAL PASS in about 15 s. Class L. Honesty note: FundToken gates the recipient, not the sender.
- WP38 payout-desk demo, merged e2d3070: GatedPayout.sol (14 forge tests), showcase/payout-desk service (18 tests, PAYOUT_SIGNER=privy|local, four-eyes run store), /showcase/payout-desk screen; SHOWCASE-PAYOUT-DESK-LOCAL PASS in 3 s. Class L, plus live Privy signing checks (below).
- WP38 investor-money demo, merged 56424b4: FundDesk.sol as the FundToken issuer (subscribe in mUSD, distribute, claim, redeem; 19 forge tests), /showcase/investor-money page with simulation before every write, DeskPanel in the issuer console behind VITE_DESK; SHOWCASE-INVESTOR-MONEY-LOCAL PASS in 4 s, Playwright spec green in 28 s. Class L. Forge suite at this point: 138 passed, 20 skipped without RPC.

app/src/showcase/registry.ts lists investor-money, backoffice, savings-plan, payout-desk; the standing order lives in the investor portal. Full verification of main (every suite and every script in sequence) has not been run after the last merge; see the section for the lead below.

## Privy facts (FACT unless marked; evaluation.md 11a, docs/privy-standing-order.md:103, docs/showcase/backoffice.md:71 to :77, docs/showcase/payout-desk.md:75 to :77, log 2026-09-09)

- Organisation ZKTREX, one member, plan Free, no payment method. A second app "openintents" on the same account belongs to another project of the builder; do not touch it.
- App "Attestat": app id [id withheld] (public, in the three .env.example files), development mode, Email login on, embedded wallet auto-create on login (EVM), allowed origins http://localhost:5173 and http://localhost:4173. "Wallet environment: TEE enabled" verbatim on the Wallets, Advanced, More tab.
- Creatable through the dashboard and the API on the Free plan, no sales contact: policies, authorization keys, m-of-n key quorums (2-of-2 created twice tonight), server wallets owned by a quorum. Not present: an Intents page, a Manual approvals page. Gas sponsorship needs purchased credits, so every Privy wallet needs Sepolia ETH of its own.
- Ids created per demo:

| Demo | Object | Id |
|---|---|---|
| standing order (WP32) | authorization key "attestat-automation", key quorum 1 of 1 | [id withheld] |
| standing order (WP32) | throwaway policy for the live API check | created and deleted, nothing left |
| backoffice (WP38) | key quorum "attestat-backoffice-desk", 2 of 2 | [id withheld] |
| backoffice (WP38) | policy "attestat-backoffice-registry-operator", owned by the quorum | [id withheld] |
| backoffice (WP38) | server wallet "attestat-backoffice-operator" | [id withheld] at 0xa7d474A830F9FCe684a68a51f356f1cA0e9bf625 |
| payout desk (WP38) | key quorum "attestat-payout-officers", 2 of 2 | [id withheld] |
| payout desk (WP38) | policy "attestat-payout-treasury" (default deny, payout to the gate with total at most 1000 mUSD on Sepolia, approve for the gate) | [id withheld] |
| payout desk (WP38) | server wallet "attestat-payout-treasury" | [id withheld] at 0x1f6B95db18DEe1F6025f28912b6026c6Ab366AbE |

- The backoffice policy's `to` is still the first anvil address 0x5FbDB2315678afecb367f032d93F642f64180aa3 (docs/showcase/backoffice.md:79); `bun run scripts/bootstrap-privy.ts --set-registry <registry>` moves it to the Sepolia registry after the deployment. The payout policy is bound to a gate address that does not exist yet on Sepolia; `bun run src/setup.ts update-rules` rewrites it after DeployPayout.
- Live checks recorded (docs/showcase/backoffice.md:83 to :88, payout-desk.md:85 to :92): one-key signing refused 401 (threshold), both keys accepted, personal_sign and out-of-policy calls refused 400 policy_violation, over-cap payout refused; the backoffice 1 wei transfer was stopped by Privy's funds pre-check before the policy (INCONCLUSIVE until funded).
- Secrets live in exactly two files, mode 600, never in a repository or a chat: [local secrets path, withheld] (app secret, attestat-automation private key) and [local secrets path, withheld] (officer B key of the payout quorum). No real .env file exists anywhere in nachweis-app (find, 2026-09-09 night); the templates are app/.env.example, automation/.env.example, showcase/backoffice/.env.example, showcase/payout-desk/.env.example (plus the root and prover-sp1 templates).
- Security notes for the builder: [security note withheld].
- Unverified until the first Sepolia run: the refusal wording and function_name matching at evaluation time on a real tick; @privy-io/wagmi 4.0.17 with the embedded wallet on Sepolia; whether Privy's modal shows the decoded call; the wording of a Privy refusal when the embedded wallet holds no ETH.
- Compatibility finding (log 2026-09-09 WP32): @privy-io/wagmi replaces wagmi's connector list, so with VITE_PRIVY_APP_ID set the dev signer and the plain injected connector are gone and the operator connects through Privy's wallet picker. Pins: @privy-io/react-auth 3.40.0, @privy-io/wagmi 4.0.17 (peer viem exactly 2.56.0, app resolves 2.56.3), @privy-io/node 0.34.0.

## What the builder said tonight and what happened (FACT, chat of 2026-09-09 night, in order)

1. "The GUI looks very like a demo, not a full product; create a full working demonstration in its own worktree." Done: WP31 product UI, merged (dfa6bb0). Screenshots in nachweis-app docs/ui.
2. "We got the ok, we are not really a Continuity project but a new project." Recorded as the Classic decision (decisions.md 2026-09-09 night; README line changed 6c4a66a). Open: who gave the ok and on which channel.
3. "Deeply brainstorm what we can add with Privy: a business case that would otherwise not be possible; spin up multiple Fable teammates, each in its own directory with one unique case; evaluate with another Fable teammate; execute the best; keep the others as documentation." Done: five cases in wiki/privy-cases/ (backoffice 29, investor-money 27, other-buyer 23, agents 34, lifecycle 29), evaluation.md by one Fable evaluator (a single judge, not the multi-model AI jury of the earlier rounds; the builder asked about that and was told so), the winner built as WP32.
4. "A teammate can use the Playwright extension on the Privy dashboard where I am logged in; check first before writing to Privy." Done: plan Free, TEE enabled, policy and key forms open; app "Attestat" and an authorization key created; the app secret had to be regenerated (the dashboard never reveals it). Nothing needed to be written to Privy.
5. "For non-EU users, one teammate should research and build zkPassport as a fallback route; I decide tomorrow if it is worth it; close idle teammates, they take my iTerm2 space." Done: WP33 behind VITE_ZKPASSPORT, wiki/zkpassport.md; every teammate was closed as soon as it was idle from then on.
6. "Build all of the cases so I can see them tomorrow; for each one an initial landing page that is also a pitch, by its own Fable teammate loading the design skill, as impressive as the current landing page or better; a gallery with all functions, demos and use cases; the Uniswap demo needs a massive UI improvement; the main product is the toolkit that plugs into EUDI (optional zkPassport) and other systems with ZK; check other countries' identity standards (Swiss and others) for compatibility and document it; keep the main context clean." Done: five landing pages, gallery, main page reframe (nachweis-site 693821e), WP35 swap door, four showcase demos (WP38), wiki/identity-standards.md (WP37), real screenshots (WP40), full verification of main. The lead's context stayed at plans and summaries; every file read and every suite ran in teammates.
7. "Did you pick one of those ideas already, like the AI jury?" Answered: yes, the standing-order case by a single Fable evaluator; a Codex or Grok second opinion on the pick is available on request and was not run.

## How to review this in the morning (OPINION, lead)

- The pitch: open the site from a static server, read the main page hero, then /showcase/ (gallery), then each case page. Wording sources: wiki/pitch-toolkit.md, wiki/privy-cases/<slug>/case.md.
- The demos: `scripts/showcase-<slug>-local.sh --keep` or `--app` in nachweis-app, then the /showcase/<slug> route; `scripts/standing-order-local.sh` and the /issuer automation section; `scripts/pool-local.sh` then `scripts/app-e2e-local.sh --mode sp1-mock --pool --test` for the swap door; `scripts/zkpassport-local.sh` for the mock passport route. Every expected PASS line is in the run table above.
- The judgment calls to confirm or overrule: the Classic track; the standing-order case as the primary Privy entry (B2B track) with the other four as showcase; zkPassport keep or remove; the toolkit framing on the main page; which demos go into the 2 to 4 minute video (only green packages, honesty rules).
- The evaluation of the five cases: wiki/privy-cases/evaluation.md, sections 2 (scores), 4 (verdicts), 11a (dashboard facts that settled the gates).

## How to run every flow and every showcase script (FACT, scripts/*.sh heads and docs, 2026-09-09 night)

All scripts are in nachweis-app/scripts/ and build their own binaries. Tool pins as in the 2026-09-09 handoff (nargo 1.0.0-beta.21, bb 5.0.0-nightly.20260324, never noirup or bbup; foundry 1.7.1; rustc 1.92.0; sp1-sdk 6.1.0; bun, never npm or npx). Ports are the script defaults; every showcase script has its own anvil port so two demos can run at once (an incident tonight killed a shared anvil, log 2026-09-09).

| Script | What | Ports (default) | Expected last line |
|---|---|---|---|
| real-proof-local.sh | main route on anvil with a companion session file (env SESSION, `--keep`) | anvil 8545, bridge 8788 | `REAL-PROOF-LOCAL PASS (<n> s: attestWithProof gas ..., approve gas ..., subscribe gas ...)` |
| browser-real-wallet-up.sh / -down.sh | WP30 stack for the phone run (g0-up, anvil, Deploy, Honk verifier pinned to PID_ISSUER_KEY_HASH, checker, bridge, Vite with COOP and COEP); the builder scans and clicks | free ports | no PASS line; the evidence record is docs/evidence/browser-real-wallet-<date>.md |
| g0-up.sh / g0-down.sh | relay verifier plus tunnel for a phone run (env VERIFIER_DIR, RP_KEY_PATH, TUNNEL, RESULT_TOKEN never printed) | PORT 8090 | health gate only |
| two-device-local.sh | browser binds, companion or Android device proves (`--phone`, ANDROID_SERIAL) | anvil 8545, verifier 8091, bridge 8788 | `TWO-DEVICE (companion) OK` or `TWO-DEVICE (emulator) OK` |
| e2e-local.sh | SP1 route on an anvil fork of Sepolia (`--mode mock|execute|groth16`, SEPOLIA_RPC_URL) | free ports | `PASS (<mode>): timeline ...`; mock about 15 s, execute about 21 s |
| app-e2e-local.sh | Playwright stack (`--mode noir|browser|sp1-mock`, `--test`, `--pool`) | free ports | `BROWSER E2E (<mode>) OK`; sp1-mock about 18 s, browser about 43 s, with `--pool` 43 s |
| pool-local.sh | Uniswap v4 permissioned pool on an anvil fork of Sepolia (`--keep`, `--fork-url`), needs SEPOLIA_RPC_URL (default publicnode) | fork of block 11664502 | `POOL-LOCAL PASS` in about 24 s, after "swapped 100000000 mUSD raw units for 90652862473832711386 NDF wei" and "revoked probe: swap refused (Unauthorized inside PermissionedHooks.beforeSwap ...)" |
| standing-order-local.sh | WP32 automation in local mode (`--keep`) | free ports; automation PORT 8790 in the template | `STANDING-ORDER-LOCAL PASS` in about 17 s, at least three `TICK OK` lines |
| zkpassport-local.sh | zkPassport route with MockZkPassportRoot (`--keep`) | anvil 8547 | `ZKPASSPORT-LOCAL PASS (mock root verifier, evidence class L): attest <gas> gas, approve, subscribe, revoke, replay refused, both routes on one policy` |
| showcase-backoffice-local.sh | compliance desk, desk in local mode (env only; `--keep` starts the app) | anvil 8548, desk 8794, app 5179 | `SHOWCASE-BACKOFFICE-LOCAL PASS` in about 8 s |
| showcase-investor-money-local.sh | fund desk flow (`--keep`, `--app`, `--test`) | anvil 8552 (ANVIL_PORT) | `SHOWCASE-INVESTOR-MONEY-LOCAL PASS` in about 4 s; `--test` adds `BROWSER SHOWCASE (investor-money) OK` in about 28 s |
| showcase-payout-desk-local.sh | contractor payout desk (`--keep` leaves anvil and desk running) | anvil 8550, desk 8792 | `SHOWCASE-PAYOUT-DESK-LOCAL PASS (3 s: paid 100 mUSD to the attested contractor, refused the unattested one, refused after revoke, refused over the cap, refused outside the gate)` |
| showcase-savings-plan-local.sh | one decision, four doors, automation local (`--keep`, `--app`) | anvil 8554, automation 8796, app free | `SHOWCASE-SAVINGS-PLAN-LOCAL PASS` in about 15 s; run history `1:ok 2:ok 3:denied-policy 4:ok 5:denied-policy` |

App routes (product app, Vite default 5173): / investor portal, /issuer issuer console, /showcase gallery, /showcase/backoffice, /showcase/investor-money, /showcase/payout-desk, /showcase/savings-plan. Screenshots: docs/ui (21 PNGs, regenerate with `VITE_MOCK=1 bun run dev -- --port 5199` then `APP_URL=http://127.0.0.1:5199 bun run e2e/ui-shots.ts`, docs/ui/README.md:28). Note: the backoffice `--keep` app port 5179 is not among the Privy allowed origins (5173, 4173); a Privy sign-in on that port fails until the origin is added or the app runs on 5173.

Tests per component with the last recorded counts (FACT, log 2026-09-09): contracts `forge test` 138 passed, 20 skipped without RPC (after investor-money; docs/showcase/backoffice.md still says 119 and docs/demo-runbook.md:14 still says 87, both stale); service `cargo test` 12 unit plus `cargo test --test anvil` 3; companion `bun test` 22; circuits `nargo test` 9; automation `bun test` 16 (13 from WP32 plus 3 from the savings plan); showcase/backoffice `bun test` 35; showcase/payout-desk `bun test` 18; app `tsc --noEmit`, `bun run build` with and without VITE_PRIVY_APP_ID and VITE_ZKPASSPORT, the Playwright specs; verifier relay worktree `ZK_ARTIFACTS_OPTIONAL=1 cargo test --workspace` 207.

## Private evidence and secrets (never commit; the builder deletes)

Unchanged from the 2026-09-09 handoff: nachweis-app/docs/evidence/private/runs/ (four directories, 20260908-204840, 20260908-205820, 20260908-205938, 20260908-233432-browser; gitignored; read-only for agents), nachweis-app/.e2e/ (test issuer keys), [local secrets path, withheld]. New tonight: the two Privy env files under [local secrets path, withheld] named above. No evidence record exists yet for any showcase demo, the swap door or zkPassport; the templates are in each docs/showcase/<slug>.md, docs/swap.md and docs/zkpassport.md. Both wallet evidence records still say "Wallet version string: not recorded (builder to add)" (docs/evidence/g0-2026-09-08.md:10, docs/evidence/browser-real-wallet-2026-09-08.md:8).

## Builder-only items, exact wording

- Sepolia deployer key: put a funded Sepolia key into a local signer (for example `cast wallet import nachweis-deployer --interactive`, or a `.env` with DEPLOYER_PRIVATE_KEY that stays gitignored) and tell the lead the account name; never paste the key into a chat. Also SEPOLIA_RPC_URL.
- Fund the Privy wallets and the embedded wallet with Sepolia ETH: the backoffice operator wallet 0xa7d474A830F9FCe684a68a51f356f1cA0e9bf625, the payout treasury wallet 0x1f6B95db18DEe1F6025f28912b6026c6Ab366AbE, and, after the first email sign-in on Sepolia, about 0.05 Sepolia ETH to the embedded wallet address shown on the card (docs/privy-standing-order.md section 7, test 5). Gas sponsorship is not used.
- Hand-clicked Sepolia runs per demo, in order of value: (1) the EUDI flow with the official wallet on the iPhone against Sepolia (browser-real-wallet stack pointed at Sepolia; attest, approve, subscribe, revoke, refused subscribe; record with hashes); (2) the standing order (docs/privy-standing-order.md section 7, tests 5 to 9, optional 10 and 13); (3) the swap door (Deploy plus pool onboarding, swap, revoke, refused swap; docs/swap.md evidence template); then (4) the four demos: backoffice (docs/showcase/backoffice.md steps 1 to 6), payout desk (docs/showcase/payout-desk.md section 6, steps 1 to 6), investor money (docs/showcase/investor-money.md section 5, steps 1 to 10), savings plan (docs/showcase/savings-plan.md section 6, WP32 stack plus the Issuer B addresses). Each run ends with an evidence record in docs/evidence/ from the demo's template; the lead fills the records from the hashes the builder hands over.
- zkPassport phone run and the keep-or-remove decision (due 2026-09-10): install the ZKPassport app, enable developer mode, run the mock passport route on Sepolia or an anvil fork per docs/zkpassport.md section 0 and 1 (expected statuses "waiting for the zkPassport app" through "proof verified", "tx confirmed", "Evidence stored"; a replay must revert with NonceConsumed), then optionally the real passport (section 2, fixture stays out of the repository). Then decide: keep (costs in wiki/zkpassport.md "Builder decision tomorrow": about 430 lines of contracts, 400 of tests, 420 of app code, a 16 MB lazy dist growth, a second trust statement on screen, an adapter redeploy when the domain changes) or remove (one revert commit; exact `git rm` list in docs/zkpassport.md:94). Tell the lead; decisions.md records it.
- Check-in 2: 2026-09-11 05:59 Vienna. Draft: wiki/checkin-2026-09-11.md (updated tonight with the night's state, under 200 words, the two questions kept). Confirm afterwards whether check-in 1 of 2026-09-08 was submitted.
- Confirm who gave the "new project" ok and on which channel (decisions.md records the builder's words "we got the ok"; log.md needs the source and the date). If the ok came in writing, the two questions in the check-in draft can be deleted.
- The wallet version string: read it from the iPhone's EUDI wallet app (settings or about screen) and give it to the lead for both evidence records.
- Move the exported transcript nachweis-app/2026-09-08-205144-i-told-gpt-6-astra.txt out of the app repository (agents do not run rm or mv on it). It is the only untracked file and `git add -A` would commit it.
- The private evidence directories: nachweis-app/docs/evidence/private/runs/ and nachweis-app/.e2e/ stay gitignored; delete or archive them after the submission.
- Dashboard key cleanup: [security note withheld].
- Still open from the 2026-09-09 handoff: DNS for attestat.dev at Porkbun (nachweis-site/docs/hosting.md), the Uniswap Developer Feedback Form after the repository is public (wiki/uniswap-feedback-form.md), the video constraints (2 to 4 minutes, at least 720p, no speedup, no AI voice).

## Open decisions (builder)

1. zkPassport: keep or remove, due 2026-09-10. Facts and costs in wiki/zkpassport.md; on chain nothing exists yet. OPINION (lead, from the gallery framing): keep only if the mock phone run is green on 2026-09-10; otherwise remove, because a route without a device run cannot be shown in the video.
2. Which demos go into the video: the EUDI investor flow is fixed as the spine; candidates for the showcase beats are the standing order (the Privy policy mirroring the decision), the swap door (Uniswap track), and one of the desk demos. Rule from product.md: only green packages, and only with the evidence class they actually hold; Sepolia hashes on screen only after the hand-clicked runs.
3. The app host for the site's demo links: none exists; every demo link says "runs locally: http://localhost:5173/<route>". When a host exists, change DEFAULT_ORIGIN in nachweis-site/showcase/links.js and nothing else. Hosting is the builder's (GitHub Pages recommended for the site in nachweis-site/docs/hosting.md; the app needs a static host with COOP and COEP headers for the browser prover, unverified which host serves them).
4. Wiki publication and repository visibility: nachweis-app is private and must be public before the Uniswap form and the deadline; the wiki (devdotbo/nachweis) is private and quoted by the gallery ("the page itself is not linked from the public site because the wiki is private", pitch-toolkit.md). Options: make the wiki public after reviewing the two transcript files, or copy identity-standards.md and the case pages into nachweis-app/docs.

## Next agent actions, in order

1. Sepolia deployment with all showcase contracts, on the lead's thread under the builder's authorization, once the signer and SEPOLIA_RPC_URL exist: Deploy.s.sol and DeployNoirVerifier.s.sol pinned to the sandbox issuer key hash 0xb4f2bfa1...e079, the checker and pool onboarding (contracts/script), DeploySecondIssuer.s.sol (savings plan), DeployFundDesk.s.sol (investor money), DeployPayout.s.sol with TREASURY 0x1f6B95db18DEe1F6025f28912b6026c6Ab366AbE (payout desk), and, if zkPassport stays, DeployZkPassportVerifier.s.sol with ZKPASSPORT_DOMAIN and the root verifier 0x1D000001000EFD9a6371f4d90bB8920D5431c0D8. Backoffice Deploy runs with OPERATOR_ADDRESS 0xa7d474A830F9FCe684a68a51f356f1cA0e9bf625, then `bootstrap-privy.ts --set-registry`; payout `setup.ts update-rules` then `check`. Record every address in README "Deployment status", the app .env, the automation .env and both showcase .env files (builder fills the secret lines).
2. Privy-mode runs: the builder clicks, the lead watches the automation and desk logs and collects hashes, in the order of value above. Expected log lines for the standing order: `POLICY CREATED <id> for <address>: 2 rules, expiry <E>`, `TICK OK <address> <hash>` twice, `TICK DENIED policy <address>: Privy refused (<status>): <message>`, `POLICY DENY-ALL ADDED`, `TICK SKIP <address>: no delegated wallet`, `POLICY DENY-ALL REMOVED`.
3. Evidence records: one file per run in docs/evidence/ from the templates (privy-standing-order.md section 8, showcase/<slug>.md, swap.md, zkpassport.md "What to record"), sanitized (no session payloads, no claim names), with the class S line; then flip the badges on the gallery cards and the map nodes (pitch-toolkit.md "Open items": badges do not update themselves), replace the drawn placeholders with real screenshots, link identity-standards if published, and update work-packages.md rows and index.md.
4. Video shot list update: docs/video-shotlist.md with the browser route as beat 3 (WP29 and WP30 numbers), the showcase beats the builder picks (decision 2), Sepolia hashes on screen, the 40-word ZK line from narrative-zk.md, the toolkit sentence from pitch-toolkit.md, the caption "official test wallet, sample identity" on every wallet frame, and "demo built on the toolkit, not a live product" on every showcase frame.
5. Submission text update: wiki/submission-text.md and the ETHGlobal form fields for the toolkit pitch (product sentence unchanged, then the toolkit paragraph), the track field Classic with the verifier disclosed as the builder's own public library, the Privy tracks (Best B2B financial product for the standing order and the desks; Best financial flow for the standing order and investor money; claimed only for runs that are green for S), Best Uniswap Stack Contribution, and the [deploy] sentences filled from the records.
6. README and DISCLOSURE final pass: README.md:11 still says "Continuity entry" (decision: Classic, new project) and has no "showcase" or "toolkit" sentence; README.md:35 deployment status; README.md:82 Privy TODO; DISCLOSURE.md section 2 still says 8 commits and 2,650 insertions (track-decision.md counted 10 commits, 13 files, 3,456 insertions on base a08d72c) and its component table has no row for automation/, showcase/, the FundDesk, GatedPayout and second-issuer contracts, or the zkPassport adapter and @zkpassport/sdk 0.16.2; docs/ai-attribution.md:22 commit count and its closing sentence about no recorded official-wallet presentation are stale; stale test counts in docs/demo-runbook.md:14 and :58, companion/README.md:20, docs/showcase/backoffice.md; docs/demo-runbook.md "switch the role in the header" wording (log 2026-09-09 WP31).

## Contradictions and gaps found while writing (FACT, 2026-09-09 night)

- work-packages.md WP38 row still reads "payout-desk and investor-money merging"; log.md records both merged (e2d3070, 56424b4). The row needs an update by whoever takes the next wiki turn.
- The worktree nachweis-app-wt-app is on a branch wp40-showcase-shots at main 56424b4; no WP40 exists in work-packages.md, the log or decisions.md. Unverified who created it and what it is for.
- README.md:11 calls the entry a Continuity entry; decisions.md of 2026-09-09 night records Classic, new project.
- docs/showcase/payout-desk.md:69 and :71 and docs/showcase/investor-money.md:51 date their Privy setup and measurement 2026-09-10; every other record says 2026-09-09. Unverified whether the machine clock passed midnight Vienna during those runs.
- The backoffice landing page states on screen that key quorum and intents availability on the free plan is "not yet verified" (log 2026-09-09); the backoffice demo settled it the same night (2-of-2 quorum created on the Free plan). The page needs the sentence changed in the final pass.
- pitch-toolkit.md says the gallery and main page are "uncommitted as of this page"; both are committed (nachweis-site a4dda6f, b5b273d).

## Verification of main (filled by the lead)

FACT, run by a Fable teammate on nachweis-app main 56424b4 on the builder's M3 Max, 2026-09-09 night, every check in sequence; main afterwards 1a7d74f with two doc commits (3c25110 stale counts, 1a7d74f README "Showcase").

| Check | Result | Time |
|---|---|---|
| forge test | 152 passed, 0 failed, 20 skipped without RPC | 1.4 s |
| cargo test, cargo test --test anvil | 12 unit plus 3 anvil | 4.8 s, 1.4 s |
| bun test: automation, showcase/backoffice, showcase/payout-desk, companion | 16, 35, 18, 22 pass | under 1 s each |
| nargo test circuits/pid-sdjwt | 9 passed | under 1 s |
| app typecheck; build without and with VITE_PRIVY_APP_ID | clean; clean | 3 s; 5 s, 4 s |
| app-e2e-local.sh sp1-mock; sp1-mock --pool; noir | OK 1 passed; OK 2 passed; OK 1 passed | 23 s; 33 s; 48 s |
| standing-order-local.sh | STANDING-ORDER-LOCAL PASS | 18 s |
| showcase-backoffice-local.sh | SHOWCASE-BACKOFFICE-LOCAL PASS | 7 s |
| showcase-payout-desk-local.sh | SHOWCASE-PAYOUT-DESK-LOCAL PASS | 2 s |
| showcase-investor-money-local.sh; --test | PASS; BROWSER SHOWCASE OK | 1 s; 29 s |
| showcase-savings-plan-local.sh | SHOWCASE-SAVINGS-PLAN-LOCAL PASS | 14 s |
| zkpassport-local.sh | ZKPASSPORT-LOCAL PASS, attest 176,956 gas | 2 s |
| pool-local.sh (public Sepolia RPC) | POOL-LOCAL PASS | 8 s |

The one red on the first run was showcase/backoffice bun test with no node_modules in the main checkout; bun install --frozen-lockfile fixed it, lockfile unchanged.

## Honesty rules that bind every public sentence

From wiki/product.md: official test wallet, sample identity, never "real state-issued identity"; "no identity documents on chain, and nothing we could use to find her", never "nothing about you on chain"; state where the proof is made (browser tab or laptop companion today, phone provers measured on emulator, simulator and one Android container, wallet-side proof when the EUDI framework selects a ZK scheme, none selected as of ARF v3.0.0); simulated checks captioned simulated, manual revocation captioned manual; no "first", no "only", no yield figures, no "second KYC removed"; KYC appears only in the Uniswap form field kycUrl; sponsors on screen only if integrated (Uniswap; Privy only if green). Evidence classes: nothing with only local evidence is called a wallet run, a device run or a deployment. Numbers carry the machine they were measured on.

Added 2026-09-09 night (showcase-brief.md, pitch-toolkit.md): every showcase page says the demos are built on the toolkit and none is a live product; never claim a named company uses one; a Privy run is only a run with the builder's app on Sepolia (class S), so until then no sentence calls anything a Privy run; the zkPassport route is captioned as a third-party app on the phone and not as eIDAS evidence.

## Quota discipline for teammates

One bounded task per teammate with a stated return format, then close; no teammate waits for a build, a human or another agent for more than a few minutes (the wait goes to the lead). Teammates spawn their own subagents on `model: opus` for mechanical steps (file inventories, greps, running a suite and returning counts, applying a specified diff) and keep their own context small (read ranges, grep before read, summaries under 2k tokens). Non-trivial code, debugging, reviews and log triage stay on Fable. Close a teammate as soon as nothing is pending on it; reuse only within a few minutes or under about 150k tokens of context. Browser automation, if any, runs on a Sonnet teammate. Never let a subagent touch Sepolia or any key; deployments run on the lead's thread under the builder's authorization.


## Heads at the close of the night (lead, 2026-09-10 about 03:25 Vienna, FACT)

- nachweis-app main 46d8349 (after the verification docs 3c25110 and 1a7d74f, README Classic line 6c4a66a, WP40 screenshots merged). All ten branches of the night are merged: wp31-product-ui, wp33-zkpassport, wp32-privy-standing-order, wp35-swap-ui, wp38-backoffice, wp38-savings-plan, wp38-payout-desk, wp38-investor-money, wp40-showcase-shots.
- nachweis-site main 693821e (five case pages with real demo screenshots, gallery, reframed main page).
- Wiki: this page, log.md through the WP40 entry, work-packages.md WP31 to WP40, index.md state block of the night.
