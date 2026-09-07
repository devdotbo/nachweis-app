// Two-device handoff: the browser bound a bridge session to its wallet (EIP-191 address proof);
// this device joins that session and proves. Produced by the web app (app/src/lib/handoff.ts)
// and by the bridge (`GET /sessions/:id/handoff`, field `uri`); the Android app parses the same
// two forms (prover-android Handoff.kt).
//
//   compact JSON (the QR):  {"v":1,"s":"<session_id>","a":"0x<address>","c":"<challenge_hex>","r":"<verifier_url>","b":"<bridge_url>"}
//   URI (copy and paste):   nachweis://handoff?v=1&s=...&a=...&c=...&r=...&b=...
//   bridge JSON:            {session_id, bound_address, challenge_hex, nonce, verifier_url, bridge_url, expires_at}
import { hex, nonceOf, parseAddress } from "./util";

export interface Handoff {
  session_id: string;
  bound_address: string; // 0x + 40 lowercase hex
  challenge_hex: string; // 64 lowercase hex chars, no 0x
  nonce: string; // sha256(address20 || challenge32), 64 lowercase hex chars
  verifier_url?: string;
  bridge_url?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fromFields(f: Record<string, unknown>): Handoff {
  const v = f.v ?? f.version;
  if (v !== undefined && String(v) !== "1") throw new Error(`handoff version ${String(v)} not supported (expected 1)`);
  const session = String(f.s ?? f.session_id ?? "");
  if (!UUID.test(session)) throw new Error("handoff: session id is not a UUID");
  const addressBytes = parseAddress(String(f.a ?? f.bound_address ?? ""));
  const challengeRaw = String(f.c ?? f.challenge_hex ?? "").toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(challengeRaw)) throw new Error("handoff: challenge must be 32 bytes of hex");
  const strip = (u: unknown): string | undefined => {
    if (u === undefined || u === null || u === "") return undefined;
    const s = String(u).replace(/\/+$/, "");
    if (!/^https?:\/\//.test(s)) throw new Error(`handoff: URL ${s} is not http(s)`);
    return s;
  };
  const challenge = Buffer.from(challengeRaw, "hex");
  const nonce = hex(nonceOf(addressBytes, challenge));
  const given = f.nonce !== undefined ? String(f.nonce).toLowerCase().replace(/^0x/, "") : undefined;
  if (given && given !== nonce) throw new Error(`handoff: nonce ${given} is not sha256(address || challenge) ${nonce}`);
  return {
    session_id: session.toLowerCase(),
    bound_address: "0x" + hex(addressBytes),
    challenge_hex: challengeRaw,
    nonce,
    verifier_url: strip(f.r ?? f.verifier_url),
    bridge_url: strip(f.b ?? f.bridge_url),
  };
}

/** Accepts the compact JSON, the bridge's handoff JSON, or the nachweis://handoff URI. */
export function parseHandoff(input: string): Handoff {
  const s = input.trim();
  if (s.startsWith("{")) return fromFields(JSON.parse(s) as Record<string, unknown>);
  const m = /^nachweis:\/\/handoff\/?\?(.*)$/i.exec(s);
  if (m) {
    const q = new URLSearchParams(m[1]);
    const f: Record<string, unknown> = {};
    for (const [k, v] of q) f[k] = v;
    return fromFields(f);
  }
  throw new Error("handoff: expected a JSON object or a nachweis://handoff?... URI");
}

export function handoffUri(h: Handoff): string {
  const q = new URLSearchParams();
  q.set("v", "1");
  q.set("s", h.session_id);
  q.set("a", h.bound_address);
  q.set("c", h.challenge_hex);
  if (h.verifier_url) q.set("r", h.verifier_url);
  if (h.bridge_url) q.set("b", h.bridge_url);
  return `nachweis://handoff?${q.toString()}`;
}
