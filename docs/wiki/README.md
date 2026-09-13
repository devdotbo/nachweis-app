# Spec-driven artifacts: copy of the project wiki

ETHGlobal requirement (https://ethglobal.com/events/ethonline2026/info/details, "Use of AI Tools", re-read 2026-09-09): "you must include all spec files, prompts, and planning artifacts in your submission repository". The specs, prompts and plans of this project live in a separate wiki repository (`devdotbo/nachweis`) that stays private, because an exported session transcript is committed in its history. This directory is the copy of that repository: every page under `wiki/`, the root pages, and every file under `raw/` (plans, reviews, decisions and research memos). The only files not copied are the session transcripts and one third-party text, listed under "Not copied" with the reason.

Source: wiki repository at commit `1b9e2444e1740069c25a8ee9a2d9c4888ef1075e` (2026-09-13 18:42:32 +0200, "Close-out 2026-09-13: form files, images, handoffs, take record, lessons, finalist prep"), copied on 2026-09-13 with `bun scripts/wiki-copy.ts <wiki checkout> 1b9e244` from the repository root. The script reads each file with `git show <commit>:<path>`, so the copy is the committed content and not a working tree; it then applies the redactions and link rewrites listed below. The layout: the wiki's `AGENTS.md`, `CLAUDE.md`, `index.md`, `log.md` and `wiki/<page>.md` sit side by side here, `wiki/privy-cases/` is `privy-cases/`, and `raw/` keeps its name. 73 files are copied (4 root pages, 52 pages under `wiki/`, 16 files under `raw/`, 1 file under `video/`). `bun scripts/wiki-coverage.ts <wiki checkout> c924b50` checks that every file of the wiki at that commit is either here or listed under "Not copied", and that nothing stale remains.

## What is a spec, a prompt, a plan here

- Specs: `product.md`, `architecture.md`, `zk-plan.md`, `spec-privy.md`, `sponsors.md`, `showcase-brief.md`, `zkpassport.md`, `privy-cases/` (brief, evaluation, five cases with research), `identity-standards.md`, `track-decision.md`, `narrative-zk.md`.
- Prompts: the handoff pages are the prompts given to agents, in order: `handoff-astra.md` (WP4, WP5, for a GPT session), `handoff-fable-2026-09-08.md` (independent review and work order), `handoff-fable-2026-09-09.md`, `handoff-fable-2026-09-10.md`, `handoff-2026-09-10-morning.md`, `handoff-2026-09-11-morning.md`, `handoff-2026-09-12.md`, `handoff-2026-09-13.md`, `handoff-2026-09-13-evening.md`, `handoff-2026-09-13-final.md`, `handoff-2026-09-13-night.md`; `finalist-prep-2026-09-14.md` is the brief for the day after the deadline. `AGENTS.md` is the standing instruction every agent session reads first (schema and writing rules of the wiki), `CLAUDE.md` the one-line pointer to it that Claude Code loads.
- Plans and decisions: `work-packages.md` (the plan; each work package with owner, dependencies, acceptance test, status and evidence class), `decisions.md`, `log.md`, `index.md` (state block of the last turn), `open-questions.md`, `submission-checklist.md`, `video-shotlist-spine.md`, `pitch.md`, `pitch-toolkit.md`, `form-paste-2026-09-13.md` and `form-techstack-2026-09-13.md` (the submission form text), `lessons-2026-09.md`, and the `raw/` planning files listed below.
- Reviews: `review-fable-2026-09-09.md`, `review-product-focus-2026-09-09.md`, `review-morning-2026-09-10.md`, `review-readiness-2026-09-11.md`, and `raw/reviews-2026-09-09/`.

## Read order

1. `AGENTS.md`: the wiki's schema and writing rules (FACT, CLAIM, OPINION labels; how a page is updated).
2. `index.md`: the entry page with the state block of the last turn; `decisions.md`: the dated decision list; `log.md`: one dated line per turn.
3. `product.md`: the product sentence, the buyer, what it is not, the honesty rules for copy.
4. `track-decision.md`: Classic versus Continuity with the rule quotes; the decision itself (Classic, 2026-09-09 night) is in `decisions.md`.
5. `architecture.md`, `zk-plan.md`: the decision object, the proof interface, the ZK routes with measured facts and kill tests.
6. `work-packages.md`: the plan; `raw/build-plan.md`: the plan it grew from (gates G0 to G3, lanes L1 to L9, the video plan).
7. The prompts given to agents, in order: `handoff-astra.md`, `handoff-fable-2026-09-08.md`, `handoff-fable-2026-09-09.md`, `handoff-fable-2026-09-10.md`, `handoff-2026-09-10-morning.md`, `handoff-2026-09-11-morning.md`, `handoff-2026-09-12.md`, `handoff-2026-09-13.md`, `handoff-2026-09-13-evening.md`, `handoff-2026-09-13-final.md`, `handoff-2026-09-13-night.md`; `finalist-prep-2026-09-14.md` is the brief for the day after the deadline.
8. Independent reviews: `review-fable-2026-09-09.md`, `review-product-focus-2026-09-09.md`, `review-morning-2026-09-10.md`, `review-readiness-2026-09-11.md`, `raw/reviews-2026-09-09/`.
9. Sponsor specs: `sponsors.md`, `spec-privy.md`, `privy-cases/`, `showcase-brief.md`, `zkpassport.md`, `uniswap-feedback-form.md`.
10. Submission material: `submission-checklist.md`, `submission-text.md`, `checkin-2026-09-08.md`, `checkin-2026-09-11.md`, `pitch.md`, `pitch-toolkit.md`, `video-shotlist-spine.md`, `narrative-zk.md`, `identity-standards.md` with `identity-standards-notes.md`, `name-and-domains.md`, `repos.md`, `open-questions.md`.
11. The research behind the choice of project, in `raw/` (below).

## Pages

| Wiki path | Here |
|---|---|
| `AGENTS.md`, `CLAUDE.md`, `index.md`, `log.md` | same names |
| `wiki/architecture.md`, `wiki/checkin-2026-09-08.md`, `wiki/checkin-2026-09-11.md`, `wiki/decisions.md`, `wiki/finalist-prep-2026-09-14.md`, `wiki/form-paste-2026-09-13.md`, `wiki/form-techstack-2026-09-13.md`, `wiki/handoff-2026-09-10-morning.md`, `wiki/handoff-2026-09-11-morning.md`, `wiki/handoff-2026-09-12.md`, `wiki/handoff-2026-09-13.md`, `wiki/handoff-2026-09-13-evening.md`, `wiki/handoff-2026-09-13-final.md`, `wiki/handoff-2026-09-13-night.md`, `wiki/handoff-astra.md`, `wiki/handoff-fable-2026-09-08.md`, `wiki/handoff-fable-2026-09-09.md`, `wiki/handoff-fable-2026-09-10.md`, `wiki/identity-standards-notes.md`, `wiki/identity-standards.md`, `wiki/incidents-idscan-revolut-2026-09.md`, `wiki/lessons-2026-09.md`, `wiki/name-and-domains.md`, `wiki/narrative-zk.md`, `wiki/open-questions.md`, `wiki/pitch-toolkit.md`, `wiki/pitch.md`, `wiki/product.md`, `wiki/repos.md`, `wiki/review-fable-2026-09-09.md`, `wiki/review-morning-2026-09-10.md`, `wiki/review-product-focus-2026-09-09.md`, `wiki/review-readiness-2026-09-11.md`, `wiki/showcase-brief.md`, `wiki/spec-privy.md`, `wiki/sponsors.md`, `wiki/submission-checklist.md`, `wiki/submission-text.md`, `wiki/track-decision.md`, `wiki/uniswap-feedback-form.md`, `wiki/video-shotlist-spine.md`, `wiki/work-packages.md`, `wiki/zk-plan.md`, `wiki/zkpassport.md` | without the `wiki/` prefix |
| `wiki/reference-video-T0jY6BqNS3w/analysis.md`, `transcript.md` (the ETHGlobal example demo video analyzed after the deadline), `submission-images/README.md` (index of the form images) | `reference-video-T0jY6BqNS3w/...`, `submission-images/README.md` |
| `wiki/privy-cases/BRIEF.md`, `README.md`, `evaluation.md`, and `agents/`, `backoffice/`, `investor-money/`, `lifecycle/`, `other-buyer/` with `case.md` and `research.md` each | `privy-cases/...` |
| `raw/**` (15 files) | `raw/...`, same names |

## raw/

`raw/` holds files that were copied into the wiki unchanged from the builder's earlier private notebooks (`raw/README.md` lists each with its origin; the origin paths are withheld here, see Redactions). They fall into two groups. Both are copied in full.

Plans, decisions and reviews of this build:

- `raw/build-plan.md`: the build plan of 2026-09-06 for 2026-09-07 to 2026-09-13, sized to six Claude Code sessions plus two GPT sessions: human gates G0 to G3, lanes L1 to L9, the video plan, the wave 2 amendments. `work-packages.md` is its successor.
- `raw/verdict-2026-09-06.md`: the wave 2 verdict, whether there is a product and a scene or whether to pivot; the decision to build this.
- `raw/synthesis.md`: the synthesis of the four research memos into the EUDI attestation direction.
- `raw/2026-09-07-real-zk-routes.md`: the ZK routes R1 to R6 evaluated for the deadline; the basis of `zk-plan.md`.
- `raw/money-question-2026-09-07.md`: the money question of 2026-09-07 (what is the business), a reviewer session with the GPT and Grok positions quoted.
- `raw/reviews-2026-09-09/audit-submission-2026-09-09.md`, `integration-map-2026-09-09.md`, `review-focus-fable-2026-09-09.md`: three read-only reviews of 2026-09-09 (submission audit against the re-fetched rules, the combined journey map, the focus verdict on the five Privy cases). `review-fable-2026-09-09.md` and `review-product-focus-2026-09-09.md` are the wiki pages written from them.

Research memos written before the build, for the choice of project:

- `raw/2026-09-06-zk-feasibility.md`, `raw/2026-09-06-pluggable-architecture.md`, `raw/2026-09-06-live-gated-products.md`, `raw/2026-09-06-sponsor-integration.md`, `raw/2026-09-06-product-pitch-legal.md`: five teammate research memos of 2026-09-06 (ZK feasibility for a solo builder, pluggable eligibility attestation, live gated products, minimum sponsor integrations, product and legal boundary). The plans above cite them.
- `raw/front-door-brief-2026-09-02.md`: a front-door brief of 2026-09-02 for an earlier project idea (pitch, page hierarchy, video, event feature); kept because `raw/README.md` and the plans refer to it.
- `raw/README.md`: the index of `raw/` with one line per file.

## Not copied

| File | Reason |
|---|---|
| `*.txt` | Exported session transcripts (one committed at the wiki root, two more untracked on the builder's machine); not published, a builder decision (recorded in `review-fable-2026-09-09.md` and `handoff-2026-09-10-morning.md`), and their file names are withheld in the copy. |
| `.gitignore` | Git housekeeping of the wiki checkout (keeps exported transcripts out of commits), not a spec, prompt or plan. |
| `video/cards.html` | Browser tooling for the video take (title, limits, closing and route-diagram cards). The text it carries is `video-script.md`, which is copied; the HTML is not a spec, prompt or plan. |
| `video/teleprompter.html` | Browser tooling for the video take (a teleprompter). The text it carries is `video-script.md`, which is copied; the HTML is not a spec, prompt or plan. |
| `raw/2026-09-12-grok-x-idscan-revolut.txt` | Raw output of a third-party model's X search for the incident research (quotes of named accounts); its findings are summarized with evidence labels in `incidents-idscan-revolut-2026-09.md`; not a spec, prompt or plan. |
| `llm-wiki.md` | Third-party pattern text ("LLM Wiki", an idea file the wiki layout follows), not written for this project. |
| `wiki/video-take-2026-09-13/` | Outputs of the video take of 2026-09-13 (WhisperKit transcript `.srt`, the ffmpeg render script, the closing card PNG, the cut contact sheet JPEG); not a spec, prompt or plan. The take, the cut and the app commit it ran on are described in `handoff-2026-09-13-final.md` and `video-shotlist-spine.md`, which are copied. |
| `submission-images/cover-1280x720.png` | Image uploaded to the ETHGlobal form (PNG rendered with headless Chrome); not a spec, prompt or plan. Its index `submission-images/README.md` is copied. |
| `submission-images/logo-512.png` | Image uploaded to the ETHGlobal form (PNG rendered with headless Chrome); not a spec, prompt or plan. Its index `submission-images/README.md` is copied. |
| `submission-images/shot-1-landing-hero.png` | Image uploaded to the ETHGlobal form (PNG rendered with headless Chrome); not a spec, prompt or plan. Its index `submission-images/README.md` is copied. |
| `submission-images/shot-2-landing-cards.png` | Image uploaded to the ETHGlobal form (PNG rendered with headless Chrome); not a spec, prompt or plan. Its index `submission-images/README.md` is copied. |
| `submission-images/shot-3-app-investor.png` | Image uploaded to the ETHGlobal form (PNG rendered with headless Chrome); not a spec, prompt or plan. Its index `submission-images/README.md` is copied. |
| `submission-images/shot-4-app-issuer.png` | Image uploaded to the ETHGlobal form (PNG rendered with headless Chrome); not a spec, prompt or plan. Its index `submission-images/README.md` is copied. |
| `submission-images/shot-5-route-diagram.png` | Image uploaded to the ETHGlobal form (PNG rendered with headless Chrome); not a spec, prompt or plan. Its index `submission-images/README.md` is copied. |
| `submission-images/shot-6-closing-card.png` | Image uploaded to the ETHGlobal form (PNG rendered with headless Chrome); not a spec, prompt or plan. Its index `submission-images/README.md` is copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-01-1_0s-title-card.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-02-9_0s-who-are-we.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-03-15_0s-what-we-built.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-04-22_0s-how-it-works.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-05-42_6s-app-first-shown.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-06-46_0s-file-dialog.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-07-52_0s-wallet-connect-modal.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-08-58_0s-app-budget.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-09-68_0s-metamask-deposit.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-10-73_5s-deposit-mining.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-11-83_0s-file-seeding-left.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-12-95_0s-downloader-wallet-flow.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-13-110_0s-downloading-both-windows.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-14-143_5s-download-complete.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-15-144_8s-poster-opened.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-16-147_0s-how-its-made.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-17-188_0s-future-work.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-18-206_0s-check-it-out-live.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/frame-19-218_0s-thanks.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/sheet-01.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/sheet-02.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |
| `wiki/reference-video-T0jY6BqNS3w/sheet-03.png` | Frame or contact sheet extracted from the ETHGlobal example demo video (PNG, third-party footage); not a spec, prompt or plan. The analysis and the transcript of that video are copied. |

Everything else in the wiki at the pinned commit is here. The wiki's git history is private and stays private; this copy is a snapshot of one commit, and the earlier snapshots (commits `5f6271e` taken 2026-09-09, `5a5156d` taken 2026-09-10, `6a79c66` taken 2026-09-11, `cb061eb`, `457e986` and `c7e33b8` taken 2026-09-12, `1fe012a`, `b28cb45`, `f70a47a`, `0fe3465` and `c924b50` taken 2026-09-13) are in this repository's history.

## Redactions

The pages are the wiki's text with these replacements, applied by the script to every file (counts per file are printed by the script):

- Paths to the builder's local secrets directory and to secret env files outside the repositories: `[local secrets path, withheld]`. Pages affected: `index.md` (1), `log.md` (5), `decisions.md` (1), `handoff-fable-2026-09-09.md` (2), `handoff-fable-2026-09-10.md` (4), `privy-cases/evaluation.md` (1).
- The note about an authorization key and an app secret that were once rendered in a browser teammate's own tool output: `[security note withheld]` in `log.md` (3), `handoff-fable-2026-09-10.md` (2), `privy-cases/evaluation.md` (1).
- Privy app, key quorum, policy and wallet ids: `[id withheld]` in `log.md` (9), `handoff-fable-2026-09-10.md` (8), `privy-cases/evaluation.md` (4), `work-packages.md` (1). Note for the builder: the app id, the standing-order quorum id and the backoffice and payout-desk quorum, policy and wallet ids are already in this repository's `.env.example` templates, `../privy-standing-order.md` and `../showcase/`; only the other project's app id appears nowhere else. The wallet addresses are kept, they are in `../showcase/` too.
- File names of exported session transcripts, with or without a directory in front: `[session transcript, not published]` (in `handoff-2026-09-10-morning.md`, `handoff-fable-2026-09-09.md`, `handoff-fable-2026-09-10.md`, `review-fable-2026-09-09.md`, `review-product-focus-2026-09-09.md`, `raw/front-door-brief-2026-09-02.md`, `raw/money-question-2026-09-07.md`, `raw/reviews-2026-09-09/audit-submission-2026-09-09.md`).
- Absolute paths on the builder's machine: paths inside the public repositories become repository-relative (`nachweis-app/...`, `nachweis-site/...`, `klartext-verifier/...`, and wiki-relative for the wiki itself); every other absolute path becomes `[local path, withheld]`, `[event wiki, local, withheld]` or `[temporary directory, withheld]`. In `raw/` this withholds the origin paths of the copied memos and the paths of the earlier private notebooks they cite. Repository-relative mentions of gitignored `.env` files are kept; they name where a value goes, never a value.

Kept on purpose, for the builder to confirm: `narrative-zk.md` cites the two authors of a public paper by name; the Privy research pages quote `sales@privy.io` from Privy's documentation, and the raw memos quote three organisation addresses from public documentation (`partner@eudi.sprind.org`, `sandbox.access@toolsforhumanity.org`, `developers@worldcoin.com`); `zk-plan.md` carries the public verification key hash and issuer key hash of the fixtures; the Sepolia transaction hashes, pool id and contract addresses are public chain data; the EAS schema ids in the raw memos are public; the `Bearer` and `*_TOKEN` mentions are environment variable names and route descriptions of the local bridge, without values. No email address of a person and no name other than public authors and the builder's public handle appears in the copy (checked by grep on 2026-09-12: `/Users/`, 64-hex values, `PRIVATE_KEY=`, `sk-`, `Bearer `, email addresses, transcript file names).

## Links

Every markdown link in the pages resolves in this repository (`bun scripts/check-doc-links.ts` from the repository root checks `docs/`, `README.md` and `DISCLOSURE.md`). Links to a wiki page or a `raw/` file point at the copy here, with the cited line number kept as the link title. Links into files of this repository point at those files, relative to this directory. Links into a file that is not in this repository (gitignored evidence runs, the `nachweis-site` repository, the verifier checkout) are plain text with the path in parentheses. Links into a session transcript read "(session transcript, not published)"; links into something the copy does not carry read "(not copied)". Bare path mentions in prose stay as text.

## What is withheld and why

- Secrets locations: the wiki records where the Privy app secret, the authorization keys and the verifier's RP key sit on the builder's machine (two env files and one key file, mode 600). No value ever appears in the wiki; the locations are withheld so that the public copy does not describe the builder's machine.
- Transcripts: three exported session transcripts exist on the builder's machine, one of them committed in the wiki's history. They are not published; the review pages that quote from them keep the quotes and lose the links and file names.
- One security incident note: the wiki records, for the builder, how a browser teammate handled a Privy key and an app secret during the dashboard work of 2026-09-09 and what the builder may want to do about it. No value was ever written to a page, a repository or a chat message. The note is for the builder; the copy carries the marker `[security note withheld]` in its place.
- Origin paths of the `raw/` files and paths of earlier private notebooks: withheld as local paths; the files themselves are here.
