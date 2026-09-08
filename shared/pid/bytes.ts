// Byte helpers on Uint8Array and WebCrypto only, so the same code runs in a browser tab, in a Web
// Worker and in bun (companion CLI, circuits/tools). No Buffer, no node:crypto.

/** A Uint8Array over a plain ArrayBuffer, the type WebCrypto accepts. */
export type Bytes = Uint8Array<ArrayBuffer>;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP: Record<string, number> = {};
for (let i = 0; i < 64; i++) LOOKUP[ALPHABET[i]] = i;
LOOKUP["+"] = 62;
LOOKUP["/"] = 63;

/** base64url without padding, as node's `toString("base64url")`. */
export function b64urlEncode(b: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < b.length; i += 3) {
    const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  if (i + 1 === b.length) {
    const n = b[i] << 16;
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63];
  } else if (i + 2 === b.length) {
    const n = (b[i] << 16) | (b[i + 1] << 8);
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63];
  }
  return out;
}

/** Decodes base64url or base64, padded or not (node's `Buffer.from(s, "base64url")` accepts both). */
export function b64urlDecode(s: string): Bytes {
  const clean = s.replace(/[=\s]+$/g, "").replace(/\s/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (const c of clean) {
    const v = LOOKUP[c];
    if (v === undefined) throw new Error(`invalid base64url character ${JSON.stringify(c)}`);
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 255;
    }
  }
  return out.subarray(0, o) as Bytes;
}

export const utf8Encode = (s: string): Bytes => new TextEncoder().encode(s) as Bytes;
export const utf8Decode = (b: Uint8Array): string => new TextDecoder().decode(b);
/** Byte-exact string view (one char per byte), node's "latin1". */
export function latin1Decode(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
}
/** One byte per char (low 8 bits), node's "ascii" and "latin1" write behaviour. */
export function latin1Encode(s: string): Bytes {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
  return out;
}
/** UTF-8 byte length of a string (node's Buffer.byteLength). */
export const utf8Length = (s: string): number => utf8Encode(s).length;

export function hexEncode(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}
export function hexDecode(s: string): Bytes {
  const clean = s.trim().replace(/^0x/i, "");
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) throw new Error(`not hex: ${s.slice(0, 20)}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Copy into a fresh ArrayBuffer-backed array (WebCrypto refuses views over SharedArrayBuffer-like types). */
export const own = (b: Uint8Array): Bytes => new Uint8Array(b) as Bytes;

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export async function sha256(data: Uint8Array | string): Promise<Bytes> {
  const input = typeof data === "string" ? utf8Encode(data) : own(data);
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", input)) as Bytes;
}

/** The nonce the verifier, the circuit and the contract all compute: sha256(address20 || challenge32). */
export async function nonceOf(address20: Uint8Array, challenge32: Uint8Array): Promise<Bytes> {
  if (address20.length !== 20) throw new Error("address must be 20 bytes");
  if (challenge32.length !== 32) throw new Error("challenge must be 32 bytes");
  return sha256(concat(address20, challenge32));
}
