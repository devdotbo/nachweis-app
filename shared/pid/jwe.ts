// Compact JWE decryption with plain WebCrypto, the wallet response path (OpenID4VP direct_post.jwt):
// ECDH-ES direct key agreement (P-256) with the Concat KDF of RFC 7518 section 4.6.2, then A128GCM
// or A256GCM with the protected header as AAD. No library, so it runs in a Web Worker as it is.
import { b64urlDecode, concat, latin1Encode, utf8Encode, type Bytes } from "./bytes";
import type { Jwk } from "./jose";

const u32be = (n: number): Bytes => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const lenPrefixed = (b: Uint8Array): Bytes => concat(u32be(b.length), b);

/** The tab's ephemeral key: a non-extractable ECDH CryptoKey, or a private JWK (tests, bun). */
export type PrivateKey = CryptoKey | Jwk;

async function importPrivate(key: PrivateKey): Promise<CryptoKey> {
  if (typeof CryptoKey !== "undefined" && key instanceof CryptoKey) return key;
  const jwk = key as Jwk;
  return globalThis.crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d, key_ops: ["deriveBits"] },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
}

export async function decryptCompactJwe(jwe: string, privateKey: PrivateKey): Promise<{ plaintext: Bytes; header: Record<string, unknown> }> {
  const parts = jwe.split(".");
  if (parts.length !== 5) throw new Error(`compact JWE has ${parts.length} parts, expected 5`);
  const [hB64, encKeyB64, ivB64, ctB64, tagB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(hB64))) as Record<string, any>;
  if (header.alg !== "ECDH-ES") throw new Error(`alg ${header.alg}, expected ECDH-ES`);
  if (encKeyB64 !== "") throw new Error("ECDH-ES direct mode carries no encrypted key");
  const keyBits = header.enc === "A128GCM" ? 128 : header.enc === "A256GCM" ? 256 : 0;
  if (!keyBits) throw new Error(`enc ${header.enc}, expected A128GCM or A256GCM`);
  const epk = header.epk as Jwk | undefined;
  if (!epk || epk.kty !== "EC" || epk.crv !== "P-256") throw new Error("epk is not a P-256 key");

  const subtle = globalThis.crypto.subtle;
  const priv = await importPrivate(privateKey);
  const pub = await subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: epk.x, y: epk.y }, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const z = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256));

  // Concat KDF, one SHA-256 round is enough for 128 or 256 bit keys.
  const otherInfo = concat(
    lenPrefixed(utf8Encode(header.enc)),
    lenPrefixed(header.apu ? b64urlDecode(header.apu) : new Uint8Array()),
    lenPrefixed(header.apv ? b64urlDecode(header.apv) : new Uint8Array()),
    u32be(keyBits),
  );
  const derived = new Uint8Array(await subtle.digest("SHA-256", concat(u32be(1), z, otherInfo))).slice(0, keyBits / 8);
  const cek = await subtle.importKey("raw", derived, { name: "AES-GCM" }, false, ["decrypt"]);
  const ciphertext = concat(b64urlDecode(ctB64), b64urlDecode(tagB64));
  const plaintext = new Uint8Array(
    await subtle.decrypt({ name: "AES-GCM", iv: b64urlDecode(ivB64), additionalData: latin1Encode(hB64), tagLength: 128 }, cek, ciphertext),
  ) as Bytes;
  return { plaintext, header };
}
