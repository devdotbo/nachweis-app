// Compact JWE decryption with plain WebCrypto, the wallet response path (OpenID4VP direct_post.jwt):
// ECDH-ES direct key agreement (P-256) with the Concat KDF of RFC 7518 section 4.6.2, then A128GCM
// or A256GCM with the protected header as AAD. No library; this is what the browser can do natively.

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;
const b64uToBytes = (s: string): Bytes => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const u32be = (n: number): Bytes => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const lenPrefixed = (b: Bytes): Bytes => concat(u32be(b.length), b);
const concat = (...parts: Bytes[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

export interface Jwk {
  kty: string;
  crv: string;
  x: string;
  y: string;
  d?: string;
}

export async function decryptCompactJwe(jwe: string, privateJwk: Jwk): Promise<{ plaintext: Uint8Array; header: Record<string, unknown> }> {
  const parts = jwe.split(".");
  if (parts.length !== 5) throw new Error(`compact JWE has ${parts.length} parts, expected 5`);
  const [hB64, encKeyB64, ivB64, ctB64, tagB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64uToBytes(hB64))) as Record<string, any>;
  if (header.alg !== "ECDH-ES") throw new Error(`alg ${header.alg}, expected ECDH-ES`);
  if (encKeyB64 !== "") throw new Error("ECDH-ES direct mode carries no encrypted key");
  const keyBits = header.enc === "A128GCM" ? 128 : header.enc === "A256GCM" ? 256 : 0;
  if (!keyBits) throw new Error(`enc ${header.enc}, expected A128GCM or A256GCM`);
  const epk = header.epk as Jwk;
  if (!epk || epk.kty !== "EC" || epk.crv !== "P-256") throw new Error("epk is not a P-256 key");

  const subtle = crypto.subtle;
  const priv = await subtle.importKey("jwk", { ...privateJwk, key_ops: ["deriveBits"] } as JsonWebKey, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const pub = await subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: epk.x, y: epk.y } as JsonWebKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const z = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256));

  // Concat KDF, one SHA-256 round is enough for 128 or 256 bit keys.
  const otherInfo = concat(
    lenPrefixed(enc.encode(header.enc)),
    lenPrefixed(header.apu ? b64uToBytes(header.apu) : new Uint8Array()),
    lenPrefixed(header.apv ? b64uToBytes(header.apv) : new Uint8Array()),
    u32be(keyBits),
  );
  const derived = new Uint8Array(await subtle.digest("SHA-256", concat(u32be(1), z, otherInfo))).slice(0, keyBits / 8) as Bytes;
  const cek = await subtle.importKey("raw", derived, { name: "AES-GCM" }, false, ["decrypt"]);
  const ciphertext = concat(b64uToBytes(ctB64), b64uToBytes(tagB64));
  const plaintext = new Uint8Array(
    await subtle.decrypt({ name: "AES-GCM", iv: b64uToBytes(ivB64), additionalData: enc.encode(hB64), tagLength: 128 }, cek, ciphertext),
  );
  return { plaintext, header };
}
