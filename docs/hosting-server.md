# Relay and bridge on the builder's server (2026-09-13)

Labels: FACT = observed in this session (command output). CLAIM = read from code or documentation, not exercised. OPINION = judgement.

Goal: the public app at https://app.attestat.dev runs the full journey (presentation request, phone wallet answer, browser proof, attest, approve, subscribe, swap) against a relay and a bridge that the phone and the browser can reach over stable HTTPS origins, without a Cloudflare tunnel. Companion record on the server side: `docs/attestat.md` in the netcub repository (the NixOS flake of the host).

## Server identity

- FACT: netcup VPS `v2202607377610479217`, NixOS 26.05 (`x86_64-linux`, kernel 6.18), 4 cores, 8 GB RAM, 187 GB free on `/`. SSH alias `cloud` (user `agent`, key-only, passwordless sudo). nginx already terminated TLS on 80 and 443 for six other hosts; Docker runs Bellguard and the EUDIPLO sandbox.
- FACT: no Rust toolchain on the host (`cargo: command not found`), no `gcc`.
- FACT: public addresses `159.195.201.74` and `2a0a:4cc0:c2:acab:88ef:fbff:fec9:9e18` (`curl -s4/-s6 ifconfig.me`).

## What runs where

| Public host | Unit (systemd, NixOS module `modules/nixos/attestat.nix` in netcub) | Binary | Loopback |
|---|---|---|---|
| https://relay.attestat.dev | `attestat-relay.service` | `/var/lib/attestat/bin/verifier-service` (nachweis-verifier-relay, branch `nachweis-relay`, commit `7262a32`) | `127.0.0.1:8090` |
| https://bridge.attestat.dev | `attestat-bridge.service` | `/var/lib/attestat/bin/nachweis-bridge` (this repository, `service/`, commit `7ef18b2`) | `127.0.0.1:8787` |

- Both units: user `attestat`, `Restart=always`, `RestartSec=3`, `wantedBy multi-user.target` (enabled), the same hardening block as the host's nachweis units, `EnvironmentFile` from `/var/lib/attestat/secrets/relay.env` and `bridge.env` (root-only, 0600). A missing binary or env file leaves the unit in "condition failed" instead of a restart loop.
- Relay env (names only): `PORT=8090 HOST=127.0.0.1 PUBLIC_URL=https://relay.attestat.dev/ RP_KEY_PATH RP_LEAF_PATH RELAY_PICKUP_ONCE=true RESULT_INCLUDES_PRESENTATION=false RUST_LOG=info`. Same shape as `scripts/g0-up.sh` starts it locally; the key and leaf are the ones `g0-up.sh` uses (`~/git/eudi-wallet-hackathon/secrets/rp.key`, `fixtures/live/access-leaf.pem`), copied through a pipe to `/var/lib/attestat/secrets/` (0640 root:attestat).
- Bridge env (names only): `BIND=127.0.0.1:8787 RPC_URL=https://ethereum-sepolia-rpc.publicnode.com REGISTRY NOIR_VERIFIER POLICY_ID=nachweis.pid.over18.v1 REQUIRE_ADDRESS_PROOF=true RUST_LOG=info HANDOFF_VERIFIER_URL=https://relay.attestat.dev HANDOFF_BRIDGE_URL=https://bridge.attestat.dev CORS_ORIGINS=https://app.attestat.dev,https://attestat-app.vercel.app PROOF_MODE=mock PROVER_ARTIFACTS=/var/lib/attestat/prover-fixtures OPERATOR_PRIVATE_KEY BRIDGE_ISSUER_TOKEN`. This is the env `scripts/browser-real-wallet-up.sh` passes in `--deployment` mode (lines 96 to 101: `K0=$DEPLOYER_PRIVATE_KEY` from the repo root `.env`; lines 215 to 219: `OPERATOR_PRIVATE_KEY=$K0`, local mode, `REQUIRE_ADDRESS_PROOF=true`), with the handoff URLs public and CORS restricted to the app origins. Addresses from `docs/deployments/sepolia-2026-09-10.md`. `SEPOLIA_RPC_URL` in `.env` is the public node (FACT, compared), so no private endpoint was copied. `OPERATOR_PRIVATE_KEY` went through `grep '^DEPLOYER_PRIVATE_KEY=' .env | sed ... | ssh cloud 'sudo sh -c "cat >> .../bridge.env"'`; `BRIDGE_ISSUER_TOKEN` was generated on the host (`openssl rand -hex 32`). Neither value was printed anywhere.
- The mock-proof fixtures (`prover-sp1/fixtures`) are copied to `/var/lib/attestat/prover-fixtures` because the bridge's default path is relative to the crate directory. CLAIM: the browser path (`noir-proof`) never loads them; they matter only for the SP1 route.

## Binaries

- FACT: cross-built on the Mac with `cargo-zigbuild`, target `x86_64-unknown-linux-musl` (static; NixOS has no `/lib64` glibc loader for foreign binaries, `nix-ld` aside). Copies of the two source trees in a scratch directory got one line after `[dependencies]` in `verifier-service/Cargo.toml` and `service/Cargo.toml`: `openssl = { version = "0.10", features = ["vendored"] }`, because on Linux `native-tls` pulls `openssl-sys` and neither crate enables the vendored build (the first attempt failed with "Could not find directory of OpenSSL installation"). No tracked file in either checkout was modified.
- FACT: relay `cargo zigbuild --release --target x86_64-unknown-linux-musl -p verifier-service`, 2 m 39 s. Bridge `cargo zigbuild --release --no-default-features --target x86_64-unknown-linux-musl`, 3 m 30 s; `--no-default-features` drops `native-gnark` (Go) which only the groth16 proof mode uses.
- FACT: sha256 prefixes `6aca3a66dd1eb9d5` (verifier-service, 18 MB) and `6ab8bc98bb35154e` (nachweis-bridge, 55 MB), equal on the Mac and on the host. Ownership `root:attestat` 0750 (the first start failed with `203/EXEC` while the file was `root:root`; the module now carries tmpfiles `z` rules for both binaries).

## Proxy and TLS

- FACT: two nginx virtual hosts added in the NixOS module, `enableACME`, `forceSSL`, `proxyPass` to the loopback ports, `client_max_body_size 2m`; the bridge host has `proxy_read_timeout 300s` (CLAIM: the `noir-proof` request waits for the on-chain dry run and the attestation transaction). Certificates were issued at the first switch (`Finished Ensure certificate for relay.attestat.dev` and `bridge.attestat.dev` in the journal), `curl` reports `ssl_verify_result 0`, HTTP/2. No other site was removed or changed; the switch restarted nginx once.
- Deployed with the repo's `scripts/deploy-flake.sh` (rsync to `/etc/nixos`, `nixos-rebuild switch --flake /etc/nixos#netcup`), twice (15:47 and 15:58 CEST; the second added the ownership rules). FACT: before the first switch a checksum rsync dry run showed `/etc/nixos` byte-identical to the local netcub tree, so nothing unrelated was deployed.

## DNS

FACT, Porkbun API v3 (`dns/create/attestat.dev`), TTL 600, created 15:45 CEST; the zone previously had no `relay` or `bridge` record:

| Type | Name | Content | id |
|---|---|---|---|
| A | relay | 159.195.201.74 | 584112365 |
| AAAA | relay | 2a0a:4cc0:c2:acab:88ef:fbff:fec9:9e18 | 584112373 |
| A | bridge | 159.195.201.74 | 584112382 |
| AAAA | bridge | 2a0a:4cc0:c2:acab:88ef:fbff:fec9:9e18 | 584112389 |

`dig +short @curitiba.porkbun.com relay.attestat.dev A` and `AAAA` returned those values for both names; `dig +short relay.attestat.dev @1.1.1.1` as well, within about two minutes. nginx listens on `[::]:443`, so AAAA is served.

## Paused or stopped services on the host

- FACT: nothing was stopped for Attestat. The collaboration stack (Nextcloud, Cal.com, Jitsi: `jitsi-videobridge2 jicofo prosody phpfpm-nextcloud nextcloud-cron.timer nextcloud-cron.service redis-nextcloud docker-cal-com redis-cal-com`) had been stopped by hand on 2026-09-10 15:36 CEST for Bellguard's memory (sudo journal). That stop is not in the NixOS configuration, so each `nixos-rebuild switch` today started those units again; both times the same `systemctl stop ...` was run right after, restoring the previous state (units `inactive`; `jicofo` and `docker-cal-com` show `failed` after SIGTERM, which is also stopped). Memory after: 5.1 GB available. Restore: `sudo systemctl start redis-nextcloud redis-cal-com phpfpm-nextcloud nextcloud-cron.timer docker-cal-com prosody jicofo jitsi-videobridge2`. Recorded in netcub `docs/attestat.md` as well (commit `82d8891` there, local, not pushed).
- FACT: relay and bridge use about 20 MB each (cgroup `MemoryCurrent`).

## Redeploy the binaries

1. Rebuild as above (copy the tree, add the vendored openssl line, `cargo zigbuild ...`).
2. Copy through a pipe and restart:

```
cat <target>/x86_64-unknown-linux-musl/release/verifier-service \
  | ssh cloud 'sudo sh -c "umask 027; cat > /var/lib/attestat/bin/verifier-service; chown root:attestat /var/lib/attestat/bin/verifier-service; chmod 0750 /var/lib/attestat/bin/verifier-service"'
ssh cloud 'sudo systemctl restart attestat-relay && sleep 2 && curl -s http://127.0.0.1:8090/health'
```

Same for `nachweis-bridge` and `attestat-bridge` (`:8787/health`). Env changes: edit the env file as root, restart the unit. The NixOS module itself changes only through the netcub repo and `scripts/deploy-flake.sh` (and then re-stop the collaboration units, see above).

## Rotate the tokens

- `BRIDGE_ISSUER_TOKEN`: `ssh cloud 'sudo sed -i "s/^BRIDGE_ISSUER_TOKEN=.*/BRIDGE_ISSUER_TOKEN=$(openssl rand -hex 32)/" /var/lib/attestat/secrets/bridge.env && sudo systemctl restart attestat-bridge'`. The app does not carry this token (only the bridge's issuer routes `approve`, `revoke`, `attest-operator` need it); the issuer console signs with the connected wallet.
- `OPERATOR_PRIVATE_KEY`: the replacement must be an operator of the policy on the registry (`setOperator`). Replace the line through a pipe (never on a command line), restart the bridge; `GET /health` shows the new operator address.
- Registrar identity (`rp.key`, `access-leaf.pem`): replace both files, restart the relay; the startup log prints the new `client_id`.

## App deployment

- FACT: worktree `/Users/bioharz/git/ethglobal/nachweis-app-wt-hosted` on branch `hosted-services` from `main` (`7ef18b2`), `bun install --frozen-lockfile`, then `bun run build` and `vercel build --prod --yes` with the exports of `docs/hosting-app-vercel.md` plus `VITE_VERIFIER_URL=https://relay.attestat.dev`, `VITE_VERIFIER_MODE=relay`, `VITE_BRIDGE_URL=https://bridge.attestat.dev`; `VITE_DEV_*` unset (`env | grep -c VITE_DEV` printed 0). The app strips trailing slashes and appends `/relay/request` etc. itself (`src/config.ts`, `src/verifier.ts`, `src/lib/browserProver.ts`), so the values carry no trailing slash and no path. With `VITE_BRIDGE_URL` set the page creates its session at the bridge (`POST /sessions`) and takes the relay base from the bridge's handoff (`HANDOFF_VERIFIER_URL`), which is why that variable is set on the bridge.
- FACT: `vercel deploy --prebuilt --prod --yes` from the worktree's `app/` (linked to project `attestat-app` by copying the git-ignored `app/.vercel/project.json` from the main checkout): deployment `attestat-9iob7erx5-7118eth-protonmes-projects.vercel.app`, aliased to https://app.attestat.dev.
- FACT: the served entry `/assets/index-CxxpUhku.js` contains `https://relay.attestat.dev` and `https://bridge.attestat.dev` (two occurrences each); the served `chainConfig-*.js` chunk carries `VITE_VERIFIER_URL:\`https://relay.attestat.dev\``, `VITE_BRIDGE_URL:\`https://bridge.attestat.dev\``, `VITE_VERIFIER_MODE:\`relay\``. The literal `http://localhost:3000` that remains in that chunk is the `??` fallback of `src/config.ts`, not reachable when the env value is set.

## Verification (FACT, from the Mac, `curl --noproxy '*'`)

- `GET https://relay.attestat.dev/health`: 200 `{"status":"ok","service":"verifier-service"}`.
- `POST https://relay.attestat.dev/relay/request` (body as `browser-real-wallet-up.sh`'s probe: throwaway P-256 `client_jwk`, `bound_address`, random 32-byte `challenge`; `Origin: https://app.attestat.dev`): 201; `request_uri`, `status_url`, `pickup_url` on `https://relay.attestat.dev/`; `openid4vp_uri` with `client_id=x509_hash:VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI`, identical to the value in all eight local tunnel runs' `verifier.log`. `GET <request_uri>`: 200, a signed request object (JWT header with `x5c`). The relay's CORS layer is `CorsLayer::permissive()` (CLAIM from `handlers.rs:89`).
- `GET https://bridge.attestat.dev/health`: 200, `mode local`, `proof_mode mock`, `require_address_proof true`, `issuer_routes token`, registry `0xed46...ad53`, operator `0x452a...900a`, `noir_verifier 0x4497...757a`.
- `OPTIONS https://bridge.attestat.dev/sessions` with `Origin: https://app.attestat.dev`, `Access-Control-Request-Method: POST`: 200, `access-control-allow-origin: https://app.attestat.dev`, `access-control-allow-methods: *`, `access-control-allow-headers: *`.
- `POST https://bridge.attestat.dev/sessions {"bound_address": ...}` from that origin: 200, session id and nonce, the CORS header echoed; `GET /sessions/<id>/handoff`: `verifier_url https://relay.attestat.dev`, `bridge_url https://bridge.attestat.dev`, `state created`.
- https://app.attestat.dev serves the new bundle (see above); `<title>Attestat</title>`.

## Not verified

- The phone wallet path against relay.attestat.dev: the official test wallet fetching the request object, consenting, posting the JWE to `POST /response/:id`, the tab picking it up. The leaf's DNS SAN is `localhost` (FACT, `openssl x509`), the same leaf worked through trycloudflare hostnames on 2026-09-08 to 2026-09-12 (`docs/live-phone-path.md`, the run logs), so the hostname should not matter (CLAIM). Only the builder can test this with the phone.
- The browser journey end to end on the public page: MetaMask connect, session signature, "Prove in this browser" (bb.js under COOP and COEP on the Vercel origin), `noir-proof` through nginx (300 s read timeout), approve from the operator wallet, subscribe, swap. Not driven headless in this session.
- Reboot behaviour of the two units (enabled, binaries and env outside the store; not rebooted). ACME renewal (timers present, not exercised).
- The bridge's `sessions` table is in memory: a restart of `attestat-bridge` drops open sessions (CLAIM from the service README's privacy statement).
