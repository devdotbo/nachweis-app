---
type: plan
title: Submission checklist
updated: 2026-09-09
sources:
  - https://ethglobal.com/events/ethonline2026/info/details (fetched 2026-09-08: AI tools, spec-driven artifacts, video, deadline)
  - https://ethglobal.com/rules (fetched 2026-09-08: Continuity, disclosure, version control, open source)
  - https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation (fetched 2026-09-08: public repository, FEEDBACK.md, form, README)
  - /Users/bioharz/git/ethglobal/nachweis/wiki/handoff-fable-2026-09-08.md (schedule, check-in times)
  - /Users/bioharz/git/ethglobal/ethonline2026/raw/ethglobal-rules-2026-09-01.md lines 60-90 (earlier fetch of the rules)
---

# Submission checklist

## Calendar facts

- Check-in 1: 2026-09-08 05:59 Vienna, past. Draft text: /Users/bioharz/git/ethglobal/nachweis/wiki/checkin-2026-09-08.md. Whether it was submitted is unverified: builder, please confirm (yes or no, and the time) so the log can record it.
- Check-in 2: 2026-09-11 05:59 Vienna (FACT, official schedule as read by the review on 2026-09-08). Draft: /Users/bioharz/git/ethglobal/nachweis/wiki/checkin-2026-09-11.md.
- Submission: 2026-09-13 16:00 UTC, 18:00 Vienna (FACT, https://ethglobal.com/events/ethonline2026/info/details, "All projects must be submitted by Sunday, September 13th 2026 at 12:00 pm EDT", fetched 2026-09-08).

## Rules that bind us (FACT, https://ethglobal.com/rules, fetched 2026-09-08)

- Continuity: "you may build on an existing codebase according to the rules of that track."
- Disclosure: "In all cases, you must disclose any pre-existing work in writing to the ETHGlobal team and include full details in your submission (repo history, video, and description)."
- Version control: "you must also use version control for your code throughout the course of the event. Any repositories with single commits of large files without proper history will be default assumed to be unqualified unless proven otherwise."
- Open source: "All new parts of extending an existing project must remain open source."
- Partner prizes: "For Continuity-track submissions, eligibility for specific partner prizes may vary" (the Privy question, not yet asked as of 2026-09-09; wiki/track-decision.md). Classic: "Pre-existing project-specific code, designs, or assets are not allowed", "You may use public libraries or boilerplate" (fetched 2026-09-09).
- The rules page has no clause on AI-generated code; the event details page has (next section).

## Event requirements (FACT, https://ethglobal.com/events/ethonline2026/info/details, fetched 2026-09-08)

- AI tools: "Clearly document in your submission where and how AI tools were used in the project." "AI tools should be used to assist your development process, not to create the entire project."
- Spec-driven workflow: "If you use one, you must include all spec files, prompts, and planning artifacts in your submission repository." Our specs are the wiki pages, the prompts are the handoff pages, the plan is work-packages.md and log.md; docs/ai-attribution.md in the app repository points to them. Consequence: the wiki repository must be public or copied into the submission repository before the deadline (builder decides which; open-questions.md).
- Repository: "Your submission should include a GitHub Repo, Figma files, or equivalent, proving the work was done during the hackathon."
- Video: "Must be between 2 and 4 minutes"; "DO NOT export the video in any resolution less than 720p"; "DO NOT speed up the video to fit under the time limit"; "DO NOT use a text to speech synthesizer / AI Voiceover". Our own rule adds: intro at most about 20 seconds, only green work packages, every simulated step captioned, the privacy sentence matches the route that shipped.

## Uniswap prize requirements (FACT, https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation, fetched 2026-09-08)

- Public GitHub repository with open-source code. nachweis-app is private as of 2026-09-08 (FACT, gh repo view: PRIVATE). Builder flips it before the deadline.
- A FEEDBACK.md file: exists, relabelled 2026-09-08 (local Sepolia fork, no broadcast).
- The Uniswap Developer Feedback Form at https://developers.uniswap.org/hackathon-feedback, linking FEEDBACK.md: not submitted (builder). Paste-ready answers: /Users/bioharz/git/ethglobal/nachweis/wiki/uniswap-feedback-form.md.
- README "clearly points to the relevant contracts and lines of code": the README's Uniswap section does this (FACT, README.md at 0fd7312); the line numbers must be rechecked after WP16 changes the registry.
- Submissions are reviewed and audited before winners are finalized; no external audit purchase is required by the wording.

## Package

- [ ] nachweis-app public at submission. Licence: Apache-2.0 LICENSE file present (FACT). Builder flips visibility.
- [ ] Wiki repository devdotbo/nachweis public or copied into the app repository (spec-driven artifact requirement). Builder decides; review for confidential data first (nothing in the wiki holds keys; the transcript file of 2026-09-08 in the wiki root is a session record and should be checked before publication).
- [ ] DISCLOSURE.md: rewritten 2026-09-08 on branch wp19-evidence in four classes (pre-event base, relay branch, adapted third-party code, new code); the relay branch is exported as vendor/verifier-relay-patches. Merge to main.
- [ ] Written pre-existing-work notice to ETHGlobal: not sent as of 2026-09-09 (builder). Paste-ready 196-word text at the bottom of /Users/bioharz/git/ethglobal/nachweis/wiki/track-decision.md; it also asks the track question and the Privy and Uniswap open-track question. Send before the check-in of 2026-09-11; record date and channel in log.md.
- [ ] docs/ai-attribution.md and docs/process.md: added 2026-09-08 on wp19-evidence. Merge to main; link from the README.
- [ ] README: product name Attestat (WP20), the flow, the honesty box updated to the enforced issuer approval (WP16) and the trust-boundary contract (WP17), Sepolia addresses after deployment, Uniswap line references rechecked, "where the proof is made", what is simulated, links to DISCLOSURE.md, docs/ai-attribution.md, docs/process.md, FEEDBACK.md.
- [ ] FEEDBACK.md TODO lines filled after the Sepolia broadcast (hashes, gas paid, step 7 outcome if requested).
- [ ] Uniswap Developer Feedback Form submitted with the public FEEDBACK.md URL; keep the confirmation.
- [ ] ETHGlobal submission form: title Attestat, tagline, description, video link, repo link, live link, track OPEN (Classic or Continuity "Extend Open Source", builder decides after the ETHGlobal answer; wiki/track-decision.md), sponsor tracks (Uniswap; Privy only if eligible and built per wiki/spec-privy.md; Chainlink not built).
- [ ] Live link lands on the flow, not on a console. The one-click path must not fail.
- [ ] Site: attestat.dev serves the page over HTTPS with Attestat copy, the scripted sample sequence labelled, .app/.xyz/.tech redirecting (WP9s, WP20, builder for DNS and hosting).
- [ ] Commit history small and continuous in every repo from 2026-09-07; no force pushes that rewrite event history (the wp12-ios rewrite happened before that branch reached main and is recorded in work-packages.md).
- [ ] Sandbox wording checked in video, README and site: official test wallet, sample identity.
- [ ] Evidence wording: no local fork labelled live Sepolia; no fixture, emulator or simulator run labelled an official-wallet or physical-device run (work-packages.md evidence classes).
- [ ] Open questions that touch the pitch are answered or worded around (open-questions.md).

## Freeze rule

Feature freeze after the WP4 decision point (client-side selected 2026-09-08, conditional on the official-wallet run). After freeze: video, README, forms, bug fixes only. Nothing red at freeze is mentioned as if it worked.
