# How this project is run

For judges and reviewers. This file uses repository-relative links so it reads on GitHub.

## One source of truth

A separate wiki repository (`devdotbo/nachweis`) holds the product definition, the dated decisions, the plan and the log. Code repositories hold code and runbooks; they never hold decisions. When a README and the wiki disagree, the wiki is wrong or the README is stale, and the log says which was fixed.

The wiki has a schema (`AGENTS.md` there) that every agent turn follows: read the schema, the index, the decisions, the work packages and the newest log entries; do the work; update the pages the work touched; append one dated log line; commit small.

## Evidence labels

Every statement in the wiki that is not from a primary source in front of the reader is labelled:

- FACT: read at the primary source (file, fetched page, measured run), with the absolute path or URL and the date.
- COUNT: a number from a research memo, with the memo named.
- CLAIM: a secondary source or a sponsor, vendor or third-party statement that was not checked.
- OPINION: an agent's own synthesis or recommendation.
- unverified: written instead of a guess.

Measured numbers carry the machine they were measured on. The same discipline is used in this repository's READMEs and in [DISCLOSURE.md](../DISCLOSURE.md).

## Work packages with acceptance tests

The plan is a table of work packages (WP0 to WP20 as of 2026-09-08). Each row has an owner, dependencies, an acceptance test and a status from the fixed set pending, running, green, red, dropped. A row is green only when the acceptance test passed and the evidence (test output, log, screenshot, transaction hash) is on disk.

Since 2026-09-08 the evidence is split into four classes and a row is green per class: local implementation (tests, emulators, simulators, a local Sepolia fork), official-wallet run (the official German EUDI test wallet with a sample identity), physical-device run, and Sepolia deployment. Nothing with only local evidence is described as a wallet run, a device run or a deployment.

## Worktrees, branches, small commits

Each work package runs in its own git worktree on its own branch (`wp7-uniswap`, `wp14-two-device`, `wp19-evidence`, and so on). Commits are small and descriptive; the lead merges to `main`. History is kept from the first event commit on 2026-09-07; there are no squashed drops of pre-existing code. The pre-existing verifier lives in another repository; its event changes are a branch there, exported here as a patch series ([vendor/verifier-relay-patches/README.md](../vendor/verifier-relay-patches/README.md)).

## Independent reviews

Design, code and wiki were reviewed by a second model family (OpenAI Codex) at recorded revisions; the review of 2026-09-08 is a handoff page in the wiki and produced the current work order (issuer approval enforced on chain, service boundaries, G0 runbook, evidence repair, public copy). Reviews change documentation and plans; code changes go through a work package with an acceptance test.

## Who does what

One human builder directs the agents, makes and dates every product decision, holds the keys, domains and devices, operates the official wallet, reviews and accepts each package, and publishes. Claude Code agents write the code and the documentation. Details in [ai-attribution.md](ai-attribution.md).

## Read order for a judge

1. [README.md](../README.md): the product sentence, the flow, the honesty box, the Uniswap integration with file and line references.
2. [DISCLOSURE.md](../DISCLOSURE.md): pre-event base, event changes to it, adapted third-party code, new code.
3. [ai-attribution.md](ai-attribution.md): where AI was used, what the human did, where the specs and prompts are.
4. [FEEDBACK.md](../FEEDBACK.md): Uniswap developer feedback, with its status-of-evidence section.
5. [demo-runbook.md](demo-runbook.md), [e2e-local.md](e2e-local.md), [two-device.md](two-device.md): the local runs and what each one establishes.
6. Specs: `docs/spec-*.md` (issuer approval, G0 runbook; added 2026-09-08).
7. The wiki pages for decisions and the log: copied from the private wiki repository into [wiki/](wiki/README.md), with the redactions listed there.
