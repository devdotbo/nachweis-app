// Minimal DER reader: enough to take the P-256 public key out of an x5c leaf certificate.
// Shared by the companion (bun) and the web app; the certificate encoder stays in companion/src/der.ts.
import { hexEncode, type Bytes } from "./bytes";

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
export function publicKeyFromCertificate(der: Uint8Array): Bytes {
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
  const curveOid = hexEncode(der.subarray(algChildren[1].start, algChildren[1].end));
  if (curveOid !== "2a8648ce3d030107") throw new Error(`x5c leaf key is not P-256 (curve OID ${curveOid})`);
  const key = new Uint8Array(der.subarray(bits.start + 1, bits.end)) as Bytes; // skip the unused-bits byte
  if (key.length !== 65 || key[0] !== 0x04) throw new Error(`x5c leaf key is not an uncompressed point (${key.length} bytes)`);
  return key;
}
