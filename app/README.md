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

Mock mode (`VITE_MOCK=1`) runs the whole flow in memory with fake delays: mock wallets, a mock verifier that "presents" the sample identity after four seconds, a mock bridge that walks verified, proving (three seconds, "generating proof, 430k cycles"), proved, attested, and a mock registry. No network calls. Use it to record the video even if a chain step is red.

## Environment

| variable | meaning |
|---|---|
| `VITE_VERIFIER_URL` | verifier-service base URL |
| `VITE_VERIFIER_MODE` | `service` (current `/zk/` endpoints) or `relay` (blind-relay endpoints) |
| `VITE_BRIDGE_URL` | bridge base URL. Set: the investor flow creates its session at the bridge (`POST /sessions`) and the bridge talks to the verifier. Unset: the app calls the verifier directly per `VITE_VERIFIER_MODE` and tries the bridge endpoints at `VITE_VERIFIER_URL` |
| `VITE_REGISTRY` | AttestationRegistry address on Sepolia |
| `VITE_FUND_TOKEN` | FundToken address |
| `VITE_SUBSCRIPTION` | Subscription address |
| `VITE_POOL` | optional Uniswap pool; the Swap door stays disabled until set |
| `VITE_POLICY_ID` | bytes32 policy id; default keccak256("nachweis.pid.over18.v1") |
| `VITE_REQUIRED_BITS` | bits the decision carries and the doors require (default 3: 1 = identity evidence, 2 = over 18) |
| `VITE_CHAIN_ID` | chain the wallet must be on; default `11155111` (Sepolia), `31337` for a plain anvil |
| `VITE_RPC_URL` | optional RPC; Sepolia defaults to viem's public endpoint, other chain ids default to `http://127.0.0.1:8545` |
| `VITE_MOCK` | `1` for mock mode |

## Screens

One app, two roles switched in the header.

Investor: (1) connect wallet (injected connector), (2) Present your ID: creates the session at the bridge (`POST /sessions {bound_address}`; the bridge creates the presentation request at the verifier), then the wallet signs the session (EIP-191 personal message `nachweis:session:<id>`, sent to the bridge as `POST /sessions/:id/address-proof {signature}`), shows the QR code and the openid4vp link, polls the outcome, (3) Eligibility: not permitted / presented, awaiting issuer / permitted, the bridge state machine from `GET /sessions/:id` (created, presented, verified, proving, proved, attested, failed) with the attest tx hash, and the on-chain Decision from `decisionOf` with the bits as labelled flags, (4) two doors: Subscribe calls `Subscription.subscribe()`, Swap is disabled until `VITE_POOL` is set; both show open or closed from `isEligible`, (5) What the chain sees: the raw Decision and the line "no name, no document".

Issuer: (1) connect operator wallet, (2) revoke by address for subjects without a session, (3) presentations created in this browser session with the claims summary (memory only, gone on reload). Each card states what was verified: name match and age from the presentation; sanctions and other checks are simulated in this build. The investor's Eligibility card carries the same note; the bridge normally attests with `attestWithProof`, Approve is the operator path `attestByOperator(subject, Decision)` with the policy id and bits from env, tier A, expiry now plus 30 days, statusRef = keccak256(session id); Revoke calls `revoke(subject, policyId)`, (4) event log of Attested and Revoked (last 50,000 blocks, refreshed every 8 seconds).

## Verifier client (`src/verifier.ts`)

`bridge` mode (whenever `VITE_BRIDGE_URL` is set; the real-mode default): `POST /sessions {bound_address}` at the bridge returns `session_id`, `nonce`, `openid4vp_uri` (bridge verifier mode) or none (bridge local mode, where a script posts the presentation), and `address_proof_message`. `GET /sessions/:id` reports the state; once the bridge has run the statement its `public_values` (subject, over18, expiry, issuer key hash, vct hash, nonce) are shown as the claims. The app never contacts the verifier in this mode, and the bridge session id is the one the wallet signs.

`service` mode (only without `VITE_BRIDGE_URL`) uses the endpoints the verifier-service exposes today: `GET /zk/` creates an mso_mdoc_zk request (`session`, `authorization_request`), `GET /zk/result/:id` returns `verified` with a `disclosure_statement` or `rejected`, 404 while pending.

`relay` mode implements the blind-relay endpoints (verifier branch nachweis-relay): `POST /relay/request {client_jwk, bound_address, challenge}`, `GET /relay/status/:id`, `GET /relay/response/:id` with `X-Pickup-Token` (handed out once, 410 afterwards; the app keeps the pickup in memory). The browser generates an ephemeral P-256 ECDH key with WebCrypto (`alg` ECDH-ES, `use` enc), keeps the private key in memory only, and shows the nonce `sha256(bound_address_bytes || challenge_bytes)` next to the relay's. Decrypting the JWE (ECDH-ES, A128GCM) is a stub: the response is shown as an opaque encrypted blob.

## Bridge client (`src/bridge.ts`)

The proof binds the subject address through the nonce, so the chain needs no wallet signature. The wallet signature is off chain: `POST /sessions/:id/address-proof {signature}`; the bridge verifies it before attesting. `GET /sessions/:id` returns the state (`state`, `tx_hash`, `detail`); the app polls it every two seconds until attested or failed. The attest transaction is sent by the bridge with the operator key, never by the investor.

## Wallet

`src/lib/WalletProvider.tsx` wires wagmi with the injected connector on the chain from `VITE_CHAIN_ID`: Sepolia by default, otherwise a local chain (anvil, 31337) at `VITE_RPC_URL`. Anvil needs no `--chain-id` flag; add the chain to the wallet with the same id and RPC. The "wrong network" button switches to that chain. A Privy provider can replace the body of that component later; the rest of the app only uses wagmi hooks and `useWallet()`.

## ABIs

`src/abi/*.json` are the `abi` arrays extracted from `contracts/out/<Name>.sol/<Name>.json` after `forge build` in `contracts/` (Solidity 0.8.28). Regenerate with:

```
cd contracts && forge build
cd ../app && for c in AttestationRegistry FundToken Subscription; do bun -e "const j=await Bun.file('../contracts/out/$c.sol/$c.json').json(); await Bun.write('src/abi/$c.json', JSON.stringify(j.abi,null,2))"; done
```

## Fonts

`public/fonts` holds Unbounded and Work Sans (woff2 plus licences), copied from the nachweis-site repository. No external CDN.
