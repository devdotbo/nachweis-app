# AI attribution

ETHGlobal requirement (https://ethglobal.com/events/ethonline2026/info/details, section "Use of AI Tools", read 2026-09-08): "Clearly document in your submission where and how AI tools were used in the project." "AI tools should be used to assist your development process, not to create the entire project." "If you use one, you must include all spec files, prompts, and planning artifacts in your submission repository." The rules page (https://ethglobal.com/rules, read 2026-09-08) contains no separate clause on AI-generated code.

This file is that documentation. It states what was done by AI agents, what was done by the human builder, and where the specs, prompts and planning artifacts are. It does not give percentages, because nobody measured them; the commit history and the wiki log are the record.

## Who did what

The team is one human builder. The code in this repository and on the verifier's relay branch was written by Claude Code agents (Anthropic models Fable 5.1 and Opus, run as a lead session with teammate and subagent sessions) working from written work packages. Independent reviews of the design, the code and the wiki were run with OpenAI Codex (GPT) and, for single questions, other models; the reviews changed documentation and produced work orders, not code.

The human builder:

- Set the product: an issuer-side EUDI integration for token issuers, the privacy boundary, and the honesty rules for what may be claimed (wiki `product.md`, `pitch.md`).
- Made and dated every product and route decision: Continuity entry with the pre-existing verifier disclosed, the ZK route order (client-side Noir with a blind relay first, SP1 server-side as fallback), the sponsor scope (Uniswap committed, Privy conditional, Chainlink dropped), the name Attestat, the iPhone-plus-Mac main path, the decision that issuer approval is enforced on chain (wiki `decisions.md`, each entry dated).
- Bought and holds the domains (attestat.dev, .app, .xyz, .tech), the GitHub repositories, the signing identities and any testnet keys. No key was given to an agent.
- Operates the physical devices: the official German EUDI test wallet on the iPhone, the Mac that runs the companion prover, the test hardware. Every official-wallet run and every on-device measurement is the builder's action; as of 2026-09-08 none has been recorded (see `../DISCLOSURE.md` and the wiki work-package table).
- Reviewed and accepted or rejected each work package against its written acceptance test, ordered the independent reviews, and decides what enters the video and the submission form.
- Will publish: flip the repository public, submit the ETHGlobal form and check-ins, submit the Uniswap Developer Feedback Form, record the video in his own voice.

The agents:

- Wrote the contracts, the bridge service, the front end, the SP1 guest and host, the circuit adaptation, the companion prover, the mobile prover core and apps, the scripts and the documentation, in git worktrees, one work package per branch, with small commits (145 commits on `main` on 2026-09-07, single author identity, see `../DISCLOSURE.md`).
- Ran the local tests, fork tests, emulator and simulator runs and recorded the numbers in the READMEs and the wiki. Every number carries the machine it was measured on.
- Wrote the wiki pages on the builder's instruction. The builder does not edit the wiki directly.

## Per component

| Component | AI assistance | Human contribution | Notes |
|---|---|---|---|
| `contracts/` | written by Claude Code agents (registry, fund token, subscription, SP1 and Noir adapters, Uniswap checker, scripts, tests) | acceptance tests set in the work packages; review; decision to enforce issuer approval on chain (2026-09-08) | Uniswap interface files and the SP1 interface are copied third-party code, see `../DISCLOSURE.md` section 3 |
| `service/` | written by Claude Code agents | privacy boundary and route decisions | independent review (Codex, 2026-09-08) found the unauthenticated issuer routes; fix is work package WP17 |
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

- Wiki repository: `devdotbo/nachweis` (private during the build; to be published with the submission, the builder decides). Read order for a judge: `AGENTS.md` (schema and writing rules), `index.md`, `wiki/decisions.md`, `wiki/work-packages.md` (acceptance test and evidence class per package), `log.md` (one dated line per turn).
- Handoff pages (the prompts given to agents): `wiki/handoff-*.md`, including the independent review of 2026-09-08 that produced the current work order.
- Research memos that preceded the build: `raw/` in the wiki repository, each with its origin path.
- Specs in this repository: `docs/spec-*.md`. `docs/spec-issuer-approval.md` and `docs/spec-g0.md` were added on 2026-09-08 by other work packages (WP16, WP18); their content is theirs.
- Runbooks that double as acceptance records: `docs/demo-runbook.md`, `docs/e2e-local.md`, `docs/two-device.md`.
- The session transcripts of the agent runs are not in either repository. They exist on the builder's machine; publishing them is the builder's decision.

## How to read the evidence

A work package is green only for the evidence class that has a run record on disk: local implementation, official-wallet run, physical-device run, or Sepolia deployment. On 2026-09-08 everything green is local implementation. No official-wallet presentation, no physical-device proof and no Sepolia transaction has been recorded. The wiki table and `../DISCLOSURE.md` say the same.
