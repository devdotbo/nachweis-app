// JWS reading and ES256 verification on WebCrypto, shared by the companion and the web app.
import { b64urlDecode, b64urlEncode, latin1Encode, own, utf8Decode, type Bytes } from "./bytes";

export type Jwk = Record<string, string>;

export interface Jws {
  header: any;
  payloadRaw: Bytes;
  payload: any;
  signature: Bytes;
  signingInput: string;
}

/// Compact JWS: base64url(header).base64url(payload).base64url(sig).
export function splitJws(jws: string): Jws {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error(`compact JWS has ${parts.length} parts, expected 3`);
  const [h, p, s] = parts;
  const payloadRaw = b64urlDecode(p);
  return {
    header: JSON.parse(utf8Decode(b64urlDecode(h))),
    payloadRaw,
    payload: JSON.parse(utf8Decode(payloadRaw)),
    signature: b64urlDecode(s),
    signingInput: `${h}.${p}`,
  };
}

export function jwkFromSec1(sec1: Uint8Array): Jwk {
  if (sec1.length !== 65 || sec1[0] !== 4) throw new Error("SEC1 key must be 65 bytes, uncompressed");
  return { kty: "EC", crv: "P-256", x: b64urlEncode(sec1.subarray(1, 33)), y: b64urlEncode(sec1.subarray(33, 65)) };
}

/// ES256 over the signing input with a raw 64-byte r||s signature (JWS form).
export async function es256Verify(publicJwk: Jwk, signingInput: string, sig: Uint8Array): Promise<boolean> {
  if (sig.length !== 64) return false;
  const key = await globalThis.crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: publicJwk.x, y: publicJwk.y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return globalThis.crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, own(sig), latin1Encode(signingInput));
}
