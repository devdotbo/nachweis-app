# Attestat backoffice desk (WP38)

The issuer's compliance desk for the AttestationRegistry. It watches `Attested` events, proposes an
approval per new evidence, collects confirmations from two officers (`compliance` and `operations`,
a four-eyes rule), and once both confirmed sends `approve` (or `revoke`) from the registry operator
wallet. The operator may only call `approve` and `revoke` on the registry; everything else is refused.

Two modes (`BACKOFFICE_MODE`):

- `local`: the operator is a dev key on anvil. The 2-of-2 key quorum and the policy are simulated in
  memory from the same rule JSON the privy mode sends to Privy. No Privy credentials needed.
- `privy`: the operator is a Privy server wallet owned by a 2-of-2 key quorum of two P-256
  authorization keys and bound to a Privy policy. Privy's TEE enforces both.

## Run

```
bun install
bun test
bun run typecheck
BACKOFFICE_MODE=local REGISTRY=0x5FbDB2315678afecb367f032d93F642f64180aa3 bun run src/server.ts
```

Privy mode, one-time setup (needs `PRIVY_APP_ID` and `PRIVY_APP_SECRET` exported; writes `.env`
without them) and live checks (run from this directory so bun loads `.env`):

```
bun run scripts/bootstrap-privy.ts
bun run scripts/bootstrap-privy.ts --set-registry 0x...   # after a Sepolia deployment
bun run scripts/probe-privy.ts
```

Variables: see `.env.example`.

## HTTP routes (port 8794)

- `GET /health`
- `GET /desk`: mode, operator custody, quorum, policy rules (words and JSON), watcher state
- `GET /queue`: proposals, newest first
- `POST /queue/propose` `{ kind: "approve" | "revoke", subject }`
- `POST /queue/:id/confirm` `{ role: "compliance" | "operations" }`
- `POST /probe` `{ kind: "transfer" | "attestByOperator" | "single-signature" }`: sends something the
  policy or the quorum must refuse and reports the verdict verbatim

Bad input answers 400 with `{ error }`.
