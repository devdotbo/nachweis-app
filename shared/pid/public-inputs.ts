// The 86 public inputs of circuits/pid-sdjwt as bb.js returns them (32-byte hex words): subject
// 20 bytes, issuer_key_hash 32 bytes, over18, expiry (u64), nonce 32 bytes. Mirrors
// companion/src/prove.ts decodePublicInputs and service/src/noir.rs.

export interface DecodedPublicInputs {
  subject: string; // 0x + 40 hex
  issuer_key_hash: string; // 0x + 64 hex
  over18: number;
  expiry: number;
  nonce: string; // 0x + 64 hex
}

export function decodePublicInputWords(words: string[]): DecodedPublicInputs {
  if (words.length !== 86) throw new Error(`expected 86 public inputs, got ${words.length}`);
  const clean = words.map((w, i) => {
    const h = w.replace(/^0x/, "").toLowerCase();
    if (h.length !== 64 || !/^[0-9a-f]+$/.test(h)) throw new Error(`public input ${i} is not a 32-byte word`);
    return h;
  });
  const byteAt = (i: number): number => {
    const w = clean[i];
    if (!/^0{62}[0-9a-f]{2}$/.test(w)) throw new Error(`public input ${i} is not a byte`);
    return parseInt(w.slice(62), 16);
  };
  const bytes = (from: number, n: number) => "0x" + Array.from({ length: n }, (_, k) => byteAt(from + k).toString(16).padStart(2, "0")).join("");
  const expiryWord = clean[53];
  if (!/^0{48}/.test(expiryWord)) throw new Error("expiry public input exceeds u64");
  return {
    subject: bytes(0, 20),
    issuer_key_hash: bytes(20, 32),
    over18: byteAt(52),
    expiry: Number(BigInt("0x" + expiryWord.slice(48))),
    nonce: bytes(54, 32),
  };
}
