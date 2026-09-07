// JOSE helpers on top of WebCrypto (bun): ES256 sign/verify with raw r||s signatures, P-256 JWK
// conversions, and JWE ECDH-ES compact encryption/decryption through `jose`.
import { CompactEncrypt, compactDecrypt, exportJWK, generateKeyPair, importJWK, type CompactJWEHeaderParameters, type JWK } from "jose";
import { b64url, fromB64url } from "./util";

const subtle = globalThis.crypto.subtle;

export type Jwk = Record<string, string>;

export async function generateP256(): Promise<{ privateJwk: Jwk; publicJwk: Jwk }> {
  const { privateKey, publicKey } = await generateKeyPair("ECDH-ES", { crv: "P-256", extractable: true });
  const priv = (await exportJWK(privateKey)) as Jwk;
  const pub = (await exportJWK(publicKey)) as Jwk;
  return {
    privateJwk: { kty: "EC", crv: "P-256", x: priv.x, y: priv.y, d: priv.d },
    publicJwk: { kty: "EC", crv: "P-256", x: pub.x, y: pub.y },
  };
}

export function sec1FromJwk(jwk: Jwk): Buffer {
  return Buffer.concat([Buffer.from([4]), fromB64url(jwk.x), fromB64url(jwk.y)]);
}

export function jwkFromSec1(sec1: Uint8Array): Jwk {
  if (sec1.length !== 65 || sec1[0] !== 4) throw new Error("SEC1 key must be 65 bytes, uncompressed");
  return { kty: "EC", crv: "P-256", x: b64url(sec1.subarray(1, 33)), y: b64url(sec1.subarray(33, 65)) };
}

async function importSigning(jwk: Jwk, usage: "sign" | "verify"): Promise<CryptoKey> {
  const key: JWK = { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ...(usage === "sign" ? { d: jwk.d } : {}) };
  return subtle.importKey("jwk", key, { name: "ECDSA", namedCurve: "P-256" }, false, [usage]);
}

/// ES256 over the signing input; returns the raw 64-byte r||s signature (JWS form).
export async function es256Sign(privateJwk: Jwk, signingInput: string | Uint8Array): Promise<Buffer> {
  const key = await importSigning(privateJwk, "sign");
  const data = typeof signingInput === "string" ? Buffer.from(signingInput, "ascii") : Buffer.from(signingInput);
  const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new Uint8Array(data));
  return Buffer.from(sig);
}

export async function es256Verify(publicJwk: Jwk, signingInput: string, sig: Uint8Array): Promise<boolean> {
  if (sig.length !== 64) return false;
  const key = await importSigning(publicJwk, "verify");
  return subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, new Uint8Array(sig), new Uint8Array(Buffer.from(signingInput, "ascii")));
}

/// Compact JWS: base64url(header).base64url(payload).base64url(sig).
export async function signCompact(privateJwk: Jwk, header: object, payload: object): Promise<string> {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const sig = await es256Sign(privateJwk, `${h}.${p}`);
  return `${h}.${p}.${b64url(sig)}`;
}

export interface Jws {
  header: any;
  payloadRaw: Buffer;
  payload: any;
  signature: Buffer;
  signingInput: string;
}

export function splitJws(jws: string): Jws {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error(`compact JWS has ${parts.length} parts, expected 3`);
  const [h, p, s] = parts;
  const payloadRaw = fromB64url(p);
  return {
    header: JSON.parse(fromB64url(h).toString("utf8")),
    payloadRaw,
    payload: JSON.parse(payloadRaw.toString("utf8")),
    signature: fromB64url(s),
    signingInput: `${h}.${p}`,
  };
}

/// Decrypt a compact JWE (ECDH-ES, A128GCM or A256GCM) with the ephemeral private key.
export async function decryptJwe(jwe: string, privateJwk: Jwk): Promise<{ plaintext: Buffer; protectedHeader: Record<string, unknown> }> {
  const key = await importJWK({ kty: "EC", crv: "P-256", x: privateJwk.x, y: privateJwk.y, d: privateJwk.d }, "ECDH-ES");
  const { plaintext, protectedHeader } = await compactDecrypt(jwe, key, {
    keyManagementAlgorithms: ["ECDH-ES"],
    contentEncryptionAlgorithms: ["A128GCM", "A256GCM"],
  });
  return { plaintext: Buffer.from(plaintext), protectedHeader: protectedHeader as Record<string, unknown> };
}

/// Encrypt to a public JWK the way the wallet does: ECDH-ES direct agreement, A128GCM.
export async function encryptJwe(plaintext: Uint8Array, publicJwk: Jwk, enc: "A128GCM" | "A256GCM" = "A128GCM"): Promise<string> {
  const key = await importJWK({ kty: "EC", crv: "P-256", x: publicJwk.x, y: publicJwk.y }, "ECDH-ES");
  const header: CompactJWEHeaderParameters = { alg: "ECDH-ES", enc };
  if (publicJwk.kid) header.kid = publicJwk.kid;
  return new CompactEncrypt(plaintext).setProtectedHeader(header).encrypt(key);
}
