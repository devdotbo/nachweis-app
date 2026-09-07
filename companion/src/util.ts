// Small helpers shared by every subcommand: bytes, hex, base64url, hashing, logging.
import { createHash, randomBytes } from "node:crypto";

export const sha256 = (b: Uint8Array | string): Buffer =>
  createHash("sha256").update(typeof b === "string" ? Buffer.from(b, "utf8") : b).digest();

export const b64url = (b: Uint8Array | Buffer | string): string =>
  Buffer.from(typeof b === "string" ? Buffer.from(b, "utf8") : b).toString("base64url");
export const fromB64url = (s: string): Buffer => Buffer.from(s, "base64url");

export const hex = (b: Uint8Array | Buffer): string => Buffer.from(b).toString("hex");
export const hex0x = (b: Uint8Array | Buffer): string => "0x" + hex(b);
export const fromHex = (s: string): Buffer => {
  const clean = s.trim().replace(/^0x/i, "");
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) throw new Error(`not hex: ${s.slice(0, 20)}`);
  return Buffer.from(clean, "hex");
};

export const random32 = (): Buffer => randomBytes(32);

/// The verifier's registered client_id (x509_hash of verifier/fixtures/live/access-leaf.pem), the
/// KB-JWT aud the circuit pins (AUD_FRAGMENT in circuits/pid-sdjwt/src/constants.nr, derived in
/// circuits/pid-sdjwt/REALISM.md). A new registrar leaf changes both.
export const PINNED_AUD = "x509_hash:VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI";

/// The nonce the verifier, the circuit and the contract all compute: sha256(address20 || challenge32).
export function nonceOf(address20: Uint8Array, challenge: Uint8Array): Buffer {
  if (address20.length !== 20) throw new Error("address must be 20 bytes");
  return sha256(Buffer.concat([Buffer.from(address20), Buffer.from(challenge)]));
}

export function parseAddress(s: string): Buffer {
  const b = fromHex(s);
  if (b.length !== 20 || !/^0x/i.test(s.trim())) throw new Error(`bound address must be 0x + 20 bytes, got ${s}`);
  return b;
}

export const nowUnix = (): number => Math.floor(Date.now() / 1000);

let quiet = false;
export function setQuiet(q: boolean): void {
  quiet = q;
}
/// Progress lines go to stderr so stdout stays machine-readable (the URI, JSON results).
export function log(msg: string): void {
  if (!quiet) process.stderr.write(`[companion ${new Date().toISOString().slice(11, 23)}] ${msg}\n`);
}

export function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const r = await fetch(url, init);
  const text = await r.text();
  let body: any = null;
  try {
    body = text.length ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: r.status, body };
}

export async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  return fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export class Timeline {
  private marks: Array<{ label: string; at: number }> = [];
  private t0 = Date.now();
  mark(label: string): void {
    this.marks.push({ label, at: Date.now() });
  }
  render(): string {
    let prev = this.t0;
    const lines = this.marks.map((m) => {
      const line = `${((m.at - this.t0) / 1000).toFixed(2).padStart(8)} s  +${((m.at - prev) / 1000).toFixed(2).padStart(6)} s  ${m.label}`;
      prev = m.at;
      return line;
    });
    return lines.join("\n");
  }
}
