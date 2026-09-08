# Official wallet through the browser path, 2026-09-08 (sanitized)

Run directory (private, gitignored): docs/evidence/private/runs/20260908-233432-browser. This file holds timings, hashes of public material, addresses on a throwaway local chain and status codes. No names, no presentation, no pickup token.

## Setup

- nachweis-app main e3b5ec3 (WP29 browser path, WP30 stack script), `scripts/browser-real-wallet-up.sh`: anvil, contracts with NoirPidVerifier pinned to the sandbox PID issuer key hash 0xb4f2bfa1df99f06e588d39931b2cfd517a2befe8737c7f86bfa5c668d2abe079 (from the G0 record), EudiAllowlistChecker, bridge in local mode with a fresh issuer token and REQUIRE_ADDRESS_PROOF, verifier (relay branch 7262a32) in relay mode with the registrar leaf behind a cloudflared quick tunnel, app dev server with COOP and COEP and the anvil dev signers.
- Phone: the builder's iPhone with the official German EUDI test wallet (sandbox, sample identity). Wallet version string: not recorded (builder to add).
- Browser: Google Chrome on the M3 Max, hand-clicked by the builder, 16 threads, cross-origin isolated.

## What happened (FACT, builder's screen and the lead's chain and log reads)

1. Investor connected the dev signer (0x7099...79c8), created the presentation request (EIP-191 session signature accepted by the bridge), selected "In this browser" and started it; the tab created the relay request and showed the openid4vp QR whose request_uri is on the tunnel host.
2. The builder scanned the QR with the official wallet and consented. The tab ran requesting, waiting, pickup, checking, witness, init, proving, verifying, submitting, submitted: "attested from this browser" after 42.8 s (worker: jwe_decrypt 2 ms, precheck 2 ms, gen_inputs 1 ms, witness 1,244 ms, bb_init 1,466 ms, prove 11,089 ms, verify 4,041 ms). Proof 10,304 bytes, 86 public inputs, verified in the tab. Public inputs shown: subject 0x7099...79c8, issuer key hash 0xb4f2bfa1...e079, over 18 = 1, expiry 2026-09-22T00:00:00Z (1790035200).
3. Chain after attest (lead, cast): statusOf (hasDecision true, approved false, revoked false, expiry 1790035200); attest tx 0xccc8f30afa2118ce80b7cf44563882ea9ace83dade615d39310bdc3cb2cb08ae status 1, gas 4,582,956. Doors closed: evidence alone is not eligibility.
4. Issuer screen: Approve with the operator dev signer, tx 0x836371ec... to the registry (approve selector). Chain: statusOf (true, true, false, 1790035200), isEligible true.
5. Investor screen: Subscribe, tx 0x3ba17dda0d5edd94cfb87b2d76789085bd99ff65e374577a271e7a45ba181e57 to the Subscription contract; FundToken balance 100 NDF (100000000000000000000 wei units).
6. Logs after the run: verifier, bridge and app logs contain zero claim names; the verifier log has exactly one "stored the wallet's encrypted response unopened" line; the bridge refused no request.

## What this establishes

The main route works end to end with the official wallet and no install on the user's side: wallet presents to a blind relay, the browser tab decrypts and proves, the registry stores evidence, the issuer's separate approval opens the fund door. Compared with the G0 companion run (4.4 s native), the browser proof took 11 s and the whole click-to-attested 42.8 s in a hand-clicked session (the Playwright smoke test measured 32 s).

## Not established here

Sepolia (this was anvil), the Uniswap pool swap in the browser (the checker was deployed and reads the same registry; the swap door was not clicked in this run), revoke and re-approve in this session (covered by scripts/real-proof-local.sh on the same presentation earlier tonight), mobile browsers.
