---
type: reference
title: Privy business cases: index
updated: 2026-09-09
sources:
  - /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/BRIEF.md
  - the five case directories and evaluation.md in this directory (all 2026-09-09)
---

# Privy business cases

Five teammates each wrote one case for a product built with Privy on top of Attestat's on-chain eligibility decision, following the shared brief. A sixth teammate scored them and recommended one to build in the week to 2026-09-12. The cases not built stay here as documentation. Each directory holds `case.md` (the case, template in BRIEF.md) and `research.md` (fetched Privy, legal and code facts with URLs and dates).

| Directory | Lens | One line | Primary track | Score (evaluation.md) |
|---|---|---|---|---|
| /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/agents/ | agents and automation | The issuer's automation runs a standing order from the investor's embedded wallet through a signer whose policy copies the decision's expiry and is closed on revoke | B2B, financial flow also | 34, recommended |
| /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/lifecycle/ | lifecycle | An attested savings plan: delegated signer under a subscribe-only policy, a second issuer's instrument, a transfer to another attested wallet, one revoke closes every door | B2B, financial flow also | 29 |
| /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/backoffice/ | issuer back office | The registry's operator is a Privy server wallet owned by a 2-of-2 key quorum under a policy limited to approve and revoke, driven by intents raised from Attested events | B2B | 29 |
| /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/investor-money/ | investor money | An email investor with an embedded wallet subscribes, claims distributions and redeems in a test stablecoin through a new FundDesk contract; every movement checks the decision | financial flow | 27 |
| /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/other-buyer/ | other buyer | A company pays contractors from a quorum-owned treasury wallet whose policy confines it to a GatedPayout contract that pays only attested adult addresses | B2B, financial flow also | 23 |

Evaluation, ranking, settled Privy feature facts, the build scope, the fallback, acceptance tests and the builder's morning steps: /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/evaluation.md

Shared brief and page template: /Users/bioharz/git/ethglobal/nachweis/wiki/privy-cases/BRIEF.md

Two facts from the evaluation that every reader of the case pages needs (FACT, evaluation.md section 3): the pricing page ticks the policy engine and key quorum approvals for the Developer plans (the "Available as add-on" label belongs to the Advanced SSO row; two research files read it wrongly), and policies and signers require TEE execution, which an app created in 2026 is expected to have by default but which the builder must confirm in the dashboard first thing.
