// Minimal DER: enough to read the P-256 public key out of an x5c leaf certificate and to build
// a self-signed leaf for the test issuer. No general-purpose ASN.1, no extensions.

export interface Tlv {
  tag: number;
  start: number; // offset of the first content byte
  end: number; // offset after the last content byte
  next: number; // offset after this TLV
}

export function readTlv(buf: Uint8Array, offset: number): Tlv {
  const tag = buf[offset];
  let len = buf[offset + 1];
  let p = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error(`DER: unsupported length form at ${offset}`);
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[p++];
  }
  if (p + len > buf.length) throw new Error(`DER: element at ${offset} runs past the end`);
  return { tag, start: p, end: p + len, next: p + len };
}

export function children(buf: Uint8Array, tlv: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let p = tlv.start;
  while (p < tlv.end) {
    const c = readTlv(buf, p);
    out.push(c);
    p = c.next;
  }
  return out;
}

/// SEC1 uncompressed P-256 point (65 bytes) from the SubjectPublicKeyInfo of an X.509 certificate.
export function publicKeyFromCertificate(der: Uint8Array): Buffer {
  const cert = readTlv(der, 0);
  if (cert.tag !== 0x30) throw new Error("DER: certificate is not a SEQUENCE");
  const tbs = readTlv(der, cert.start);
  if (tbs.tag !== 0x30) throw new Error("DER: tbsCertificate is not a SEQUENCE");
  const fields = children(der, tbs);
  // [0] version (optional), serial, signature alg, issuer, validity, subject, spki
  let i = 0;
  if (fields[0].tag === 0xa0) i = 1;
  const spki = fields[i + 5];
  if (!spki || spki.tag !== 0x30) throw new Error("DER: subjectPublicKeyInfo not found");
  const [alg, bits] = children(der, spki);
  if (bits.tag !== 0x03) throw new Error("DER: subjectPublicKey is not a BIT STRING");
  const algChildren = children(der, alg);
  const curveOid = Buffer.from(der.subarray(algChildren[1].start, algChildren[1].end)).toString("hex");
  if (curveOid !== "2a8648ce3d030107") throw new Error(`x5c leaf key is not P-256 (curve OID ${curveOid})`);
  const key = Buffer.from(der.subarray(bits.start + 1, bits.end)); // skip the unused-bits byte
  if (key.length !== 65 || key[0] !== 0x04) throw new Error(`x5c leaf key is not an uncompressed point (${key.length} bytes)`);
  return key;
}

// ---- encoding, for the self-signed test issuer leaf ----

function lengthBytes(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  if (n < 0x100) return Buffer.from([0x81, n]);
  if (n < 0x10000) return Buffer.from([0x82, n >> 8, n & 0xff]);
  throw new Error("DER: length too large");
}

export function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), lengthBytes(content.length), content]);
}
export const seq = (...parts: Buffer[]): Buffer => tlv(0x30, Buffer.concat(parts));
export const set = (...parts: Buffer[]): Buffer => tlv(0x31, Buffer.concat(parts));
export const oid = (dotted: string): Buffer => {
  const parts = dotted.split(".").map(Number);
  const bytes: number[] = [parts[0] * 40 + parts[1]];
  for (const p of parts.slice(2)) {
    const stack: number[] = [];
    let v = p;
    do {
      stack.unshift(v & 0x7f);
      v >>= 7;
    } while (v > 0);
    for (let i = 0; i < stack.length - 1; i++) stack[i] |= 0x80;
    bytes.push(...stack);
  }
  return tlv(0x06, Buffer.from(bytes));
};
export const integer = (b: Buffer): Buffer => {
  let v = b;
  while (v.length > 1 && v[0] === 0 && (v[1] & 0x80) === 0) v = v.subarray(1);
  if (v[0] & 0x80) v = Buffer.concat([Buffer.from([0]), v]);
  return tlv(0x02, v);
};
export const utf8 = (s: string): Buffer => tlv(0x0c, Buffer.from(s, "utf8"));
export const utcTime = (d: Date): Buffer =>
  tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, "").slice(2, 14) + "Z", "ascii"));
export const bitString = (b: Buffer): Buffer => tlv(0x03, Buffer.concat([Buffer.from([0]), b]));
export const explicit0 = (b: Buffer): Buffer => tlv(0xa0, b);

/// ECDSA signature as DER SEQUENCE { r INTEGER, s INTEGER } from the raw r||s form.
export function ecdsaSigToDer(raw: Buffer): Buffer {
  return seq(integer(raw.subarray(0, 32)), integer(raw.subarray(32, 64)));
}
