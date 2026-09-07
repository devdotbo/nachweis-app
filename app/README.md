# app

Demo front end for Nachweis: a token issuer accepts identity evidence from the German EUDI test wallet (sample identity) through the Rust verifier-service, approves it, and the approval becomes an EligibilityDecision in the AttestationRegistry on Sepolia. FundToken transfers and the Subscription contract read that decision; a Uniswap permissioned pool (WP7) will read it too. Revoke closes both doors.

Vite, React 19, TypeScript, wagmi v2 and viem, plain CSS. Package manager: bun.

## Run

```
cd app
cp .env.example .env      # fill in Sepolia addresses, or set VITE_MOCK=1
bun install
bun run dev               # http://localhost:5173
bun run typecheck         # tsc --noEmit
bun run build             # typecheck + vite build into dist/
```

Mock mode (`VITE_MOCK=1`) runs the whole flow in memory with fake delays: mock wallets, a mock verifier that "presents" the sample identity after four seconds, and a mock registry. No network calls. Use it to record the video even if a chain step is red.

## Environment

| variable | meaning |
|---|---|
| `VITE_VERIFIER_URL` | verifier-service base URL |
| `VITE_VERIFIER_MODE` | `service` (current `/zk/` endpoints) or `relay` (planned blind-relay endpoints) |
| `VITE_REGISTRY` | AttestationRegistry address on Sepolia |
| `VITE_FUND_TOKEN` | FundToken address |
| `VITE_SUBSCRIPTION` | Subscription address |
| `VITE_POOL` | optional Uniswap pool; the Swap door stays disabled until set |
| `VITE_POLICY_ID` | bytes32 policy id the issuer attests under |
| `VITE_REQUIRED_BITS` | bits the issuer sets on approval and the doors require (default 3: bit 0 identity evidence, bit 1 over 18) |
| `VITE_RPC_URL` | optional Sepolia RPC, defaults to viem's public endpoint |
| `VITE_MOCK` | `1` for mock mode |

## Screens

One app, two roles switched in the header.

Investor: (1) connect wallet (injected connector), (2) Present your ID: creates a presentation request at the verifier-service, shows the QR code and the openid4vp link, polls the outcome, (3) Eligibility: not permitted / presented, awaiting issuer / permitted, with the on-chain Decision from `decisionOf` and the bits as labelled flags, (4) two doors: Subscribe calls `Subscription.subscribe()`, Swap is disabled until `VITE_POOL` is set; both show open or closed from `isEligible`, (5) What the chain sees: the raw Decision and the line "no name, no document".

Issuer: (1) connect operator wallet, (2) presentations created in this browser session with the claims summary the verifier-service exposes (memory only, gone on reload), Approve calls `attestByOperator(subject, Decision)` with the policy id and bits from env, tier A, expiry now plus 30 days, statusRef = keccak256(session id); Revoke calls `revoke(subject, policyId)`, (3) revoke by address for subjects without a session, (4) event log of Attested and Revoked (last 50,000 blocks, refreshed every 8 seconds).

## Verifier client (`src/verifier.ts`)

`service` mode uses the endpoints the verifier-service exposes today: `GET /zk/` creates an mso_mdoc_zk request (`session`, `authorization_request`), `GET /zk/result/:id` returns `verified` with a `disclosure_statement` or `rejected`, 404 while pending.

`relay` mode implements the planned blind-relay endpoints (`POST /relay/request`, `GET /relay/status/:id`, `GET /relay/response/:id` with `X-Pickup-Token`). The browser generates an ephemeral P-256 ECDH key with WebCrypto, keeps the private key in memory only, and shows the nonce `sha256(bound_address_bytes || challenge_bytes)` next to the relay's. Decrypting the JWE (ECDH-ES, A128GCM) is a stub: the response is shown as an opaque encrypted blob.

## Wallet

`src/lib/WalletProvider.tsx` wires wagmi with the injected connector on Sepolia. A Privy provider can replace the body of that component later; the rest of the app only uses wagmi hooks and `useWallet()`.

## ABIs

`src/abi/*.json` are the `abi` arrays extracted from `contracts/out/<Name>.sol/<Name>.json` after `forge build` in `contracts/` (Solidity 0.8.28). Regenerate with:

```
cd contracts && forge build
cd ../app && for c in AttestationRegistry FundToken Subscription; do bun -e "const j=await Bun.file('../contracts/out/$c.sol/$c.json').json(); await Bun.write('src/abi/$c.json', JSON.stringify(j.abi,null,2))"; done
```

## Fonts

`public/fonts` holds Unbounded and Work Sans (woff2 plus licences), copied from the nachweis-site repository. No external CDN.
