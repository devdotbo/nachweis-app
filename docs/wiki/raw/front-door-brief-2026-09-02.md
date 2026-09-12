---
type: topic
title: Front-door brief for Crossfoot (pitch, sentences, page hierarchy, video, event feature), 2026-09-02
sources:
  - raw/codex-qa-stop-ship-verdict-2026-09-02.md
  - raw/codex-pitch-verdict-2026-09-02.md
  - raw/grok-pitch-verdict-2026-09-02.md
  - raw/codex-review-verdict-2026-09-02.md
  - wiki/finalists.md
  - wiki/jury-patterns.md
  - wiki/sponsor-setup-checklist.md
  - wiki/hackathon-playbook.md
  - wiki/build-status-2026-09-02.md
  - wiki/submission-draft.md
  - wiki/product-vision.md
  - wiki/competition-odds.md
  - wiki/thesis2-grounding.md
updated: 2026-09-02
---

# Front-door brief

Written 2026-09-02 (evening) from the user's question ("it is very hard to pitch, does the jury understand it, who won before, is the problem real, what is missing beyond the mechanical points") and the three answers to it: Codex (raw/codex-pitch-verdict-2026-09-02.md, two notes), Grok (raw/grok-pitch-verdict-2026-09-02.md, two notes) and Fable (this session; transcript export [session transcript, not published]). All three read the same wiki pages and the same live site, so their agreement is one diagnosis three times, not three witnesses; it is evidence that the current front door is confusing, not evidence that the fix will win. This page is the settled result. Where the three disagreed, the resolution is stated and the loser is named. Everything here is own synthesis unless a source is cited; the facts about the live site come from screenshots taken on 2026-09-02 (Fable, Grok) and from the fresh-clone QA (Codex). The wording rules of [[thesis2-grounding]] still bind every public sentence.

## Diagnosis

The problem is real and narrow: issuer-posted collateral values, two setters behind one admin role, one on-chain check that may or may not run, and a reader interface that cannot tell (facts in [[midas-feed-family]] and [[product-vision]]). The product is finished enough (state in [[build-status-2026-09-02]]). What is missing is a claim, a scene and one thing a judge can do. Every live surface leads with method: the landing's first card is the ACTUS engine, the explorer opens with a deployment hash strip and a 106-row table, the mRE7 page puts twenty key-value rows (half of them zeros) above the one chart that carries the whole pitch, and the decisions page reads like a CI console. The honesty rules were written for the method page and the disclosure and were applied to every surface, which drained the claim out of the pitch. The playbook already had the cure ([[hackathon-playbook]], item 5: one question as submission title, h1 and first spoken line) and the build shipped the engine README as the homepage instead.

Who understands the product today: the builder, a Graph engineer, a risk analyst who reads the method page. Not a Graph marketing juror in ninety seconds, not a finalist judge coming off forty agent-payment demos, not a stranger on the landing page. Judging at ETHOnline is asynchronous ([[ethonline2026]]): a three-minute video, the description, at most one click on the live link. Surviving the screening is a package game and the finalist cut needs a sentence a non-expert repeats ([[competition-odds]], [[finalists]]).

What previous winners pitched ([[finalists]], [[jury-patterns]], [[sponsor-setup-checklist]] for the Graph Lisbon 2026 cohort): every finalist has a one-line value proposition with a villain or a beneficiary. Audit and accountability tools do make finals (npmguard, Proof of Scan, KOLlateral, ENShell), each naming who is held accountable in the first sentence. The Graph Continuity first place at Lisbon 2026 (EQLTY) won on "stale data blocks the candidate rather than quietly weakening the run", which is Crossfoot's freshness gate word for word; Graph winners were not fancy (Am I cooked is a joke with a seal, Pista is a pipeline, Atlas turns a question into an app). Nobody won on visual spectacle; the Bauhaus stays.

## The settled direction

One person: a vault curator or protocol risk reviewer.
One decision: keep this asset as collateral, or investigate.
One incident: mRE7 on 2026-05-06.
One interaction: check the feed.
One result: REVIEW, in plain language.
One proof: a bundle that reproduces without the network.

The spectacle is a path that latestRoundData does not show, made visible, then made re-runnable. Not Bauhaus, not animation, not 15 families and 106 feeds. The written product keeps two verbs, path replay and value recomputation, with svZCHF as the second object; without it a juror reads a bypass detector and Midas's "documented high-deviation process" lands as a complete reply (Grok note 2, accepted).

## The sentences

Every sentence below stays inside [[thesis2-grounding]] (no "first", no "only", no bare "recomputes", no "wrong NAV", no "bypass" as an accusation, one key is one on-chain key). Character counts are for the ETHGlobal form ([[submission-draft]], section 8).

- Title, h1 of the landing, first spoken line of the video, all identical (the Augenmass rule): Did this collateral feed follow its own rule?
- Tagline (75 characters): Independent check on issuer-posted collateral values. Proof you can re-run.
- Short description: Crossfoot replays each feed's own on-chain controls at pinned blocks, from public data, and returns ALLOW or REVIEW with evidence a third party re-runs offline.
- Product frame for the long description: Crossfoot helps DeFi risk teams verify whether issuer-posted collateral values followed their expected on-chain controls. The feed monitoring, the policy, the bundles and the replay support that promise; they are not the opening explanation.
- Demo question, second spoken line, over the mRE7 chart, and on the mRE7 page (never the homepage h1): Would you keep this as collateral after May 6?
- The mRE7 paragraph (Grok note 2, replaces every "looked normal" line): The number arrived the way every other round does: one event, one latest answer. The contract advertised a 0.36 percent check. This update moved 2.2 percent on the other setter. We do not say the NAV is wrong. We say the advertised check did not run, and a lender cannot see that.
- Closing line of the video (four items on screen, from [[submission-draft]] section 7 beat 6): consistency is not recomputation; INPUT_GAP is a finding, not a failure of the tool; one key is not one person; this is evidence, not an auditor's opinion.

Retired wording, with the reason:

- "The value looked normal" and "a normal dashboard showed nothing wrong" (Codex note 1 and 2, Fable's first verdict): false. 1.08859885 to 1.06438116 is a visible 2.2 percent jump; any price chart shows it and a deviation monitor fires. What was invisible is the path.
- "Unexpected caller" (Codex note 1): false. Same key, different setter.
- "Would you approve this update?" (Codex note 1): wrong person. The issuer posts; the lender decides whether to keep the asset.
- "Safety console for people deciding whether to trust a DeFi price feed change" and the chain feed, wrapper, underlying rate, caller (Codex note 1): describes a product Crossfoot mostly is not; mRE7 has no wrapper and no underlying rate in that sense. Do not draw a product you do not have.
- "57 updates" as a claim about the live product: see the counting rule below.

## Counting rule: 57 versus 29

Facts from [[build-status-2026-09-02]] (families table and the DEPLOYMENT.md facts): the Rust replay and the downloadable bundles attribute all 57 unchecked posts over the bound on 16 feeds (29 external on 14, 28 Safe-routed on 3), and the mRE7 feed page shows the Safe chain per round. The live event-only subgraph version leaves the 215 Safe-routed rounds as path UNKNOWN, so the live Graph-side decision view attributes the 29 direct posts and the consumer routes the unattributable rounds to REVIEW as PATH_NOT_ATTRIBUTABLE; only the call-handler version can carry the 57-on-16 count, and it was still syncing at the time of writing. Rule: say 57 only where the bundle is the source on screen; where the subgraph is the source say "29 attributed live, unattributable rounds routed to review". Name it as a strength in the Graph beat ("unattributable goes to REVIEW, never to ALLOW"), which is the fail-closed behaviour the Continuity judge rewarded in EQLTY. Flattening it to 57 everywhere is a false claim.

## Page hierarchy

The order on every surface is: what happened, why it matters, what should I do, then the technical evidence. Today most pages start at the fourth level (Codex note 1, accepted by all).

- Landing (crossfoot.tech): the h1 question, the mRE7 timeline chart (already built on the feed page: blue rounds, the yellow bound step, one red round) with the mRE7 paragraph beside it, one button to the mRE7 page. Second screen: the 66-square field with one caption ("red: at least one update without the on-chain check"), as the "then it does this across the family" reveal. Below the fold: the two verbs (path replay, value recomputation with svZCHF as the exact control), the verify command, the release link. Off the fold: ACTUS, INPUT_GAP, "the binary issues chain reads", the verdict vocabulary, the survey table. Resolution of the hero dispute: Codex (single incident) over Grok's first note (the grid); Grok conceded in note 2 (Augenmass was a census, Crossfoot's hook is an incident).
- Explorer index (app.crossfoot.tech/feeds): the 66-square field is the hero here. The black provenance strip moves to the footer. Bug to fix first: the strip shows a Cronos block (91,260,041, the TONIC window) as "Crossfoot window block" next to an Ethereum decision run (seen in the 2026-09-02 screenshot; Grok saw the same).
- Feed page: chart first, the yellow decision block second with the plain-language reason, the evidence bundle and the verify command third (they are the proof line and stay visible), the key-value rows collapsed behind "details", findings and eras below.
- Decisions page: not a demo surface until the correctness fixes are deployed. No ALLOW count on any hero until pagination is fixed and the EURSAFO case from the QA verdict is re-checked against the corrected run.
- Nav: Watchlist, Alerts and Account come off the hackathon surface (Codex for security, Grok and Fable for focus; both reasons hold). Registration disabled or the routes hidden until the account findings are fixed.
- Method page: keeps every caveat and every rule; it is where the honesty discipline belongs. It also carries TONIC under limitations ("Crossfoot as it stands would not have detected or prevented Tectonic", [[cronos-incident-2026]]). TONIC is not in the video.

## Video, 3:30

Replaces the storyboard of [[submission-draft]] section 7 and [[crossfoot-build-plan]], which opened on forty-five seconds of terminal and a residual table of zeros. Timed script from Grok note 3 (raw/grok-pitch-verdict-2026-09-02.md), accepted with the corrections listed after it. Voice is the builder, not synthetic. Screen is the live site, one Studio tab, one verify. No terminal first, no ACTUS, no 106-row table.

1. 0:00 to 0:15, the question. Black title, the h1 words. Voice: tokenized funds are becoming collateral; their value is posted by an issuer key; lending markets read the latest number; they cannot see which path wrote it.
2. 0:15 to 0:55, the scene. The mRE7 chart, blue rounds, the yellow bound at 0.36 percent, one red round. Second spoken line: the demo question. Over the two numbers (1.08859885 to 1.06438116): the mRE7 paragraph. Click the red round: the transaction, the yellow REVIEW, one reason in plain language, never ADMIN_GUARD_BYPASSED as the headline. The judge's eye has to land on the red square and understand it without a legend.
3. 0:55 to 1:25, why it matters. Split screen: left, the latestRoundData shape a lender reads (drawn generically, not a named protocol's interface); right, Crossfoot showing two setters, one with the check, one without. Voice: if you price this as collateral you inherited the poster's choice, and nothing at the interface you already read told you which choice it was.
4. 1:25 to 2:05, the thing they can do. One field, product name or address; type mRE7 or click the preset; the story returns in under two seconds: REVIEW, the round, the transaction, the bound, the setter. Then the Graph is shown load-bearing: the decision cites deployment, block and query; one second of Studio so a Graph juror sees a live subgraph, not a fixture. Voice: the posted side comes from a live subgraph at chain head; if the path cannot be attributed the answer is REVIEW, never ALLOW; the model does not guess. If the check-a-feed page is not built when recording, film this on the mRE7 feed page plus one Studio tab; do not wait.
5. 2:05 to 2:25, they do not have to trust you. Download the bundle from the page, ten seconds of crossfoot verify, exit code 0, the root hash matching the page. Voice: anyone re-runs this offline and gets the same hash; that is the product, not the dashboard.
6. 2:25 to 3:05, not a one-off. The 66 squares with one caption. Voice: one family on Ethereum, sixteen feeds had that path; the same check runs across other issuer-posted feeds; where the terms are on chain the value is rebuilt as well, Frankencoin's savings vault matches to the last digit. One sentence for svZCHF, no residual table, no TONIC, no ALLOW count.
7. 3:05 to 3:30, limits, then stop. Four lines: consistency is not recomputation; we cannot see the portfolio, so we do not invent a NAV; one on-chain key is not one person; this is evidence, not an auditor's opinion. Last spoken line: Crossfoot does not tell you the number is wrong; it tells you whether the advertised rule ran, and it proves it.

Corrections to the script as pasted: "the setter that skipped it" in Grok's framing sentence is retired wording (the public phrase is "took the documented path without the on-chain check" or "the advertised check did not run"); the lender interface on the split screen is drawn generically, never as a named protocol's product; "kill the subgraph and the live decision dies" is true by design (the consumer queries Studio live with a freshness gate, [[build-status-2026-09-02]]) and may be said as "the live decision comes from the subgraph at head".

The sentence a judge should be able to repeat with the tab closed: there is a collateral feed that advertised a 0.36 percent check; one update moved 2.2 percent on the other setter; Crossfoot showed that from live Graph data and I could verify the file myself.

If a judge clicks the link instead of watching: the landing is the question, the chart and one button ("See what happened on May 6"); that button is the only path that matters (chart, REVIEW, transaction, download); the optional second click is the 66 squares; nothing routes them to Watchlist, Account, Decisions or the 106-row table. That path must not fail; it is the video, frozen.

## The event feature (post-kickoff, judged)

One feature, not two (Codex note 2 merging Fable's ask surface with Codex's decision dossier, accepted by all): check a feed. Address or product name in, the story out (what happened, why it matters, ALLOW or REVIEW with the plain reason, the transaction), then the causal evidence, then the exact Graph inputs (query, variables, response body, deployment ID, block), then a downloadable dossier that crossfoot verify replays without the network. The same deterministic result is exposed through MCP for agents (the SKILL.md and the consumer already exist per [[build-status-2026-09-02]]); no chatbot, MCP is a second door to the same system. Staging (Grok note 2, accepted): ship "address in, story out" on live Graph data first, then persist the Graph response bodies in the bundle as the substantive Graph work (Studio prunes history, the bodies currently survive only in seven-day workflow artifacts per the QA verdict), then teach verify to replay the decision from them. Hashes alone are not the event work. If the body storage slips, the ask page still stands; if both slip, the submission is another table of hashes.

This is the AI Tooling wording of the Graph Continuity track ([[sponsor-setup-checklist]]) and, through MCP, the Bazantic "help an agent use your project" track ([[continuity-track]]); the partner cap of three stays as in [[crossfoot-build-plan]].

## Sequence and review burden

No time estimates; sizes are review burden. Status 2026-09-02 late evening: step 1 applied in the local checkouts and uncommitted (log entry "hygiene step 1"); the consumer fix reaches production after a push, because the refresh workflow builds the CLI from the GitHub main branch.

1. Hygiene, before kickoff, unjudged, from the QA verdict (raw/codex-qa-stop-ship-verdict-2026-09-02.md): fail-closed decision ingestion (pagination, truncation detection, per-feed block filtering, cardinality assertions); hide or mark the ALLOW count until the corrected run is served; accounts off the nav or registration disabled; true privacy pages on site and app; honest Continuity text on the method page and in [[submission-draft]] (no "all Crossfoot-specific code written during ETHOnline", no "new since kickoff" for the subgraph, agent and adapter); the Cronos block in the feeds strip. Medium: several small diffs across three repositories, one decision point (hide ALLOW versus label the run incomplete).
2. Front door, before kickoff, unjudged: the sentences above on landing, explorer, feed page, method page; the chart moved up; details collapsed; nav trimmed. Small to medium: copy and reordering of existing components, no new data.
3. After kickoff, judged: check a feed, staged as above. Medium for the ask page, medium to large for body storage and replay.
4. Video in the order above, after 3 exists.
5. Not now, from the QA verdict but not on the critical path for the pitch: a new release from main that verifies all fifteen roots with the policy and family configs packaged; atomic refresh; fast-forwarding the local checkouts (crossfoot 39 commits behind its remote, the app 84, per Codex). Do the release before the video so the verify beat uses a published binary.

## What not to do

Do not pivot. Do not restyle into a generic hackathon look (gradients, glass, 3D). Do not add a chatbot. Do not add sponsor integrations (x402, Polar, Arc, Chainlink stay out, all three notes). Do not put the demo question on the homepage h1. Do not say the value looked normal. Do not say 57 where the subgraph is the source. Do not show ALLOW until it is trustworthy. Do not treat three-model agreement as a jury. Do not present a verification institute; present one feed, one check that did not run, one decision, one proof.

## Unverified

- The Graph Lisbon 2026 winner descriptions beyond what [[sponsor-winners]] and [[sponsor-setup-checklist]] already hold come from Grok's own fetches and were not re-fetched here.
- Whether the call-handler subgraph version has reached head since [[build-status-2026-09-02]] was written; the counting rule assumes it has not.
- The exact state of the local checkouts versus the remotes (Codex's 39 and 84 commits) was not re-checked here.
