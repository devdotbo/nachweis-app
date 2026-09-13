---
type: plan
title: Finalist preparation 2026-09-14: timeline, the five-minute live script, judge questions, failure modes, what not to say
updated: 2026-09-13
status: pending until the Round 1 mail arrives; builds on handoff-2026-09-13-night.md "Tomorrow, 2026-09-14, in order" and does not repeat it
sources:
  - wiki/handoff-2026-09-13-night.md (judging process from the ETHGlobal mail, the demo order, the fallback links, known limits)
  - wiki/video-script.md (beats 0 to 10), video-take-2026-09-13/take-transcript.srt (the builder's freestyle of 2026-09-13)
  - nachweis-app/docs/evidence/sepolia-phone-2026-09-12.md (hashes, timings, proof size, gas)
  - nachweis-app/README.md (honesty box), docs/ai-attribution.md, docs/sepolia-checklist.md, .env.example
  - nachweis-app/docs/hosting-server.md and docs/hosting-app-vercel.md
  - the canonical copy file of 2026-09-13 (scratchpad canonical-copy.md, forbidden list) and the lead's brief of 2026-09-13 evening
---

# Finalist preparation 2026-09-14

Labels: FACT (read at the source, cited), CLAIM (lead's brief or a third party, not read at the source), OPINION (recommendation), unverified.

Precondition (FACT, handoff-2026-09-13-night.md): Round 2 happens only if the Round 1 mail says the project passed. The demo order and the known limits are in that page.

## (a) Timeline for Monday

Round 2 is live on 2026-09-14 at 12:00 EDT, 18:00 Vienna (FACT, the ETHGlobal form text the builder pasted: "present their project live to the panel of judges on Monday, September 14th 2026 at 12:00 pm EDT", lead's session record 2026-09-13, export pending as [local path, withheld]; platform not named). Open at 17:30 Vienna:

1. Chrome tab 1: https://app.attestat.dev, MetaMask on a fresh funded investor, eligibility "not permitted". Tab 2: https://app.attestat.dev/issuer, MetaMask on the operator 0x452A376805821aD33D2F01c9134Ba5E26455900a for Approve and Revoke (FACT, hosting-server.md:91). Tabs 3 and 4: the 2026-09-12 swap https://sepolia.etherscan.io/tx/0xda990178ec3a1a972244ab280415eabac693944ec7a6efd81e5317eb29facd4b and refused swap https://sepolia.etherscan.io/tx/0x85e554b8ffc73f617c25275a636d216e7bd0c9adf36e4a307e8355e8d957d9f9. Tab 5: the registry on Etherscan, Read Contract. Tab 6: http://127.0.0.1:8790/cards.html from video (`python3 -m http.server 8790 --bind 127.0.0.1`).
2. Phone: charged, the official test wallet opened once, camera ready; the phone path against relay.attestat.dev is verified (FACT, hosting-server.md:90).
3. Balances and state by public RPC, no key involved:

```
RPC=https://ethereum-sepolia-rpc.publicnode.com
cast balance 0x452A376805821aD33D2F01c9134Ba5E26455900a --rpc-url $RPC --ether   # operator, also the bridge's attest signer
cast balance <investor> --rpc-url $RPC --ether                                      # expect 0.02
cast call 0xeD46dC419e826c9Fdf16aADe1C9e3e970cc8ad53 "statusOf(address,bytes32)(bool,bool,bool,uint64)" <investor> 0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f --rpc-url $RPC   # expect false,false,false,0
```

FACT (2026-09-13 18:27 Vienna): operator 0.185 ETH, nonce 59; gas price 0.97 gwei; one attestWithProof (4,582,644 gas) is about 0.0045 ETH at that price. OPINION: keep the operator above 0.05 ETH.

4. Services: `ssh cloud 'systemctl is-active attestat-relay attestat-bridge'` (FACT: both active since 15:48 and 15:49 CEST, 2026-09-13), then `curl -s https://bridge.attestat.dev/health` (expect operator 0x452a...900a).
5. Fresh investor. FACT (.env.example:8; lead's session record 2026-09-13): dated names, the take wallets are INVESTOR_TAKE_20260913_*, INVESTOR_TAKE2_20260913_* (0xFC619fFC5DA7d203C76e9a96a313946a2dD092ef) and INVESTOR_TAKE3_20260913_* (0x9bEe2B9e9C54aC2C00fe4297Bf6C43a3BDb44f16, funded 0.05 ETH from the operator, tx 0xceeaeac8e98ff45b3f77d1ab9de1dde746fce26fed5b0d0cdf76b4417a7987e4). One command appends the next and prints only the address:

```
cd nachweis-app && cast wallet new --json | jq -r '.[0] | "INVESTOR_TAKE4_20260914_PRIVATE_KEY=\(.private_key)\nINVESTOR_TAKE4_20260914_ADDRESS=\(.address)"' >> .env && grep -o '^INVESTOR_TAKE4_20260914_ADDRESS=.*' .env
```

The builder imports the key into MetaMask from .env himself and funds 0.02 ETH from his own MetaMask account, not from the operator (lessons-2026-09.md). If the operator must fund, check its balance first:

```
(set -a; . nachweis-app/.env; set +a; cast send "$INVESTOR_TAKE4_20260914_ADDRESS" --value 0.02ether --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$SEPOLIA_RPC_URL")
```

6. Rehearsal at 17:40 with a throwaway investor through Approve (FACT, handoff-2026-09-13-final.md: the take's swap was refused because Approve was skipped). The demo investor stays untouched.

## (b) Five-minute live script, nine lines

FACT (lead's session record, 2026-09-13, export pending): written by the lead at 17:15 after the builder said of the second script draft "that pitch is even worse than mine to be honest"; the take freestyled from it. Verbatim, one line per screen; line 9 carries the four honesty points that must be said (test wallet and sample identity, simulated checks, manual revocation, proof made in the browser). OPINION on timing: about 25 s per line, the block waits are the buffer.

1. Passport in hand: Every fund I ever invested in has a copy of this. I want to show you a way to invest without handing it over.
2. Landing page: Attestat. The EU is giving everyone a government ID wallet on their phone. We make it work where you invest.
3. App, not permitted: This is an investor. Her wallet is not allowed in yet.
4. Phone scan: She answers with the official German test wallet. Name and over 18 go to her browser, nowhere else.
5. Proof running: Her browser now proves she is over 18, in zero knowledge. Only the proof hits the chain. No name.
6. Issuer approves: The issuer says yes in its own step. The chain now holds one record: eligible, until this date.
7. Door one, door two: The fund token lets her in. A Uniswap permissioned pool lets her buy, same record, no second scan.
8. Revoke: The issuer changes its mind. One click. Both doors shut, and the pool tells you which contract said no.
9. Close, must say: Test wallet, sample identity. Sanctions checks simulated. Revocation manual. Proof made in the browser. The pool never learned about EUDI, it read one record.

Close on card 3. Do not add the incident sentences of the take (section e); the plain-voice beats of video-script.md are the reserve if a judge asks for more on any line.

## (c) Likely judge questions, short honest answers

- Why not wallet-side ZK? FACT: no ZK scheme selected in the ARF, wallet-side proving expected after launch (narrative-zk.md); a wallet proof needs a verifier adapter on the registry interface, not built (site index.html:245).
- What does the chain hold; does the address link to a person? FACT: one record per address and policy (policy id, predicate bits, tier, expiry, status reference, revoked flag; sepolia-phone-2026-09-12.md:29). "No name or identity document is published; the public address may still be linked to a person." (README.md:25)
- What is simulated? FACT: sanctions, residency and every other issuer check; the wallet is the official test wallet with a sample identity; revocation is manual (README honesty box).
- Why does the issuer approve separately? FACT: isEligible needs evidence plus approval (README.md:21, docs/spec-issuer-approval.md). A predicate is not customer due diligence; the issuer keeps the decision.
- What Uniswap code is new? FACT: Uniswap's permissioned-pool contracts as deployed on Sepolia plus EudiAllowlistChecker.sol, 41 lines (27 to 67): swap and liquidity allowed iff registry.isEligible; the quote comes from slot0 because the quoter cannot quote the hooked pool (form-paste-2026-09-13.md).
- What happens on revoke? FACT: Subscribe reverts NotEligible(); the swap reverts in PermissionedHooks.beforeSwap with Unauthorized, decoded on chain (sepolia-phone-2026-09-12.md:41 to :42).
- Why Sepolia? FACT: deployed 2026-09-10, source-verified 2026-09-13, not audited (night handoff); the wallet is a sandbox, so a mainnet decision would rest on sample data.
- Privy? FACT: attempted on the public origin 2026-09-13, blocked by the COEP header the browser prover needs, documented with two candidate fixes (hosting-app-vercel.md); not claimed.
- What would a real issuer need? FACT: the compliance file stays, customer due diligence is not replaced (product.md:23); the Noir route checks no x5c chain, status list or freshness window (README).
- Commercial validation? FACT: none. "No named operator has yet said which step Nachweis would replace; that is the business gate after 2026-09-13." (product.md:21)
- How much did AI write? FACT, verbatim from docs/ai-attribution.md: "The code in this repository and on the verifier's relay branch was written by Claude Code agents (Anthropic models Fable 5.1 and Opus, run as a lead session with teammate and subagent sessions) working from written work packages"; "It does not give percentages, because nobody measured them; the commit history and the wiki log are the record."
- Proof size and cost? FACT (sepolia-phone-2026-09-12.md:28 to :29): 10,304 bytes, 86 public inputs in the tab; a 13,184-byte proof argument on chain; prove 11.0 s, verify 4.0 s on the builder's Mac, 16 threads; 4,582,644 gas.
- The SP1 fallback? FACT: the same statement in the SP1 zkVM on the issuer's server, Groth16 wrap, Sepolia fork only; "the chain does not trust the server, but the server did see the presentation" (README honesty box).

## (d) Failure modes and fallbacks

- Relay or bridge down: `ssh cloud 'sudo systemctl restart attestat-relay && sleep 2 && curl -s http://127.0.0.1:8090/health'`, same for attestat-bridge with :8787/health (FACT, hosting-server.md:62 to :65). CLAIM (hosting-server.md:93): a bridge restart drops open sessions; restart before the session signature, never after.
- Phone scan fails: say so, show tabs 3 to 5. The 2026-09-13 take has no evidence record yet (night handoff, open item 5), so the 2026-09-12 links are the fallback.
- MetaMask prompt storm: pin the extension so the popup stays put; nine confirms in total (FACT, lead's session record from the 2026-09-12 hashes): one signature, six investor transactions (subscribe, faucet, approve, Permit2, execute, refused swap), approve and revoke from the operator account. Wrong account is the likeliest error: read the address in the top bar before each click.
- Proof slow: keep the page, speak line 5 and the ARF sentence; never reload (a reload empties the pending presentation, video-script.md checklist).
- Operator out of gas (the bridge answers "-32003 insufficient funds for gas * price + value", as at 17:20 on 2026-09-13; no decision is written): send 0.05 ETH from the builder's MetaMask account to 0x452A376805821aD33D2F01c9134Ba5E26455900a, wait one block, retry; confirm with the cast balance line above.

## (e) What not to say

FACT (canonical copy of 2026-09-13, "Forbidden in public copy"): "SDK", "toolkit", "any kind of KYC", "KYC" (except the Uniswap form field name), "hacked", "153 million people", any Revolut victim count, "nothing about you on chain", "safer", "safe and secure", any claim that Attestat would have prevented an incident, "the only way to hold less", "the EU lacks ZK", "Finance has to accept it" (unconditional), "first", "only", yield figures, Revolut as partner or prospect. From product.md:44 to :48: never "real state-issued identity", never "on the device" for a proof made on the Mac. The take of 2026-09-13 said "KYC", "they got hacked, they have a leak" and "something that the European Union still doesn't have" (take-transcript.srt); none of it is repeated live.
