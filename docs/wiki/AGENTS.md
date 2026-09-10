# Nachweis wiki: schema

This directory is the product wiki and orchestration record for Nachweis, the ETHOnline 2026 submission (pattern: llm-wiki.md). It exists so that any agent, or the builder after a break, can resume with a clear head: what was decided, what is running, what is open, and where the code lives. The builder does not write into these files; agents do, on the builder's instruction. Code lives in other repositories (see wiki/repos.md), never here.

Read this file first, then index.md, then wiki/decisions.md, then wiki/work-packages.md, then the newest entries in log.md.

## Layers

- Raw sources (never edited after they are copied in): everything under raw/. Each file keeps its original filename; raw/README.md lists the origin path of every file. Primary sources outside this repo (code, fixtures, fetched web pages) are cited by absolute path or URL and date.
- Wiki pages (maintained by whichever agent takes a turn): everything under wiki/, plus index.md and log.md.
- Schema: this file. An agent may propose a schema change in its turn; apply it only if the builder or the lead agrees.

## Page types

- decision pages (wiki/decisions.md): dated list of what was decided, by whom, with the alternative that was rejected. A decision without a date is not a decision.
- plan pages (wiki/work-packages.md, wiki/zk-plan.md, wiki/submission-checklist.md): what is to be built, acceptance test per item, status. Status values: pending, running, green, red, dropped.
- reference pages (wiki/architecture.md, wiki/sponsors.md, wiki/repos.md, wiki/product.md, wiki/pitch.md): stable descriptions; update in place, note the date in the header.
- handoff pages (wiki/handoff-*.md): a self-contained brief for one named agent or person, readable without the rest of the wiki.
- question pages (wiki/open-questions.md): unanswered questions, each with who can answer it and by when it matters.

## Evidence labels

Label every statement that is not from a primary source in front of the reader:

- FACT: read at the primary source (file, fetched page, measured run); cite the absolute path or URL and the date.
- COUNT: a number taken from a research memo; name the memo.
- CLAIM: secondary source or a statement by a sponsor, vendor or third party that was not checked.
- OPINION: an agent's own synthesis or recommendation.
- unverified: written instead of a guess whenever the agent does not know.

Measured numbers carry the machine or device they were measured on.

## Taking a turn

1. Read AGENTS.md, index.md, wiki/decisions.md, wiki/work-packages.md and the log entries since your last turn (all of them on your first turn).
2. Do the requested work. Update the pages the work touches. Keep other agents' statements; if you disagree, change the statement and say in the log what you changed and why.
3. Update index.md if you added or renamed a page.
4. Append one entry to log.md of the exact form `## [YYYY-MM-DD] <kind> | <one line>` where kind is one of: decision, ingest, update, run, question, lint. Never edit or delete earlier log entries.
5. Commit small: one page or one coherent pair of files per commit, descriptive message in English, no attribution lines. Push with `git push origin HEAD`.
6. Do not run code, deploy, or contact anyone from inside this repo. Work in the code repositories happens there and is recorded here after the fact.

## Writing rules

- English throughout, including code comments and commit messages, regardless of the conversation language.
- Absolute paths (`/Users/...`), never `~` or relative paths. `path:line` is fine.
- No em dashes, no en dashes, no double hyphens as punctuation. Use commas, colons, periods, parentheses.
- No emojis. No markdown blockquotes.
- Effort in sizes (small, medium, large, XL), never in hours or days. Calendar facts (deadlines, check-ins) are allowed because they are facts.
- Say "unverified" instead of guessing.
- The sandbox wallet holds sample data (FACT, https://eudi-wallet.gov.de/en/news/testing-digital-credentials-in-the-eudi-wallet-sandbox, fetched 2026-09-07). Never write "real state-issued identity" for the demo. Write: official test wallet, sample identity.
- A plan item without an acceptance test is incomplete. A pick without a kill criterion is incomplete.
