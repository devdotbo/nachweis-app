# Submission audit, 2026-09-09 about 21:00 Vienna (read-only)

Rules re-fetched tonight (2026-09-09 about 20:45 Vienna): https://ethglobal.com/events/ethonline2026/info/details, /prizes/privy, /prizes/uniswap-foundation. Wiki quotes match.

## 1. Hard blockers for a valid submission

Dependency order: A before B before C, then E. D, F, G and H are independent of the chain work.

A. Transcripts out of the repos (builder, since agents do not rm or mv). FACT, gh and git tonight:
- [session transcript, not published], 379,742 B, TRACKED and committed. `git rm` does not remove it from history; publishing the wiki repo publishes it.
- [session transcript, not published], 253,432 B, untracked, not ignored.
- [session transcript, not published], 92,837 B, untracked, not ignored (`git add -A` would commit it).
- 16 transcripts under [event wiki, local, withheld] are ignored (.gitignore:2).

B. Public repository (builder). FACT, `gh repo view` tonight: devdotbo/nachweis-app, devdotbo/nachweis, devdotbo/nachweis-site, devdotbo/ethonline2026-wiki all PRIVATE. Rule: "Your submission should include a GitHub Repo ... proving the work was done during the hackathon". History is fine: 289 commits from 2026-09-07 17:34 (FACT, git log).

C. Spec-driven artifacts (builder decision, agent-doable copy). Rule: "you must include all spec files, prompts, and planning artifacts in your submission repository". docs/ai-attribution.md points at the private wiki. OPINION: because of the committed transcript in the wiki history, copy the wiki pages into nachweis-app/docs rather than flip the wiki public.

D. Pre-existing work notice (builder). Rule: "In all cases, you must disclose any pre-existing work in writing to the ETHGlobal team" (https://ethglobal.com/rules, wiki fetch 2026-09-08). Not sent (FACT, wiki/open-questions.md:30, log.md:61 and :88). Text ready at wiki/track-decision.md:126 to :147. Who gave the "new project" ok is unrecorded (decisions.md:70).

E. Submission form (builder): title, tagline, description, video, repo, live link, track, "up to 3 Partner Prizes". Paste text at wiki/submission-text.md is still written for Continuity (lines 16, 66, 85 to 87).

F. Video (builder, no fallback). "2-4 minute demo video", under 2 or over 4 "will be automatically rejected", not under 720p, no speedup, no TTS or AI voiceover, "DO NOT use mobile phones to record the video submission". None exists (FACT, docs/ai-attribution.md:39). Shot list: nachweis-app/docs/video-shotlist.md, "no Sepolia yet" variant at line 34.

G. AI-tools disclosure: "Clearly document in your submission where and how AI tools were used". nachweis-app/docs/ai-attribution.md exists, stale (section 3).

H. Check-in 2 (builder, dashboard, 2026-09-11 05:59 Vienna). Draft: wiki/checkin-2026-09-11.md. Whether a missed check-in invalidates a submission is unverified; the details page has no check-in sentence. Check-in 1 submission unverified (submission-checklist.md:17).

No published rule requires a testnet or mainnet deployment (details page: absent; the words deploy, testnet, mainnet do not appear on the Privy or Uniswap pages). Sepolia is the project's own honesty bar (product.md), not ETHGlobal's.

## 2. Sponsor tracks

Privy, Best B2B financial product, 2,500 USD (FACT, prize page tonight): "Integrate Privy as a core part of the product"; "Create or use at least one Privy wallet"; "Demonstrate a business or organization use case"; "Implement at least one functional B2B workflow, such as a payment, approval, treasury operation, or wallet administration flow"; "Use at least one Privy control, such as policies, signers, key quorums, or intents"; "Provide a working demo and access to the project's source code"; "Clearly explain how Privy enables the product". Public chain: not required. Have: server wallets, 2-of-2 quorums, policies created via API, local-mode desks green. Missing: source access (repo private), a demo a judge can watch, the 1 wei transfer INCONCLUSIVE until funded, README:82 "Builder TODO".

Privy, Best financial flow, 2,500 USD: same first two and last two bullets, plus "Complete at least one functional financial flow using a generally available Privy feature" ("transfers, bridging, stablecoin conversions, swaps, self-service Earn vaults, onramps, or other supported wallet actions"); "Features requiring commercial or guided onboarding may be mocked, but they do not count". Public chain: not required. Missing: an embedded-wallet flow signed by Privy end to end (docs/privy-standing-order.md section 7, tests 5 to 9); @privy-io/wagmi on Sepolia unverified (handoff line 87). OPINION: B2B is the stronger claim; the flow track rests on a run that has not happened.

Uniswap, Best Uniswap Stack Contribution, 3,000 USD open pool (FACT, tonight): "A public GitHub repository with open-source code, a FEEDBACK.md file, and a completed submission to the Uniswap Developer Feedback Form" linking FEEDBACK.md; "Make sure your README clearly points to the relevant contracts and lines of code"; entries "will be reviewed and audited before winners are finalized". Public chain: not required. Missing: repo public, form not submitted (answers at wiki/uniswap-feedback-form.md), FEEDBACK.md:79 to :81 three TODOs, README line references unchecked since WP16 (submission-checklist.md:42). Under Classic the Continuity pool does not apply.

## 3. Consistency defects a judge sees in five minutes (FACT, tonight)

- Track contradiction: README.md:11 "Classic entry" versus nachweis-app/DISCLOSURE.md:1 "# Continuity disclosure" and docs/ai-attribution.md:14 "Continuity entry". submission-text.md:85 still "Attestat is a Continuity entry".
- Commit counts: DISCLOSURE.md:69 and ai-attribution.md:22 say 145 commits on main; git says 289. DISCLOSURE.md:17 gives the relay branch 10 commits, 13 files, 3,589 insertions; track-decision.md:58 says 3,456; the handoff's "8 commits, 2,650" is itself stale.
- ai-attribution.md:52 says transcripts are in neither repository; one is committed in the wiki.
- Forge counts: 152 in docs/demo-runbook.md:14, :53, :409; 119 in docs/zkpassport.md:28, docs/showcase/backoffice.md:102 and :109, docs/showcase/savings-plan.md:81 ("same as main"). README.md:73 and docs/privy-standing-order.md:17 say 13 automation tests; the handoff counts 16 (unverified which file holds the extra 3).
- README.md:35 "nothing is deployed to any network", README.md:82 Privy TODO, FEEDBACK.md:9 "Nothing from this project is deployed on Sepolia as of 2026-09-09": true today, must change together or stay together.
- Gallery: 23 `http://localhost:5173` links across nachweis-site/showcase/index.html (9), links.js:12, and the five case pages (2 each). links.js:12 switches them all.
- Backoffice page: "not yet verified" no longer appears; showcase/backoffice/index.html:308 states the quorum was created on the free plan on 9 September. Resolved.
- Both wallet evidence records still say "Wallet version string: not recorded" (docs/evidence/g0-2026-09-08.md:10, browser-real-wallet-2026-09-08.md:8).

## 4. Minimal critical path (current scope)

1. Builder moves the three transcripts out (small). Agent adds a `*.txt` ignore rule in nachweis-app and the wiki and copies the wiki spec pages into nachweis-app/docs with a read order (medium; the wiki stays private because of its history).
2. Agent: one doc consistency commit: DISCLOSURE title and classes for Classic, ai-attribution counts and transcript sentence, stale forge counts, submission-text Classic rewrite, README:35 and :82 (medium, about 8 files to review).
3. Builder: written notice to ETHGlobal and check-in 2 before 2026-09-11 05:59 (small). Record channel and time in log.md.
4. Builder: funded Sepolia signer plus RPC URL; lead deploys the contract set (medium, builder-authorized). Optional for validity, required for any Sepolia sentence.
5. Builder: iPhone EUDI run against Sepolia, then the standing order, then the swap door; evidence records by the lead (large, all wallet clicks). Fallback per video-shotlist.md:34: anvil with "local chain" captions.
6. Builder: record the video in own voice, desktop screen recorder, 2 to 4 minutes, 720p or better (large, no fallback).
7. Builder: hosting for the live link. GitHub Pages serves the landing page; the browser prover needs COOP and COEP headers (app/README.md:20 to :27), which GitHub Pages does not send (documented behavior, not fetched tonight). Cloudflare Pages with a `_headers` file is the smallest option (small). If skipped, the live link is the landing page only.
8. Builder: flip nachweis-app and nachweis-site public, submit the Uniswap form with the public FEEDBACK.md URL, fill the ETHGlobal form with two partner picks, Privy and Uniswap (small each).
9. Agent drafts, builder confirms: FEEDBACK.md TODOs and the [deploy] sentences (small).

## 5. Risks without a fallback on Saturday

- Video: none exists; auto-reject on length and resolution; only the builder can speak it. No fallback.
- Public repository and Uniswap form: builder-only clicks; a private repo at 18:00 Vienna invalidates the Uniswap entry.
- Wiki transcript in git history: no fallback except keeping the wiki private and copying pages (step 1).
- iPhone wallet run on Sepolia: needs a cloudflared tunnel (scripts/g0-up.sh:27), the sandbox wallet and Sepolia gas. Fallback exists (anvil class W run, "local chain" captions), but then no Sepolia hash appears anywhere.
- Privy on Sepolia: @privy-io/wagmi 4.0.17 with the embedded wallet is unverified, gas sponsorship is off, every Privy wallet needs its own Sepolia ETH (handoff lines 69, 87, 138). Fallback: local-mode demos, which the project's own rule forbids calling a Privy run; the B2B claim then rests on the API-created quorum and policy plus the live refusal checks.
- COOP and COEP hosting: without a host that sends the headers there is no hosted browser prover; fallback is the landing page with "runs locally" notes, which a judge reads as unhosted.
- Check-in 2: a missed cutoff cannot be redone; whether it affects validity is unverified.
