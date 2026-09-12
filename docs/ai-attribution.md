# AI attribution

ETHGlobal requirement (https://ethglobal.com/events/ethonline2026/info/details, section "Use of AI Tools", read 2026-09-08): "Clearly document in your submission where and how AI tools were used in the project." "AI tools should be used to assist your development process, not to create the entire project." "If you use one, you must include all spec files, prompts, and planning artifacts in your submission repository." The rules page (https://ethglobal.com/rules, read 2026-09-08) contains no separate clause on AI-generated code.

This file is that documentation. It states what was done by AI agents, what was done by the human builder, and where the specs, prompts and planning artifacts are. It does not give percentages, because nobody measured them; the commit history and the wiki log are the record.

## Who did what

The team is one human builder. The code in this repository and on the verifier's relay branch was written by Claude Code agents (Anthropic models Fable 5.1 and Opus, run as a lead session with teammate and subagent sessions) working from written work packages. Independent reviews of the design, the code and the wiki were run with OpenAI Codex (GPT) and, for single questions, other models; the reviews changed documentation and produced work orders, not code.

The human builder:

- Set the product: an issuer-side EUDI integration for token issuers, the privacy boundary, and the honesty rules for what may be claimed (wiki `product.md`, `pitch.md`).
- Made and dated every product and route decision: the Classic entry with the pre-existing verifier disclosed as his own public library (track open on 2026-09-09, decided the same night), the ZK route order (client-side Noir with a blind relay first, SP1 server-side as fallback), the sponsor scope (Uniswap committed, Privy conditional, Chainlink dropped), the name Attestat, the iPhone-plus-Mac main path, the decision that issuer approval is enforced on chain (wiki `decisions.md`, each entry dated).
- Bought and holds the domains (attestat.dev, .app, .xyz, .tech), the GitHub repositories, the signing identities and any testnet keys. No key was given to an agent.
- Operates the physical devices: the official German EUDI test wallet on the iPhone, the Mac that runs the companion prover, the test hardware. Every official-wallet run and every on-device measurement is the builder's action; two official-wallet runs are on record (`evidence/g0-2026-09-08.md`, `evidence/browser-real-wallet-2026-09-08.md`), no physical-device proving run is (see `../DISCLOSURE.md` and the wiki work-package table).
- Reviewed and accepted or rejected each work package against its written acceptance test, ordered the independent reviews, and decides what enters the video and the submission form.
- Will publish: flip the repository public, submit the ETHGlobal form and check-ins, submit the Uniswap Developer Feedback Form, record the video in his own voice.

The agents:

- Wrote the contracts, the bridge service, the front end, the SP1 guest and host, the circuit adaptation, the companion prover, the mobile prover core and apps, the scripts and the documentation, in git worktrees, one work package per branch, with small commits (289 commits on `main` from 2026-09-07 to 2026-09-09 up to `46d8349`, 52 of them merges, single author identity, see `../DISCLOSURE.md` section 4 for the counting commands).
- Ran the local tests, fork tests, emulator and simulator runs and recorded the numbers in the READMEs and the wiki. Every number carries the machine it was measured on.
- Wrote the wiki pages on the builder's instruction. The builder does not edit the wiki directly.

State on 2026-09-12, `main` at `0f200f9` (the earlier figures above stay as history): 335 commits on `main` (`git rev-list --count HEAD`, same author identity); `forge test` 155 passed, 20 skipped; app unit tests 8 (`cd app && bun test`); automation tests 19 (`cd automation && bun test`); 5 Playwright specs in `app/e2e/` (`*.spec.ts`). The official wallet journey on Sepolia with the phone leg (proof from the official wallet in the browser tab, separate approval, subscribe, swap, revoke, refused swap) is recorded in `evidence/sepolia-phone-2026-09-12.md`; the builder held the phone and clicked the page after the QR.

Agent roles on 2026-09-12 (Claude Code lead session with teammates, one work package per branch, no names or session ids recorded here):

- Review verification: the readiness review's findings checked against the tree and the run logs, each marked confirmed or not.
- Swap door classification fix, and an independent review of that fix by a second agent before the merge.
- Wording: `FEEDBACK.md` brought in line with the Sepolia broadcast, the PresentCard sentence per proof route.
- Spec bundle: the wiki copy script (raw pages and `CLAUDE.md` included) and its coverage check.
- Evidence record: the sanitized Sepolia phone journey of 2026-09-12 with every hash re-read with `cast`, plus the evidence index.
- Merges: the lead merged each branch after its acceptance check.

## Per component

| Component | AI assistance | Human contribution | Notes |
|---|---|---|---|
| `contracts/` | written by Claude Code agents (registry, fund token, subscription, SP1 and Noir adapters, Uniswap checker, scripts, tests) | acceptance tests set in the work packages; review; decision to enforce issuer approval on chain (2026-09-08) | Uniswap interface files and the SP1 interface are copied third-party code, see `../DISCLOSURE.md` section 3 |
| `service/` | written by Claude Code agents | privacy boundary and route decisions | independent review (Codex, 2026-09-08) found the unauthenticated issuer routes; fixed in work package WP17 (the last two patches of the relay series, `../DISCLOSURE.md` section 2) |
| `app/` | written by Claude Code agents, Playwright runs by agents | product copy rules, honesty box wording, name | |
| `prover-sp1/` | written by Claude Code agents on the SP1 toolchain | choice of SP1 as the fallback route | |
| `circuits/pid-sdjwt/` | adapted by Claude Code agents from the eid-privacy circuit (MPL-2.0) | choice of the eid-privacy circuit over writing one | the upstream circuit is human-written third-party code |
| `companion/`, `prover-mobile-core/`, `prover-android/`, `prover-ios/` | written by Claude Code agents; emulator and simulator runs by agents | decision to make the Mac companion the main client device and phones optional; physical device runs (none recorded yet) | |
| Verifier relay branch (`vendor/verifier-relay-patches/`) | written by Claude Code agents on the builder's pre-event verifier | the pre-event verifier itself is the builder's prior work; whether it was written with AI assistance before the event is not part of this submission and is unverified here | |
| `docs/`, README, `DISCLOSURE.md`, `FEEDBACK.md` | written by Claude Code agents from the wiki and the code; independent review by Codex | builder reviews before publication; the builder's own words are the video | this file included |
| Wiki (specs, decisions, log) | pages written by Claude Code agents; reviews by Codex recorded as handoff pages | every decision is the builder's, dated | separate repository, see below |
| Video | none (rule: no synthetic voice) | recorded and spoken by the builder | not recorded as of 2026-09-08 |

Work package WP4 (circuit adaptation) was at one point assigned to a GPT-based agent ("Astra") with its own handoff page; the merged desktop adaptation came from a Claude Code worktree. Whether the GPT agent contributed code is unverified from the git history, which carries one author identity throughout.

## Specs, prompts and planning artifacts

The workflow is spec-driven. The specs are wiki pages; the prompts are handoff pages; the plan is the work-package table and the log.

- Wiki repository: `devdotbo/nachweis`, private during the build and staying private (an exported session transcript is committed in its history). The spec-driven artifacts are therefore copied into this repository: [wiki/README.md](wiki/README.md) gives the read order, names the wiki commit the copy was taken from and lists the redactions. Read order for a judge: [wiki/AGENTS.md](wiki/AGENTS.md) (schema and writing rules), [wiki/index.md](wiki/index.md), [wiki/decisions.md](wiki/decisions.md), [wiki/work-packages.md](wiki/work-packages.md) (acceptance test and evidence class per package), [wiki/log.md](wiki/log.md) (one dated line per turn).
- Handoff pages (the prompts given to agents): [wiki/handoff-astra.md](wiki/handoff-astra.md), [wiki/handoff-fable-2026-09-08.md](wiki/handoff-fable-2026-09-08.md) (the independent review of 2026-09-08 that produced the work order of that day), [wiki/handoff-fable-2026-09-09.md](wiki/handoff-fable-2026-09-09.md), [wiki/handoff-fable-2026-09-10.md](wiki/handoff-fable-2026-09-10.md), [wiki/handoff-2026-09-10-morning.md](wiki/handoff-2026-09-10-morning.md). The later independent reviews are [wiki/review-fable-2026-09-09.md](wiki/review-fable-2026-09-09.md), [wiki/review-product-focus-2026-09-09.md](wiki/review-product-focus-2026-09-09.md) and [wiki/review-morning-2026-09-10.md](wiki/review-morning-2026-09-10.md).
- Research memos that preceded the build: the `raw/` directory of the private wiki repository, each memo with its origin path. They are not published; the wiki pages that draw on them cite them by name.
- Specs in this repository: `docs/spec-*.md`. `docs/spec-issuer-approval.md` and `docs/spec-g0.md` were added on 2026-09-08 by other work packages (WP16, WP18); their content is theirs.
- Runbooks that double as acceptance records: `docs/demo-runbook.md`, `docs/e2e-local.md`, `docs/two-device.md`.
- The session transcripts of the agent runs are not in this repository (`.gitignore` excludes the export tool's file pattern at the repository root). One exported transcript is committed in the private wiki repository's history; that is one reason the wiki stays private. The transcripts exist on the builder's machine; publishing them is the builder's decision. Where a copied wiki page linked into a transcript, the copy says "(session transcript, not published)" and keeps the quoted words.

## How to read the evidence

A work package is green only for the evidence class that has a run record on disk: local implementation, official-wallet run, physical-device run, or Sepolia deployment. As of 2026-09-09 two official-wallet runs are on record, both with the builder's iPhone and the official German EUDI test wallet (sandbox, sample identity) presenting to the relay verifier: the G0 run (`evidence/g0-2026-09-08.md`, proof made by the laptop companion) and the browser-path run (`evidence/browser-real-wallet-2026-09-08.md`, proof made in the browser tab). Everything else that is green is local implementation. No proof has been made on a phone in those runs. Sepolia transactions are recorded since 2026-09-10 in the deployment record [deployments/sepolia-2026-09-10.md](deployments/sepolia-2026-09-10.md) (33 transactions of the deploy, not verified on Etherscan); the journey on that deployment (attest by operator, no phone, through revoke and both refusals, 14 transactions) is recorded in [evidence/sepolia-journey-2026-09-10.md](evidence/sepolia-journey-2026-09-10.md). The wiki table and `../DISCLOSURE.md` say the same.
