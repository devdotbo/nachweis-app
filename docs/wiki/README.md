# Spec-driven artifacts: copy of the project wiki

ETHGlobal requirement (https://ethglobal.com/events/ethonline2026/info/details, "Use of AI Tools", re-read 2026-09-09): "you must include all spec files, prompts, and planning artifacts in your submission repository". The specs, prompts and plans of this project live in a separate wiki repository (`devdotbo/nachweis`) that stays private, because an exported session transcript is committed in its history. This directory is the copy of its pages.

Source: wiki repository at commit `1567c427146c09f15911ade72e5a8bc244c428db` (2026-09-10 21:18:21 +0200), copied on 2026-09-10 with `bun scripts/wiki-copy.ts <wiki checkout> 1567c42` from the repository root. The script reads each page with `git show <commit>:<path>`, so the copy is the committed content and not a working tree; it then applies the redactions and link rewrites listed below. The layout is flattened: the wiki's `AGENTS.md`, `index.md`, `log.md` and `wiki/<page>.md` sit side by side here, `wiki/privy-cases/` is `privy-cases/`. Every one of the wiki's 48 pages is copied. Not copied: `raw/` (copied research memos, see "What is withheld and why"), the session transcripts (`.txt`), `CLAUDE.md` (a one-line pointer to `AGENTS.md`) and `llm-wiki.md` (the third-party pattern text the wiki layout follows).

## Read order

1. `AGENTS.md`: the wiki's schema and writing rules (FACT, CLAIM, OPINION labels; how a page is updated).
2. `index.md`: the entry page with the state block of the last turn; `decisions.md`: the dated decision list; `log.md`: one dated line per turn.
3. `product.md`: the product sentence, the buyer, what it is not, the honesty rules for copy.
4. `track-decision.md`: Classic versus Continuity with the rule quotes; the decision itself (Classic, 2026-09-09 night) is in `decisions.md`.
5. `architecture.md`, `zk-plan.md`: the decision object, the proof interface, the ZK routes with measured facts and kill tests.
6. `work-packages.md`: the plan; each work package with owner, dependencies, acceptance test, status and evidence class (L local, W official wallet, D physical device, S Sepolia).
7. The prompts given to agents, in order: `handoff-astra.md` (WP4, WP5), `handoff-fable-2026-09-08.md` (independent review and work order), `handoff-fable-2026-09-09.md`, `handoff-fable-2026-09-10.md`, `handoff-2026-09-10-morning.md`.
8. Independent reviews: `review-fable-2026-09-09.md`, `review-product-focus-2026-09-09.md`, `review-morning-2026-09-10.md`.
9. Sponsor specs: `sponsors.md`, `spec-privy.md`, `privy-cases/` (BRIEF, evaluation, five cases with their research pages), `showcase-brief.md`, `zkpassport.md`, `uniswap-feedback-form.md`.
10. Submission material: `submission-checklist.md`, `submission-text.md`, `checkin-2026-09-08.md`, `checkin-2026-09-11.md`, `pitch.md`, `pitch-toolkit.md`, `video-shotlist-spine.md`, `narrative-zk.md`, `identity-standards.md` with `identity-standards-notes.md`, `name-and-domains.md`, `repos.md`, `open-questions.md`.

## Pages

| Wiki path | Here |
|---|---|
| `AGENTS.md`, `index.md`, `log.md` | same names |
| `wiki/architecture.md`, `wiki/checkin-2026-09-08.md`, `wiki/checkin-2026-09-11.md`, `wiki/decisions.md`, `wiki/handoff-2026-09-10-morning.md`, `wiki/handoff-astra.md`, `wiki/handoff-fable-2026-09-08.md`, `wiki/handoff-fable-2026-09-09.md`, `wiki/handoff-fable-2026-09-10.md`, `wiki/identity-standards-notes.md`, `wiki/identity-standards.md`, `wiki/name-and-domains.md`, `wiki/narrative-zk.md`, `wiki/open-questions.md`, `wiki/pitch-toolkit.md`, `wiki/pitch.md`, `wiki/product.md`, `wiki/repos.md`, `wiki/review-fable-2026-09-09.md`, `wiki/review-morning-2026-09-10.md`, `wiki/review-product-focus-2026-09-09.md`, `wiki/showcase-brief.md`, `wiki/spec-privy.md`, `wiki/sponsors.md`, `wiki/submission-checklist.md`, `wiki/submission-text.md`, `wiki/track-decision.md`, `wiki/uniswap-feedback-form.md`, `wiki/video-shotlist-spine.md`, `wiki/work-packages.md`, `wiki/zk-plan.md`, `wiki/zkpassport.md` | without the `wiki/` prefix |
| `wiki/privy-cases/BRIEF.md`, `README.md`, `evaluation.md`, and `agents/`, `backoffice/`, `investor-money/`, `lifecycle/`, `other-buyer/` with `case.md` and `research.md` each | `privy-cases/...` |

## Redactions

The pages are the wiki's text with these replacements, applied by the script to every page (counts per page are printed by the script):

- Paths to the builder's local secrets directory and to secret env files outside the repositories: `[local secrets path, withheld]`. Pages affected: `index.md` (1), `log.md` (5), `decisions.md` (1), `handoff-fable-2026-09-09.md` (2), `handoff-fable-2026-09-10.md` (4), `privy-cases/evaluation.md` (1).
- The note about an authorization key and an app secret that were once rendered in a browser teammate's own tool output: `[security note withheld]` in `log.md` (3), `handoff-fable-2026-09-10.md` (2), `privy-cases/evaluation.md` (1).
- Privy app, key quorum, policy and wallet ids: `[id withheld]` in `log.md` (9), `handoff-fable-2026-09-10.md` (8), `privy-cases/evaluation.md` (4), `work-packages.md` (1). Note for the builder: the app id, the standing-order quorum id and the backoffice and payout-desk quorum, policy and wallet ids are already in this repository's `.env.example` templates, `../privy-standing-order.md` and `../showcase/`; only the other project's app id appears nowhere else. The wallet addresses are kept, they are in `../showcase/` too.
- Absolute paths on the builder's machine: paths inside the public repositories become repository-relative (`nachweis-app/...`, `nachweis-site/...`, `klartext-verifier/...`, and wiki-relative for the wiki itself); every other absolute path becomes `[local path, withheld]`, `[event wiki, local, withheld]` or `[temporary directory, withheld]`. Repository-relative mentions of gitignored `.env` files are kept; they name where a value goes, never a value.

Kept on purpose, for the builder to confirm: `narrative-zk.md` cites the two authors of a public paper by name; the Privy research pages quote `sales@privy.io` from Privy's documentation; `zk-plan.md` carries the public verification key hash and issuer key hash of the fixtures; the `Bearer` and `*_TOKEN` mentions are environment variable names and route descriptions of the local bridge, without values.

## Links

Every markdown link in the pages resolves in this repository (`bun scripts/check-doc-links.ts` from the repository root checks `docs/`, `README.md` and `DISCLOSURE.md`). Links to a wiki page point at the copy here, with the cited line number kept as the link title. Links into files of this repository point at those files, relative to this directory. Links into a file that is not in this repository (gitignored evidence runs, the `nachweis-site` repository, the verifier checkout) are plain text with the path in parentheses. Links into a session transcript read "(session transcript, not published)"; links into something the copy does not carry read "(not copied)". Bare path mentions in prose stay as text.

## What is withheld and why

- Secrets locations: the wiki records where the Privy app secret, the authorization keys and the verifier's RP key sit on the builder's machine (two env files and one key file, mode 600). No value ever appears in the wiki; the locations are withheld so that the public copy does not describe the builder's machine.
- Transcripts: three exported session transcripts exist on the builder's machine, one of them committed in the wiki's history. They are not published; the review pages that quote from them keep the quotes and lose the links.
- One security incident note: the wiki records, for the builder, how a browser teammate handled a Privy key and an app secret during the dashboard work of 2026-09-09 and what the builder may want to do about it. No value was ever written to a page, a repository or a chat message. The note is for the builder; the copy carries the marker `[security note withheld]` in its place.
- `raw/`: research memos copied into the wiki from earlier private notebooks before the event, each with its origin path. They are not spec, prompt or plan artifacts of this build and are not copied.
- The wiki's git history is private and stays private; this copy is a snapshot of one commit, and the earlier snapshot (commit `5f6271e`, taken 2026-09-09) is in this repository's history.
