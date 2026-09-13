# App on Vercel: static build without keys (2026-09-13)

Labels: FACT = observed in this session (command output, screenshot). CLAIM = read from code or documentation, not exercised. OPINION = judgement.

## What was deployed

- FACT: Vercel project `attestat-app` (id `prj_TcsKswmpJTKMQhH43qBurhmhnl2j`, team "7118eth-protonme's projects"), created 2026-09-13 15:03 UTC+2 with `vercel link --yes --project attestat-app` from `app/`.
- FACT: Production URL https://attestat-app.vercel.app (alias of deployment `attestat-alwr9pho4-...` and, after the rewrite fix, of a second deployment; both built locally, uploaded with `vercel deploy --prebuilt --prod --yes`).
- FACT: The bundle is `app/dist` as produced by `bun run build` (tsc, then vite build), 35 MB on disk including `circuits/pid_sdjwt.json` (2.9 MB) and the two wasm files of noir_js and acvm.
- FACT: The build ran without `VITE_DEV_PRIVATE_KEY` and `VITE_DEV_OPERATOR_KEY` in the environment (`env | grep -c VITE_DEV` returned 0; `vite.config.ts` throws on a production build when either is set, and it did not throw). `__NACHWEIS_DEV_SIGNER__` is therefore `false` and the dev signer connector is not in the bundle (the dead label string "Connect dev signer" remains in `ConnectCard-*.js` as unreachable code; no key material).
- FACT: `grep -rl "0x[0-9a-f]\{64\}" app/dist` lists ten chunks; the 168 distinct 64-hex values are the policy id, curve and field constants (secp256k1, P-256, ed25519, BN254), EIP-6492 magic, BN254 points from the Noir/bb packages and Solidity bytecode fragments (`0x6080604052...`). No value matches any key known to this session (the session never read a key).

## Exact VITE_ values compiled in

Exported in the shell for `bun run build` and `vercel build --prod`; no env file was written into the repository. No secret among them; the addresses are from `docs/deployments/sepolia-2026-09-10.md`.

```
VITE_CHAIN_ID=11155111
VITE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
VITE_REGISTRY=0xeD46dC419e826c9Fdf16aADe1C9e3e970cc8ad53
VITE_FUND_TOKEN=0x8Ef00746fc2508B01CC8bBCDd0e161598eC9792f
VITE_SUBSCRIPTION=0x1542515f5E8a00BF087bEcdeEdfC4c9Bd68569fb
VITE_POLICY_ID=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f
VITE_REQUIRED_BITS=3
VITE_POOL_ADAPTER=0xc440aD626959d97a689Ba0465f2F1eD293a0b20D
VITE_POOL_STABLE=0x645476358892F920991e544394EA24fF6Df5204A
VITE_POOL_FEE=3000
VITE_POOL_TICK_SPACING=60
VITE_VERIFIER_MODE=relay
VITE_BRIDGE_URL=          (empty)
VITE_VERIFIER_URL=        (empty, code default http://localhost:3000)
VITE_MOCK=0
```

Not set: `VITE_PRIVY_APP_ID`, `VITE_PRIVY_SIGNER_ID`, `VITE_AUTOMATION_URL`, `VITE_ZKPASSPORT`, `VITE_BACKOFFICE_URL`, `VITE_DESK`, `VITE_FUND_TOKEN_B`, `VITE_SUBSCRIPTION_B`, `VITE_CHECKER`, and no dev key.

- FACT: The RPC was chosen by `curl -X POST ... eth_chainId` with an `Origin` header: publicnode answered 200 with `access-control-allow-origin: *` and `0xaa36a7`; `https://rpc.sepolia.org` answered 404 and `https://sepolia.drpc.org` 400.
- FACT: `VITE_MOCK` stays 0. `src/config.ts` and `src/lib/chain.ts`: with `VITE_MOCK=1` every chain read and the wallet are replaced by an in-memory fake (`src/lib/mockChain.ts`), so the page would show nothing of Sepolia. OPINION: a fake journey on a public URL would mislead a reviewer; the read-only real page is the honest option.

## What a visitor can do, and what fails

Read from `src/config.ts`, `src/verifier.ts`, `src/bridge.ts`, `src/lib/wallet.ts`, `src/components/PresentCard.tsx`, `src/components/HandoffCard.tsx` and confirmed by the headless screenshots of `/` and `/issuer`.

Works (FACT unless marked):

- The investor portal at `/` and the issuer console at `/issuer` render with live Sepolia data: the top bar showed "Sepolia, block 11696075" and the tag "blind relay"; the issuer console's Decisions table showed the one decision on chain (subject `0xC616...bA44`, bits 0x3, tier A, expiry 2026-09-22, revoked, both doors closed). Client routes (`/issuer`, `/showcase`, unknown paths) return 200 through the SPA rewrite.
- Nothing contacts the bridge or the verifier at page load. The only bridge call in the investor flow is behind the "Create presentation request" button (`PresentCard.create`), the handoff poll only runs after a signed session.
- CLAIM: The only wallet option is "Connect injected wallet" (MetaMask or another EIP-1193 extension): with no dev key and no `VITE_PRIVY_APP_ID`, `useChainWallet` offers just the injected connector; no mock wallet without `VITE_MOCK`. A visitor with an extension on Sepolia can connect, and the Eligibility card then reads that address's decision from the registry (`useRegistryStatus`), the "Two doors, one decision" card shows what the fund token and the pool answer, Holdings reads the fund balance, History reads registry events.
- CLAIM: "Prove in this browser" is technically available because the page is cross-origin isolated (both headers verified below) and `/circuits/pid_sdjwt.json` and the wasm files are served with the right content types; but it needs a presentation first, which needs the verifier, so it cannot be reached.

Fails, with the reason (CLAIM, from code; not exercised on the public page):

- "Create presentation request": `VITE_BRIDGE_URL` is empty, so `BRIDGE_CONFIGURED` is false and the relay client posts to `http://localhost:3000/relay/request`; the fetch fails and the card shows the error inline ("Failed to fetch" or similar). Same for the session signature and the handoff, which are never reached.
- Proof (`/sessions/:id/noir-proof`, `attestWithProof`): no session, no bridge, and the operator key only lives in the bridge; not reachable.
- Approve, revoke, attestByOperator on the issuer console: transactions from the connected wallet; they revert unless that wallet is the registered operator (`0x452A376805821aD33D2F01c9134Ba5E26455900a`, the deployer). A visitor's wallet is refused by the registry.
- Subscribe and swap: enabled in the UI because `VITE_POOL_ADAPTER` is set, but both doors ask the registry and a visitor's address has no decision, so `subscribe` reverts and the pool's `beforeSwap` rejects. This is the intended behaviour of the doors, not a hosting defect.
- Standing order (Privy), zkPassport route, showcase desks that need `VITE_DESK`, `VITE_BACKOFFICE_URL` or `VITE_AUTOMATION_URL`: the cards are hidden or say the service is not configured.

## Headers (COOP, COEP) and content types

`app/vercel.json` sets on every path: `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-origin`, `X-Content-Type-Options: nosniff`; `cleanUrls: true`; one rewrite `/(.*)` to `/` for the client router (a destination of `/index.html` returned 404 under `cleanUrls`, since Vercel redirects `index.html` to `/`; changed to `/` and verified).

FACT, `curl -I` against the production URL on 2026-09-13:

- `/`: 200, `content-type: text/html; charset=utf-8`, all four headers present, `<title>Attestat</title>` in the body.
- `/assets/noirc_abi_wasm_bg-CWnf77RB.wasm`: 200, `content-type: application/wasm`, same four headers.
- `/circuits/pid_sdjwt.json`: 200, `application/json`.
- `/assets/*.js`: 200, `application/javascript`.
- `/issuer`, `/showcase`, `/nonsense`: 200 (SPA rewrite).

CLAIM: under COEP every cross-origin resource needs CORS; the RPC sends `access-control-allow-origin: *` (checked), the Aztec CRS CDN and the bridge do as well per `app/README.md` "Hosting". `crossOriginIsolated` was not read in a browser console in this session.

## Redeploy

From `app/`, with the VITE_ exports above in the shell (never in a file inside the repository; `.env*` except `.env.example` is git-ignored, but the values are not secret so an exported shell block is enough):

```
cd app
export VITE_CHAIN_ID=11155111 VITE_RPC_URL=... (the block above)
vercel build --prod --yes          # runs vite build into .vercel/output, reads the exports
vercel deploy --prebuilt --prod --yes
```

`vercel deploy` without `--prebuilt` would build on Vercel and fail: `vite.config.ts` reads the circuit from `../prover-android/app/src/main/assets/pid_sdjwt.json`, outside `app/`, and the VITE_ values are not stored in the project's environment (deliberately: nothing lives on Vercel that is not in this file). `app/.vercel/` is git-ignored (`app/.gitignore`).

## attestat.app: DNS records

- FACT: `vercel domains add attestat.app` (from `app/`, linked project) printed "Success! Domain attestat.app added to project attestat-app", then "You don't have access to attestat.app (403)" when fetching the domain object. `vercel domains inspect attestat.app` and `vercel domains ls` show no domain in this team. Reading: the domain is attached to the project but is not owned by this Vercel team, so the CLI cannot print the project-specific records. The Vercel dashboard (project `attestat-app`, Settings, Domains) shows them; the API is `GET /v6/domains/attestat.app/config?projectId=prj_TcsKswmpJTKMQhH43qBurhmhnl2j`.
- CLAIM (Vercel's documented defaults for a domain whose DNS stays at the registrar; unverified for this project):

```
attestat.app      A      76.76.21.21
www.attestat.app  CNAME  cname.vercel-dns.com
```

  Newer projects may be assigned `A 216.198.79.1` and a per-project `cname.vercel-dns-017.com` target instead; take the values the dashboard shows for this project. If the domain is registered in another Vercel team, Vercel additionally asks for a `TXT _vercel` verification record, shown in the same place.
- No DNS was changed in this session.

## What a full public deployment needs (after the deadline)

OPINION, in order of size:

1. The bridge (`service/`, Rust, holds `OPERATOR_PRIVATE_KEY`) and the verifier-service on a server with a stable HTTPS origin the phone can reach (the OpenID4VP request URI must be public); `CORS_ORIGINS` set to the app origin; then rebuild with `VITE_BRIDGE_URL` and `VITE_VERIFIER_URL` set to those origins.
2. Viewer-side wallets only: the injected wallet is already the only option; for an email login, create a Privy app whose allowed origins include the production origin and set `VITE_PRIVY_APP_ID` (public id). No dev key in any build, env or Vercel setting; `vite.config.ts` already refuses a production build with one.
3. The optional services (`automation/`, showcase backoffice, fund desk) each need a public origin and their `VITE_*_URL`; otherwise their cards stay hidden, which is fine.
4. A paid or own Sepolia RPC if the public one rate-limits the block watcher (`useBlockNumber({ watch: true })` polls continuously).
