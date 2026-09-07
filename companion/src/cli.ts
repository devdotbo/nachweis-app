#!/usr/bin/env bun
// nachweis-companion: the holder's own device in the blind-relay flow.
//
//   request | wait | pickup | prove | submit | run | status
//   issuer-key | mint-test-presentation   (stand-in for the phone)
//
// Progress goes to stderr; the OpenID4VP URI, the QR and JSON results go to stdout.
import { existsSync } from "node:fs";
import { generateP256 } from "./crypto";
import { answerAsWallet, loadOrCreateIssuerKey } from "./mint";
import { defaultCircuitDir, prove } from "./prove";
import { terminalQr } from "./qr";
import { assertRequestIsOurs, createRelayRequest, fetchRequestObject, pickupResponse, relayStatus } from "./relay";
import { decryptJwe } from "./crypto";
import { defaultSessionPath, publicView, readSession, writeSession, type SessionFile } from "./session";
import { bridgeSession, isEligible, policyIdOf, submitDirect, submitToBridge } from "./submit";
import { fail, hex, log, nonceOf, nowUnix, parseAddress, random32, setQuiet, sleep, Timeline } from "./util";

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { cmd: string; flags: Flags; positional: string[] } {
  const [cmd = "help", ...rest] = argv;
  const flags: Flags = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < rest.length && !rest[i + 1].startsWith("--")) flags[a.slice(2)] = rest[++i];
      else flags[a.slice(2)] = true;
    } else positional.push(a);
  }
  return { cmd, flags, positional };
}

const str = (flags: Flags, name: string, env?: string, dflt?: string): string | undefined => {
  const v = flags[name];
  if (typeof v === "string") return v;
  if (env && process.env[env]) return process.env[env];
  return dflt;
};
const need = (flags: Flags, name: string, env?: string, dflt?: string): string => {
  const v = str(flags, name, env, dflt);
  if (v === undefined) fail(`--${name} is required${env ? ` (or ${env})` : ""}`);
  return v;
};
const num = (flags: Flags, name: string, env: string | undefined, dflt: number): number => {
  const v = str(flags, name, env);
  return v === undefined ? dflt : Number(v);
};
const sessionPath = (flags: Flags): string => str(flags, "session", "NACHWEIS_SESSION", defaultSessionPath())!;

const HELP = `nachweis-companion <command> [--flag value ...]

commands
  request      generate an ephemeral P-256 key, POST /relay/request, show the QR, write the session file
               --verifier URL (NACHWEIS_VERIFIER_URL, default http://127.0.0.1:8090)
               --address 0x... (NACHWEIS_ADDRESS)  --redirect-uri URI  --no-qr  --session FILE
  wait         poll /relay/status until responded     --timeout SECS (600) --interval SECS (2)
  pickup       fetch the JWE once, decrypt it locally  --show (print the presentation; off by default)
  prove        native pre-check, Prover.toml, nargo execute, bb prove -t evm, decode public inputs
               --kb-window SECS (600, 0 disables)  --aud (https://self-issued.me/v2)  --vct (urn:eudi:pid:de:1)
               --issuer-key-sec1 HEX (default: x5c leaf)  --circuit-dir DIR  --vk FILE  --no-bb-verify
  submit       POST /sessions/:id/noir-proof to the bridge  --bridge URL (NACHWEIS_BRIDGE_URL, default http://127.0.0.1:8787)
               --wallet-key 0x.. (NACHWEIS_WALLET_KEY, signs the EIP-191 address proof)  --address-proof-signature 0x..  --tier N
               --direct: attestWithProof yourself  --rpc URL (NACHWEIS_RPC_URL)  --registry 0x.. (NACHWEIS_REGISTRY)
                         --sender-key 0x.. (NACHWEIS_SENDER_KEY)  --policy-id (nachweis.pid.over18.v1)
  run          request, wait, pickup, prove, submit in one go (all flags above)
               --stub-wallet ISSUER_KEY_FILE: answer the request inline with a minted test presentation (no phone)
  status       print the session file without secrets or claims

stand-in for the phone
  issuer-key FILE                 create (if missing) the test issuer key; print its SEC1 hex and sha256 hash
  mint-test-presentation          mint an SD-JWT VC + KB-JWT for the request's nonce, encrypt to its key, POST it
               --issuer-key FILE  --session FILE | --request-uri URI  --aud (https://self-issued.me/v2)
               --nonce HEX (override, for negative tests)  --no-post (print the JWE only)
               --given-name NAME  --family-name NAME

env  NACHWEIS_COMPANION_DIR (default ~/.nachweis-companion), NACHWEIS_SESSION, NACHWEIS_CIRCUIT_DIR, NACHWEIS_VK
`;

async function cmdRequest(flags: Flags, tl?: Timeline): Promise<SessionFile> {
  const verifier = need(flags, "verifier", "NACHWEIS_VERIFIER_URL", "http://127.0.0.1:8090").replace(/\/+$/, "");
  const addressBytes = parseAddress(need(flags, "address", "NACHWEIS_ADDRESS"));
  const address = "0x" + hex(addressBytes);
  const challenge = random32();
  const { privateJwk, publicJwk } = await generateP256();
  const nonce = hex(nonceOf(addressBytes, challenge));
  log(`ephemeral P-256 key generated; challenge ${hex(challenge)}; nonce ${nonce}`);
  const created = await createRelayRequest(verifier, publicJwk, address, hex(challenge), str(flags, "redirect-uri"));
  if (created.nonce !== nonce) fail(`verifier computed nonce ${created.nonce}, we computed ${nonce}`);
  tl?.mark("relay session created");
  // Check the signed request before showing it to anyone: our key, our nonce.
  const ro = await fetchRequestObject(created.request_uri);
  assertRequestIsOurs(ro, publicJwk, nonce);
  log(`signed request checked: advertises our key, nonce ${nonce}, client_id ${ro.clientId}`);
  const session: SessionFile = {
    version: 1,
    created_at: nowUnix(),
    verifier_url: verifier,
    bound_address: address,
    challenge_hex: hex(challenge),
    nonce,
    client_jwk_private: privateJwk,
    client_jwk_public: publicJwk,
    session_id: created.session_id,
    request_uri: created.request_uri,
    openid4vp_uri: created.openid4vp_uri,
    pickup_url: created.pickup_url,
    pickup_token: created.pickup_token,
    status_url: created.status_url,
    response_code: created.response_code,
  };
  const path = sessionPath(flags);
  writeSession(path, session);
  log(`session ${created.session_id} written to ${path} (0600)`);
  process.stdout.write(created.openid4vp_uri + "\n");
  if (!flags["no-qr"]) process.stdout.write(await terminalQr(created.openid4vp_uri));
  return session;
}

async function cmdWait(flags: Flags, session: SessionFile, tl?: Timeline): Promise<void> {
  const timeout = num(flags, "timeout", undefined, 600);
  const interval = num(flags, "interval", undefined, 2);
  const deadline = Date.now() + timeout * 1000;
  let last = "";
  while (Date.now() < deadline) {
    const s = await relayStatus(session.status_url);
    if (s !== last) {
      log(`relay status: ${s}`);
      last = s;
    }
    if (s === "responded" || s === "picked_up") {
      tl?.mark(`wallet responded (status ${s})`);
      return;
    }
    await sleep(interval * 1000);
  }
  fail(`no wallet response within ${timeout} s`);
}

async function cmdPickup(flags: Flags, session: SessionFile, path: string, tl?: Timeline): Promise<SessionFile> {
  const p = await pickupResponse(session.pickup_url, session.pickup_token);
  tl?.mark("JWE picked up");
  if (p.nonce !== session.nonce) fail(`pickup nonce ${p.nonce} differs from the session nonce`);
  const { plaintext, protectedHeader } = await decryptJwe(p.jwe, session.client_jwk_private);
  tl?.mark("JWE decrypted locally");
  const body = JSON.parse(plaintext.toString("utf8"));
  const vp = body?.vp_token;
  if (!vp || typeof vp !== "object") fail("decrypted response has no vp_token");
  const [credId, value] = Object.entries(vp)[0] as [string, unknown];
  const presentation = Array.isArray(value) ? String(value[0]) : String(value);
  if (!presentation.includes("~")) fail("vp_token entry is not an SD-JWT presentation");
  log(`decrypted: alg ${protectedHeader.alg}, enc ${protectedHeader.enc}; vp_token[${credId}] is an SD-JWT with ${presentation.split("~").length - 2} disclosures (${presentation.length} bytes)`);
  const updated: SessionFile = { ...session, jwe_received_at: p.received_at, jwe_protected_header: protectedHeader, presentation, vp_credential_id: credId };
  writeSession(path, updated);
  if (flags.show) process.stdout.write(presentation + "\n");
  else log("presentation stored in the session file; not printed (use --show)");
  return updated;
}

async function cmdProve(flags: Flags, session: SessionFile, path: string, tl?: Timeline): Promise<SessionFile> {
  const proof = await prove(session, path, {
    issuerKeySec1Hex: str(flags, "issuer-key-sec1", "NACHWEIS_ISSUER_KEY_SEC1_HEX"),
    expectedVct: str(flags, "vct", "NACHWEIS_EXPECTED_VCT", "urn:eudi:pid:de:1")!,
    expectedAud: str(flags, "aud", "NACHWEIS_EXPECTED_AUD", "https://self-issued.me/v2")!,
    kbWindowSecs: num(flags, "kb-window", "NACHWEIS_KB_WINDOW_SECS", 600),
    circuitDir: str(flags, "circuit-dir", "NACHWEIS_CIRCUIT_DIR", defaultCircuitDir())!,
    vkPath: str(flags, "vk", "NACHWEIS_VK"),
    skipBbVerify: Boolean(flags["no-bb-verify"]),
  });
  tl?.mark(`proved (bb prove ${(proof!.timings_ms.bb_prove_ms / 1000).toFixed(2)} s)`);
  const updated: SessionFile = { ...session, proof };
  writeSession(path, updated);
  process.stdout.write(JSON.stringify({ public_inputs: proof!.decoded, proof_bytes: (proof!.proof_hex.length - 2) / 2, timings_ms: proof!.timings_ms }, null, 2) + "\n");
  return updated;
}

async function cmdSubmit(flags: Flags, session: SessionFile, path: string, tl?: Timeline): Promise<SessionFile> {
  let patch: Partial<SessionFile>;
  if (flags.direct) {
    patch = await submitDirect(session, {
      rpcUrl: need(flags, "rpc", "NACHWEIS_RPC_URL", "http://127.0.0.1:8545"),
      registry: need(flags, "registry", "NACHWEIS_REGISTRY") as `0x${string}`,
      senderKey: need(flags, "sender-key", "NACHWEIS_SENDER_KEY") as `0x${string}`,
      policyId: policyIdOf(str(flags, "policy-id", "NACHWEIS_POLICY_ID")),
      tier: flags.tier ? Number(flags.tier) : undefined,
    });
  } else {
    patch = await submitToBridge(session, {
      bridgeUrl: need(flags, "bridge", "NACHWEIS_BRIDGE_URL", "http://127.0.0.1:8787").replace(/\/+$/, ""),
      walletKey: str(flags, "wallet-key", "NACHWEIS_WALLET_KEY") as `0x${string}` | undefined,
      addressProofSignature: str(flags, "address-proof-signature") as `0x${string}` | undefined,
      tier: flags.tier ? Number(flags.tier) : undefined,
    });
  }
  tl?.mark(`attested on chain (tx ${patch.tx_hash})`);
  const updated: SessionFile = { ...session, ...patch };
  writeSession(path, updated);
  process.stdout.write(JSON.stringify({ tx_hash: patch.tx_hash, attested: patch.attested }, null, 2) + "\n");
  return updated;
}

async function cmdMint(flags: Flags, tl?: Timeline): Promise<void> {
  const issuer = await loadOrCreateIssuerKey(need(flags, "issuer-key", "NACHWEIS_TEST_ISSUER_KEY"));
  let requestUri = str(flags, "request-uri");
  if (!requestUri) {
    const p = sessionPath(flags);
    if (!existsSync(p)) fail("--request-uri or an existing --session file is required");
    requestUri = readSession(p).request_uri;
  }
  const r = await answerAsWallet({
    requestUri,
    issuer,
    aud: str(flags, "aud", "NACHWEIS_EXPECTED_AUD", "https://self-issued.me/v2")!,
    nonceOverride: str(flags, "nonce"),
    post: !flags["no-post"],
    givenName: str(flags, "given-name"),
    familyName: str(flags, "family-name"),
  });
  tl?.mark("stand-in wallet posted the JWE");
  if (flags["no-post"]) process.stdout.write(r.jwe + "\n");
  else process.stdout.write(JSON.stringify({ posted: r.status, body: r.body }) + "\n");
}

async function main(): Promise<void> {
  const { cmd, flags, positional } = parseArgs(process.argv.slice(2));
  if (flags.quiet) setQuiet(true);
  const path = sessionPath(flags);
  switch (cmd) {
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return;
    case "request":
      await cmdRequest(flags);
      return;
    case "wait":
      await cmdWait(flags, readSession(path));
      return;
    case "pickup":
      await cmdPickup(flags, readSession(path), path);
      return;
    case "prove":
      await cmdProve(flags, readSession(path), path);
      return;
    case "submit":
      await cmdSubmit(flags, readSession(path), path);
      return;
    case "status": {
      const s = readSession(path);
      const view: Record<string, unknown> = publicView(s);
      if (s.bridge_session_id && s.bridge_url) {
        const b = await bridgeSession(s.bridge_url, s.bridge_session_id).catch((e) => ({ error: String(e) }));
        delete b.proof_hex;
        delete b.public_values_hex;
        view.bridge = b;
      }
      const registry = str(flags, "registry", "NACHWEIS_REGISTRY");
      if (registry) view.is_eligible = await isEligible(str(flags, "rpc", "NACHWEIS_RPC_URL", "http://127.0.0.1:8545")!, registry as `0x${string}`, s.bound_address as `0x${string}`, policyIdOf(str(flags, "policy-id", "NACHWEIS_POLICY_ID")));
      process.stdout.write(JSON.stringify(view, null, 2) + "\n");
      return;
    }
    case "issuer-key": {
      const p = positional[0] ?? str(flags, "issuer-key", "NACHWEIS_TEST_ISSUER_KEY");
      if (!p) fail("issuer-key FILE");
      const k = await loadOrCreateIssuerKey(p);
      process.stdout.write(JSON.stringify({ file: p, issuer_key_sec1_hex: k.sec1_hex, issuer_key_hash: k.issuer_key_hash }, null, 2) + "\n");
      return;
    }
    case "mint-test-presentation":
      await cmdMint(flags);
      return;
    case "run": {
      const tl = new Timeline();
      let s = await cmdRequest(flags, tl);
      if (flags["stub-wallet"]) {
        await cmdMint({ ...flags, "issuer-key": String(flags["stub-wallet"]), session: path }, tl);
      } else {
        log("scan the QR with the wallet; waiting for the response");
      }
      await cmdWait(flags, s, tl);
      s = await cmdPickup(flags, s, path, tl);
      s = await cmdProve(flags, s, path, tl);
      s = await cmdSubmit(flags, s, path, tl);
      process.stderr.write("\ntimeline\n" + tl.render() + "\n");
      return;
    }
    default:
      fail(`unknown command ${cmd}\n${HELP}`);
  }
}

main().catch((e) => {
  process.stderr.write(`error: ${e?.message ?? e}\n`);
  process.exit(1);
});
