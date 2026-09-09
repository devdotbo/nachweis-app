# app

Demo front end for Attestat (formerly Nachweis; the package keeps the name `nachweis-app`): a token issuer accepts identity evidence from the German EUDI test wallet (sample identity) through the Rust verifier-service, approves it, and the approval becomes an EligibilityDecision in the AttestationRegistry on Sepolia. FundToken transfers and the Subscription contract read that decision; a Uniswap permissioned pool (WP7) will read it too. Revoke closes both doors.

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

## Hosting (COOP and COEP)

"Prove in this browser" (card 2b, `docs/spec-browser-prover.md`) runs noir_js and bb.js in a Web Worker. bb.js proves on a thread pool over `SharedArrayBuffer`, which the browser only hands out to a cross-origin isolated page, so the page must be served with

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`vite.config.ts` sets both on `bun run dev` and `bun run preview`. A static host (Vercel, Netlify, nginx, S3 behind CloudFront) must send them itself; without them `crossOriginIsolated` is false, the card explains it and the handoff paths (phone, desktop companion) stay available. Under COEP every cross-origin resource needs CORS or CORP headers: the verifier (`CorsLayer::permissive()`), the bridge (`CORS_ORIGINS`, any origin by default), anvil and the Aztec CRS CDN all send them. The compiled circuit is served at `/circuits/pid_sdjwt.json` (dev: from `prover-android/app/src/main/assets/`, stripped to abi and bytecode, 2.9 MB; build: copied into `dist/circuits/`). Download on the first proof: about 6 MB gzip of wasm and JS plus the 67 MB CRS, cached in IndexedDB afterwards. iPhone and iPad are excluded (bb.js caps their wasm memory at 1 GiB; the proof needs about 3 GB).

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
| `VITE_DEV_PRIVATE_KEY` | dev signer, local only: investor key signed in the page (see below) |
| `VITE_DEV_OPERATOR_KEY` | dev signer, local only: operator key for the issuer role |
| `VITE_PRIVY_APP_ID` | optional: Privy app id. Set: the wallet layer becomes PrivyProvider plus `@privy-io/wagmi` (`src/lib/PrivyWalletProvider.tsx`), the investor gets "Sign in with email, wallet by Privy", the operator connects through Privy's wallet picker, and the dev signer is not available. Unset: the previous provider tree, unchanged |
| `VITE_PRIVY_SIGNER_ID` | optional: key quorum id of the issuer's authorization key, the signer the investor allows on the standing-order card |
| `VITE_AUTOMATION_URL` | optional: the issuer's automation (`automation/`); enables the standing-order card and the issuer's automation log (`docs/privy-standing-order.md`) |

## Dev signer (local only)

`src/lib/devSigner.ts` is a wagmi connector around a viem local account (`privateKeyToAccount`): it signs the EIP-191 session message and the Subscribe, Approve and Revoke transactions in the page and sends the raw transactions to `VITE_RPC_URL`. No extension, no prompt: whatever the app asks for is signed. It exists so the real flow (bridge, chain, wallet signature) can run headlessly and be tested; never point it at a key that holds value.

Enabled only when `VITE_DEV_PRIVATE_KEY` (investor) or `VITE_DEV_OPERATOR_KEY` (issuer) is set. The header then shows the badge "dev signer, local only", the connect buttons read "Connect dev signer", and switching the role switches the account (investor key, operator key), like changing the account in an extension. With both keys unset, `vite.config.ts` defines `__NACHWEIS_DEV_SIGNER__` as `false`, so the bundle drops the connector, the account code and the key reads (checked: `privateKeyToAccount` and the badge text are absent from `dist/`); with a key set, `bun run build` refuses (`NACHWEIS_ALLOW_DEV_SIGNER_BUILD=1` overrides for a local preview). Anvil's defaults: key 1 for the investor, key 0 for the operator (`Deploy.s.sol` makes the deployer the operator unless `OPERATOR_ADDRESS` is set).

## Browser e2e (Playwright)

`e2e/` runs the app against the real local stack: anvil, the deployed contracts, verifier-service (from `../nachweis-verifier-relay`), the bridge and a Vite dev server with the dev signer. The specs start nothing; `scripts/app-e2e-local.sh` starts the stack and writes `.e2e/app/env.json` (URLs, addresses, key files) for them.

```
scripts/app-e2e-local.sh --test                    # noir: start, run the spec, stop (exit code = result)
scripts/app-e2e-local.sh --mode browser --test     # the same stack, the "Prove in this browser" path
scripts/app-e2e-local.sh --mode sp1-mock --test    # the SP1 path with PROOF_MODE=mock
scripts/app-e2e-local.sh                           # start and keep running, then:
cd app && APP_E2E_ENV=../.e2e/app/env.json bunx playwright test
scripts/app-e2e-local.sh --stop
```

`e2e/noir-handoff.spec.ts` (mode `noir`, about 20 s): connect with the dev signer; create the session (`POST /sessions`), the dev signer signs `nachweis:session:<id>` and the bridge confirms `address_verified`; the "Prove on your phone" card shows the handoff QR and URI (session, address, bridge and verifier URLs checked); the spec hands the URI to `companion handoff … --stub-wallet` (the phone: request with the same challenge, stub wallet, bb proof, `POST /sessions/:id/noir-proof`); the app flips to attested from the phone, permitted, bits 0x3 with both flags, attest tx, decision on chain; Subscribe sends `Subscription.subscribe()` with the dev signer and the FundToken balance rises; the Issuer role (operator key) shows the session as attested, Revoke sends the tx and the registry event log shows Revoked; back on Investor the status is revoked, `revoked: true` on chain, the Subscribe door closed and its button disabled. No console errors allowed. One run per stack: a revoked subject cannot be re-attested with a proof (`DecisionRevoked`), and `evm_revert` would desync the bridge's cached tx nonce, so a rerun restarts the stack (2 s).

`e2e/browser-prover.spec.ts` (mode `browser`, about 40 s on the M3 Max, up to 120 s allowed for the proof): the same stack as noir; card 2b defaults to "Prove in this browser" (the dev server is cross-origin isolated); the tab creates the relay request and shows the wallet QR; the spec answers the relay with `companion mint-test-presentation --request-uri …`; the tab picks up, decrypts, checks, proves with bb.js in a worker, verifies and posts the proof; the bridge dry-runs NoirPidVerifier and attests; the spec reads the attest receipt from anvil, checks every request the page made against the allowlist of `docs/spec-browser-prover.md` (relay, bridge session, RPC, Aztec CRS), then the issuer approves and Subscribe passes. Timings land in `.e2e/app/browser-timings.json`. `PW_CHANNEL=chrome PW_HEADED=1 bunx playwright test e2e/browser-prover.spec.ts` runs it in the installed Google Chrome.

`e2e/sp1-mock.spec.ts` (mode `sp1-mock`, about 10 s): the bridge in verifier mode creates the OpenID4VP request at the verifier, the app shows the wallet QR and link, `scripts/e2e/wallet.ts` answers the verifier as the wallet, the bridge verifies, proves (mock) and, asked by the app (`POST /sessions/:id/attest`, sent when the poll sees `proved`), attests. The spec records which bridge states the 2 s poll surfaced (`.e2e/app/states-seen.json`); with the mock prover, presented, verified, proving and proved pass within one interval, so usually only created and attested are seen.

Screenshots of every beat land in `_preview/e2e/<mode>/` (gitignored); failures also leave a trace under `_preview/e2e/test-results/`.

## Screens

One app, two areas: the investor portal at `/` and the issuer console at `/issuer` (react-router; the area on screen decides the role and, with dev signers, the account). Screenshots of every main state, taken against the mock chain with `e2e/ui-shots.ts`, are in `docs/ui/`.

Investor portal: a journey rail (connect, present, prove, evidence on chain, issuer approval, subscribe, swap, holdings, history) with one marker on the step that needs the investor now, and the sections in that order. Connect wallet renders the options the wallet layer offers (`src/lib/wallet.ts`, `Wallet.options`: dev signer, injected; with `VITE_PRIVY_APP_ID`, "Sign in with email, wallet by Privy" and Privy's wallet picker). Standing order (with `VITE_PRIVY_APP_ID` and `VITE_AUTOMATION_URL`): the policy the issuer's automation copied from the decision, in plain words; Allow, Run the month, Remove signer (`docs/privy-standing-order.md`). Present your ID creates the session at the bridge (`POST /sessions {bound_address}`; the bridge creates the presentation request at the verifier), the wallet signs the session (EIP-191 personal message `nachweis:session:<id>`, `POST /sessions/:id/address-proof {signature}`), and the QR code and openid4vp link appear when the verifier issued one. Prove: in this browser (default on a cross-origin isolated page), on your phone, or with the desktop companion; the phone and companion paths use `GET /sessions/:id/handoff` and the compact handoff JSON `{v:1, s:session_id, a:bound_address, c:challenge_hex, r:verifier_url, b:bridge_url}` as a QR plus a copyable `nachweis://handoff?…` URI (`src/lib/handoff.ts`); the other device requests the presentation with the SAME challenge, proves and posts only the proof; the phone holds no Ethereum key. Eligibility: the status (not permitted, presented awaiting issuer, evidence on chain awaiting issuer approval, permitted, revoked, expired), the bridge state machine with the attest tx (linked to Etherscan on Sepolia), a caption saying where the proof was made (this tab, the phone, the companion, or the issuer's server on the SP1 route), the decision from `decisionOf` with the bits as labelled flags, and the simulated-checks caption. Two doors: Subscribe calls `Subscription.subscribe()`, Swap shows the pool's door (disabled until `VITE_POOL`); both read `isEligible`. Holdings: the fund token balance. History: receipts of the transactions this browser sent, and the registry events for the address from the chain's logs. What the chain sees: the raw Decision and the caption "no identity documents on chain, and nothing we could use to find you".

Issuer console: counts (sessions before evidence, awaiting approval, approved, revoked, from the chain's events), the operator wallet, the queue of presentations opened in this browser (claims summary, what Approve confirms, sanctions and other checks simulated; Approve, Revoke, Re-approve, Attest directly as the operator fallback `attestByOperator` with the policy id and bits from env, tier A, 30 days, statusRef = keccak256(session id)), the Decisions table read live from the registry (subject, policy, bits, tier, expiry, status, approved, revoked, the Subscribe and Swap doors, Approve and Revoke per row), receipts of the console's own transactions, the event history (Attested, Approved, Revoked from the last 50,000 blocks, refreshed every 8 seconds, with explorer links on Sepolia) and Revoke by address (captioned manual).

## Verifier client (`src/verifier.ts`)

`bridge` mode (whenever `VITE_BRIDGE_URL` is set; the real-mode default): `POST /sessions {bound_address}` at the bridge returns `session_id`, `nonce`, `openid4vp_uri` (bridge verifier mode) or none (bridge local mode, where a script posts the presentation), and `address_proof_message`. `GET /sessions/:id` reports the state; once the bridge has run the statement its `public_values` (subject, over18, expiry, issuer key hash, vct hash, nonce) are shown as the claims. The app never contacts the verifier in this mode, and the bridge session id is the one the wallet signs.

`service` mode (only without `VITE_BRIDGE_URL`) uses the endpoints the verifier-service exposes today: `GET /zk/` creates an mso_mdoc_zk request (`session`, `authorization_request`), `GET /zk/result/:id` returns `verified` with a `disclosure_statement` or `rejected`, 404 while pending.

`relay` mode implements the blind-relay endpoints (verifier branch nachweis-relay): `POST /relay/request {client_jwk, bound_address, challenge}`, `GET /relay/status/:id`, `GET /relay/response/:id` with `X-Pickup-Token` (handed out once, 410 afterwards; the app keeps the pickup in memory). The browser generates an ephemeral P-256 ECDH key with WebCrypto (`alg` ECDH-ES, `use` enc), keeps the private key in memory only, and shows the nonce `sha256(bound_address_bytes || challenge_bytes)` next to the relay's. Decrypting the JWE (ECDH-ES, A128GCM) is a stub: the response is shown as an opaque encrypted blob.

## Bridge client (`src/bridge.ts`)

The proof binds the subject address through the nonce, so the chain needs no wallet signature. The wallet signature is off chain: `POST /sessions/:id/address-proof {signature}`; the bridge verifies it before attesting. `GET /sessions/:id` returns the state (`state`, `tx_hash`, `detail`, `proof_system`); the app polls it every two seconds until attested or failed. When the poll sees `proved` the app sends `POST /sessions/:id/attest` once (the bridge's verifier mode proves but does not attest on its own; the noir path attests inside `noir-proof`). The attest transaction is sent by the bridge with the operator key, never by the investor.
`GET /sessions/:id/handoff` (bridge mode only, after the signature) returns the two-device handoff; in mock mode the handoff is fabricated from the mock session (emulator URLs `10.0.2.2`).

## Wallet

`src/lib/WalletProvider.tsx` wires wagmi with the injected connector (and the dev signer connectors when configured) on the chain from `VITE_CHAIN_ID`: Sepolia by default, otherwise a local chain (anvil, 31337) at `VITE_RPC_URL`. Anvil needs no `--chain-id` flag; add the chain to the wallet with the same id and RPC. The "wrong network" button switches to that chain. With `VITE_PRIVY_APP_ID` set, `src/lib/PrivyWalletProvider.tsx` replaces that tree (lazily loaded: PrivyProvider, QueryClientProvider, WagmiProvider from `@privy-io/wagmi`) and publishes the few Privy calls the app needs through `src/lib/privyContext.ts`; the rest of the app only uses wagmi hooks and `useWallet()`. `@privy-io/wagmi` syncs Privy's wallets into wagmi and drops every other connector, so the operator connects through Privy's wallet picker while the app id is set, and disconnect is Privy's `logout()`.

## ABIs

`src/abi/*.json` are the `abi` arrays extracted from `contracts/out/<Name>.sol/<Name>.json` after `forge build` in `contracts/` (Solidity 0.8.28). Regenerate with:

```
cd contracts && forge build
cd ../app && for c in AttestationRegistry FundToken Subscription; do bun -e "const j=await Bun.file('../contracts/out/$c.sol/$c.json').json(); await Bun.write('src/abi/$c.json', JSON.stringify(j.abi,null,2))"; done
```

## Fonts

`public/fonts` holds Unbounded and Work Sans (woff2 plus licences), copied from the nachweis-site repository. No external CDN.
