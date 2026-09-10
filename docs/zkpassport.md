# zkPassport route (WP33): passport chip as a second evidence route

Status 2026-09-09: built on branch wp33-zkpassport, green locally (forge, typecheck, build, mock end-to-end on anvil), not run with a phone, not deployed. The builder decides on 2026-09-10 whether it stays. Research, trust model and the removal cost: /Users/bioharz/git/ethglobal/nachweis/wiki/zkpassport.md.

## What it is

The investor opens the zkPassport app (Obsidion Labs; App Store id6477371975, iOS 15.2 or later, 455 MB; Google Play app.zkpassport.zkpassport), scans the QR code the "Passport chip (zkPassport)" card shows, and proves on the phone with the chip of their own biometric passport (or national ID) that they are 18 or older, bound to the connected wallet address and to the chain. The SDK in the tab verifies the proof against zkPassport's verifier contract, the card sends `attestWithProof` from the connected wallet, and from there the existing screens, the issuer approval, the fund token, the pool checker and revoke see the same Decision as for the EUDI route (bits 0x7 instead of 0x3: identity evidence, over 18, plus a route marker bit).

Where the proof is made: on the phone, by a third-party app. What verifies it on chain: ZKPassportRootVerifier at 0x1D000001000EFD9a6371f4d90bB8920D5431c0D8 (same address on Ethereum mainnet, Sepolia and Base), behind our adapter. What the chain sees: address, policy, bits, expiry, the proof date, a per-site identifier of the document (scoped nullifier), and the proof. No name, birth date, nationality or document number.

## Pieces

| Piece | Path |
|---|---|
| Adapter (IProofVerifier) | contracts/src/zkpassport/ZkPassportVerifier.sol |
| Router: one policy, two routes | contracts/src/zkpassport/EvidenceRouter.sol |
| Vendored zkPassport interface | contracts/src/zkpassport/interfaces/IZKPassportVerifier.sol |
| Unit tests (mock root) | contracts/test/zkpassport/ZkPassportVerifier.t.sol, MockZkPassportRoot.sol |
| Fork tests (real contracts, published fixture) | contracts/test/zkpassport/ZkPassportVerifier.fork.t.sol, fixture contracts/test/fixtures/zkpassport/outer_evm_count_6.json |
| Deploy script | contracts/script/DeployZkPassportVerifier.s.sol |
| App card, config, encoding | app/src/components/zkpassport/ (behind VITE_ZKPASSPORT=1) |
| Local mock run | scripts/zkpassport-local.sh |

Shared files touched, each marked "WP33": contracts/src/interfaces/IProofVerifier.sol (nonceOf is `view`, was `pure`), app/src/screens/InvestorScreen.tsx (two lines), app/src/config.ts (one bit label), app/.env.example, app/package.json (@zkpassport/sdk 0.16.2).

## Tests

    cd contracts && forge test                       # 152 passed, 0 failed, 20 skipped without RPC on main 46d8349 (2026-09-09; 119 passed at the time of the WP33 branch run, 22 of them new)
    SEPOLIA_RPC_URL=... MAINNET_RPC_URL=... forge test --match-path 'test/zkpassport/*'   # 10 fork tests, read-only
    cd app && bun run typecheck && bun run build     # with and without VITE_ZKPASSPORT=1
    scripts/zkpassport-local.sh                      # anvil, MockZkPassportRoot, ZKPASSPORT-LOCAL PASS

The fork fixture is zkPassport's own Verifier API test bundle (a real passport, age >= 18, no bound address, domain "localhost"). Mainnet accepts it (root verifier 777,546 gas in the fork); Sepolia refuses it with "Invalid certificate registry root" because the fixture's July root is not in Sepolia's root history. It cannot pass our adapter because it binds no address; the first phone run produces the bound fixture that is missing (see "What to record").

## Builder steps: the phone run

Two runs, in this order. The first uses a mock passport (no real document involved) and settles the plumbing; the second uses the builder's passport.

### 0. Before the phone

1. Install ZKPassport from the App Store on the iPhone (455 MB, needs iOS 15.2 or later). Do not scan a document yet.
2. Enable developer mode: on the welcome screen long-press the empty area just above the "Scan your ID" button (or, if an ID is already loaded: gear icon top right, Developer Options, "Enable Developer Mode"). Mock IDs of the "Zero Knowledge Republic" appear under "Your IDs". Swipe to one of them.
3. Chain: mock passports verify only against zkPassport's Sepolia registry, so the run needs chain id 11155111. Either Sepolia itself (needs the funded deployer key, see the handoff), or a local anvil fork of Sepolia:

        anvil --fork-url "$SEPOLIA_RPC_URL" --port 8545          # keeps chain id 11155111 and the real root verifier at 0x1D00...

   On the fork, deploy the stack with Deploy.s.sol, DeployNoirVerifier.s.sol (as scripts/browser-real-wallet-up.sh does) and then the zkPassport adapter plus router in front of the policy:

        cd contracts && DEPLOYER_PRIVATE_KEY=<key> REGISTRY_ADDRESS=<registry> FALLBACK_VERIFIER=<NoirPidVerifier> \
          ZKPASSPORT_DOMAIN=<hostname the browser will show> ZKPASSPORT_SCOPE=attestat-over18 ZKPASSPORT_DEV_MODE=true \
          forge script script/DeployZkPassportVerifier.s.sol:DeployZkPassportVerifier --rpc-url http://127.0.0.1:8545 --broadcast

   ZKPASSPORT_DOMAIN must be the exact hostname of the page the QR code is shown on (the SDK derives the proof scope from `window.location.hostname`). With a cloudflared tunnel that is the tunnel hostname; on the laptop's LAN address it is that address; "localhost" only works if the phone can reach the page, which it cannot for the request itself (the request travels through zkPassport's relay, so localhost is fine for the page; the phone never opens the page). So: `localhost` works for a laptop-only session.
4. App env (app/.env or the exported variables of the up script): VITE_CHAIN_ID=11155111, VITE_RPC_URL=http://127.0.0.1:8545, VITE_REGISTRY, VITE_FUND_TOKEN, VITE_SUBSCRIPTION as deployed, VITE_ZKPASSPORT=1, VITE_ZKPASSPORT_DOMAIN=<same hostname>, VITE_ZKPASSPORT_SCOPE=attestat-over18, VITE_ZKPASSPORT_DEV_MODE=1. `bun run dev`. The wallet in the browser (injected wallet or the dev signer) must be on chain 11155111 pointing at the anvil fork.

### 1. Mock passport run

1. Investor screen, connect the wallet. The new card "Passport chip (zkPassport)" sits after "Present your ID". Click "Prove with the zkPassport app". Expect the status "waiting for the zkPassport app" and a QR code within a few seconds (the SDK is loaded on this click; first load fetches about 3 MB).
2. Scan the QR code with the ZKPassport app (its scanner is on the main screen). Expect on the phone: a request sheet with "Attestat", the purpose text ("Prove you are 18 or older and bind wallet 0x...."), and the list "age at least 18", "bound data". The card shows "request opened on the phone".
3. Accept on the phone. Expect "proof being generated on the phone" for roughly 1 to 10 seconds for the disclosure proofs (the base proofs for a mock ID are prepared when the ID is loaded), then "proof received, SDK verifying it against the verifier contract" (an eth_call to Sepolia through zkPassport's RPC), then "proof verified".
4. The card shows the proof line (version, bytes, public inputs, generation time), the document identifier (for mock passports always 1, shown as 0x00...01), and the decision (bits 0x7, expiry 30 days after the proof). Click "Send attestWithProof from this wallet". The wallet asks for a signature (gas from the investor's account). Expect "tx confirmed" and "Evidence stored".
5. Status card: "evidence on chain, awaiting issuer approval". Issuer screen: approve the address as for any EUDI session. Doors: Subscribe mines; a revoke in the issuer console closes it.
6. Negative check: click "New passport request" and repeat with the same mock ID; a second attestation with a fresh proof is accepted (new nonce). Resending the identical transaction (for example from the explorer) must revert with NonceConsumed.

What can go wrong and what it means:

- "the SDK could not verify the proof": the app was not in developer mode while VITE_ZKPASSPORT_DEV_MODE=1 is off (or vice versa), or the scope or domain differ between the deployed adapter and the app, or zkPassport's RPC was unreachable.
- Wallet transaction reverts with `ChainMismatch`: the page's chain id has no zkPassport name or the anvil is not a Sepolia fork.
- Reverts with "Invalid domain or scope": ZKPASSPORT_DOMAIN of the adapter is not the page's hostname.
- Reverts with "Mock proofs are only allowed in dev mode": the adapter was deployed with ZKPASSPORT_DEV_MODE=false.
- Reverts with "The proof was generated outside the validity period": more than VITE_ZKPASSPORT_VALIDITY (7 days) between the proof and the transaction, or the anvil fork's clock is behind the phone's.
- "Invalid certificate registry root": the proof was made against a registry root the chain does not know; for a real passport on Sepolia this is the finding to report.

### 2. Real passport run

Only after run 1 is green. Turn developer mode off in the app (Settings, Developer Options), scan the passport (camera on the MRZ lines, then hold the phone on the passport for the NFC read; the FAQ says lay the passport flat and keep the phone still; on iPhone, turning WiFi off can help the NFC read). Redeploy the adapter with ZKPASSPORT_DEV_MODE=false and the app with VITE_ZKPASSPORT_DEV_MODE=0, then repeat steps 1 to 5. The base proofs of a real passport take 10 to 50 seconds once, right after the scan.

Expectation on Sepolia: the Sepolia certificate package holds the German signing certificates (9 for DEU on 2026-09-09), so the proof should verify there; if the chain answers "Invalid certificate registry root", record it, and the mainnet fork test shows the same proof would verify on mainnet.

Do not commit anything from the real-passport run except the numbers below. The proof of a real passport is public data by design (it reveals only the checked predicate and the document identifier), but the identifier links every proof of that passport under this domain and scope; keep the real-passport fixture out of the repository.

## What to record (docs/evidence/zkpassport-<date>.md)

- Phone model and iOS version, ZKPassport app version (Settings screen), developer mode on or off.
- Chain: Sepolia or anvil fork of Sepolia (fork block), adapter and router addresses, domain and scope, dev mode of the adapter.
- Timings from the card's status line: click to QR, scan to "request opened", accept to "proof verified", and the transaction time.
- The transaction hash of attestWithProof and its gas (expected around 1.0 to 1.2 million: the root verifier alone measured 777,546 in the mainnet fork), approve, subscribe, revoke.
- Proof version and size as the card prints them (fixture: version 0.20.0, 10,240 bytes, 11 public inputs).
- For the mock run only: commit the Solidity parameters the card computed (browser console prints nothing by default; add `console.log(JSON.stringify(params))` in ZkPassportCard.tsx or copy them from the transaction's calldata with `cast calldata-decode`) as contracts/test/fixtures/zkpassport/outer_evm_bound_mock.json, so the fork test gets a bound proof.
- The evidence class (docs/process.md): W does not apply (no EUDI wallet), D for the phone run, S if on Sepolia.

## Removal

`git rm -r contracts/src/zkpassport contracts/test/zkpassport contracts/test/fixtures/zkpassport contracts/script/DeployZkPassportVerifier.s.sol app/src/components/zkpassport docs/zkpassport.md scripts/zkpassport-local.sh`, revert the marked lines in app/src/screens/InvestorScreen.tsx and app/src/config.ts, drop the VITE_ZKPASSPORT block from app/.env.example, `cd app && bun remove @zkpassport/sdk`. The `view` on IProofVerifier.nonceOf can stay. On chain: `AttestationRegistry.setVerifier(policyId, <NoirPidVerifier>)` if a router was ever registered.
