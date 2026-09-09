# Spec-driven artifacts: copy of the project wiki

ETHGlobal requirement (https://ethglobal.com/events/ethonline2026/info/details, "Use of AI Tools", re-read 2026-09-09): "you must include all spec files, prompts, and planning artifacts in your submission repository". The specs, prompts and plans of this project live in a separate wiki repository (`devdotbo/nachweis`) that stays private, because an exported session transcript is committed in its history. This directory is the copy of its pages.

Source: wiki repository at commit `5f6271e01d8b6cfafc75d3362604d7997e4ba004` (2026-09-09 21:19:37 +0200), copied on 2026-09-09 with `git show <commit>:<path>` per page, so the copy is the committed content and not a working tree. The layout is flattened: the wiki's `AGENTS.md` and `wiki/<page>.md` sit side by side here, `wiki/privy-cases/` is `privy-cases/`. Links and paths inside the pages are the wiki's own (absolute paths on the builder's machine, `wiki/...` relative paths) and do not resolve here; read them as page names. `raw/` (copied research memos) and every `.txt` file were not copied.

## Read order

1. `AGENTS.md`: the wiki's schema and writing rules (FACT, CLAIM, OPINION labels; how a page is updated).
2. `product.md`: the product sentence, the buyer, what it is not, the honesty rules for copy.
3. `track-decision.md`: Classic versus Continuity with the rule quotes, what is new and what is pre-existing; the decision itself (Classic, 2026-09-09 night) is recorded in `decisions.md`, see below.
4. `architecture.md`, `zk-plan.md`: the decision object, the proof interface, the ZK routes with measured facts and kill tests.
5. `work-packages.md`: the plan; each work package with owner, dependencies, acceptance test, status and evidence class (L local, W official wallet, D physical device, S Sepolia).
6. The prompts given to agents: `handoff-astra.md` (WP4, WP5), `handoff-fable-2026-09-08.md` (independent review and work order). The two later handoffs are withheld, see below.
7. Independent reviews: `review-fable-2026-09-09.md`, `review-product-focus-2026-09-09.md`.
8. Sponsor specs: `sponsors.md`, `spec-privy.md`, `privy-cases/` (BRIEF, five cases with their research pages), `showcase-brief.md`, `zkpassport.md`, `uniswap-feedback-form.md`.
9. Submission material: `submission-checklist.md`, `submission-text.md`, `checkin-2026-09-08.md`, `checkin-2026-09-11.md`, `pitch.md`, `pitch-toolkit.md`, `video-shotlist-spine.md`, `narrative-zk.md`, `identity-standards.md` with `identity-standards-notes.md`, `name-and-domains.md`, `repos.md`, `open-questions.md`.

## Withheld pages

Before copying, the page set was grepped for private keys, app secrets, tokens, authorization keys, session payloads, personal names of third parties, and absolute paths under the builder's configuration directory. No key material, token or secret value appears in any page. Six pages were not copied because they name the location of secret files on the builder's machine or describe a security incident in detail; the builder decides whether to copy them with those lines redacted:

| Page | Reason (line numbers at the source commit) |
|---|---|
| `index.md` | path to the local secrets directory (:11) |
| `log.md` | paths to local secret env files (:93, :94, :107, :113); the note that an authorization key was once rendered in a tool output (:94); Privy policy, wallet and quorum ids (:111, :113) |
| `wiki/decisions.md` | path to the local secrets env file (:75) |
| `wiki/handoff-fable-2026-09-09.md` | path to a private key file outside the repositories (:55); the same env files; local tool paths (:61) |
| `wiki/handoff-fable-2026-09-10.md` | secret file locations and the incident note (:85, :86, :133, :146); Privy ids (:74) |
| `wiki/privy-cases/evaluation.md` | secret file location and the incident note (:318); another party's Privy app id (:308) |

`index.md`, `log.md` and `decisions.md` are the wiki's entry page, the dated turn log and the dated decision list; the decisions that matter for this submission are restated in `../../DISCLOSURE.md`, `../../README.md` and `../ai-attribution.md`.

Kept on purpose, for the builder to confirm: `narrative-zk.md` cites the two authors of a public paper by name (:31); the Privy research pages quote `sales@privy.io` from Privy's documentation; `handoff-fable-2026-09-08.md`, `review-fable-2026-09-09.md` and `review-product-focus-2026-09-09.md` refer to session transcript files by path and quote from them (the transcripts themselves are not in this repository); `zk-plan.md` carries the public verification key hash and issuer key hash of the fixtures.
