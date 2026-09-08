# Verifier relay patches

Patch series of the ETHOnline 2026 event work on the builder's pre-existing EUDI verifier.

- Upstream repository: https://github.com/Klartext-ID/klartext-verifier (licence: Apache License, see LICENSE in that repository)
- Base commit: a08d72c 2026-08-17 docs: reconcile the documented test counts with the workspace
- Exported head: 7262a32 on branch nachweis-relay, 10 commits
- Exported on: 2026-09-08 by scripts/export-relay-patches.sh

The patches are the complete diff of branch `nachweis-relay` against the base commit. They are event work and carry the upstream licence (Apache-2.0). Nothing else in that repository was changed during the event.

## Apply

```
git clone https://github.com/Klartext-ID/klartext-verifier
cd klartext-verifier
git checkout -b nachweis-relay a08d72c
git am /path/to/nachweis-app/vendor/verifier-relay-patches/*.patch
cargo test --workspace
```

## Series

- cbbd2f8 2026-09-07 Add blind-relay session table, client JWK validation and address-bound nonce
- 3f688a9 2026-09-07 Wire the blind-relay endpoints beside the default response path
- e53b000 2026-09-07 Test the blind-relay path end to end over the real router
- 971373c 2026-09-07 Document the blind-relay mode
- 03a6e2c 2026-09-07 Add verifier mode for the bridge: POST /request with a caller nonce, GET /result/:id with the presentation
- 79a80f6 2026-09-07 Test verifier mode end to end over the real router
- fa21004 2026-09-07 Document verifier mode for the bridge
- 8517398 2026-09-07 Record the josekit dev-dependency of verifier-service in Cargo.lock
- 86785d4 2026-09-08 Minimize GET /result/:id, gate plaintext behind RESULT_TOKEN, cap and expire bridge sessions
- 7262a32 2026-09-08 Document the minimized result, RESULT_TOKEN and the bridge session bounds
