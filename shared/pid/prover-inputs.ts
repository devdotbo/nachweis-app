// Circuit inputs for circuits/pid-sdjwt from a prover-sp1 style input (SD-JWT presentation, issuer
// key, bound address, challenge). The pure part of circuits/tools/gen-prover.ts: the CLI reads the
// files and writes the Prover.toml, the web app's worker feeds the same object to noir_js.
//
// All offsets are byte offsets into the raw (base64url-decoded) JSON of the issuer payload, the
// KB-JWT header and payload, and (shapes B, C) the raw age object disclosure. The age shapes are
// described in circuits/pid-sdjwt/REALISM.md, section 3. Uint8Array and WebCrypto only.
import { b64urlDecode, b64urlEncode, concat, hexDecode, hexEncode, latin1Decode, latin1Encode, sha256, utf8Decode, utf8Length, type Bytes } from "./bytes";

/** Max lengths and the pinned aud, read from constants.nr so tool and circuit cannot drift. */
export interface CircuitConstants {
  HEADER_B64_MAX: number;
  PAYLOAD_MAX_LEN: number;
  TAIL_MAX: number;
  KB_HEADER_MAX: number;
  KB_PAYLOAD_MAX: number;
  SALT_MAX_LEN: number;
  AGE_OBJ_DISC_MAX: number;
  CNF_WINDOW: number;
  PINNED_AUD: string;
}

export function parseCircuitConstants(constantsSrc: string): CircuitConstants {
  const constant = (name: string): number => {
    const m = constantsSrc.match(new RegExp(`pub global ${name}: u32 = (\\d+);`));
    if (!m) throw new Error(`constant ${name} not found in constants.nr`);
    return Number(m[1]);
  };
  const audMatch = constantsSrc.match(/AUD_FRAGMENT: \[u8; \d+\] =\s*"\\"aud\\":\\"([^"\\]+)\\""\.as_bytes\(\);/);
  if (!audMatch) throw new Error("AUD_FRAGMENT not found in constants.nr");
  return {
    HEADER_B64_MAX: constant("HEADER_B64_MAX"),
    PAYLOAD_MAX_LEN: constant("PAYLOAD_MAX_LEN"),
    TAIL_MAX: constant("TAIL_MAX"),
    KB_HEADER_MAX: constant("KB_HEADER_MAX"),
    KB_PAYLOAD_MAX: constant("KB_PAYLOAD_MAX"),
    SALT_MAX_LEN: constant("SALT_MAX_LEN"),
    AGE_OBJ_DISC_MAX: constant("AGE_OBJ_DISC_MAX"),
    CNF_WINDOW: constant("CNF_WINDOW"),
    PINNED_AUD: audMatch[1],
  };
}

/** prover-sp1 input.json layout (companion `prove` writes the same object). */
export interface ProverInput {
  presentation: string;
  issuer_key_sec1_hex: string;
  expected_vct?: string;
  expected_aud: string;
  bound_address_hex: string;
  challenge_hex: string;
}

export type TamperMode = "" | "issuer-sig" | "age-disclosure" | "nonce" | "kb-sig" | "hdr-window";
export const TAMPER_MODES: readonly TamperMode[] = ["", "issuer-sig", "age-disclosure", "nonce", "kb-sig", "hdr-window"];
export type AgeShape = "A" | "B" | "C";

/** Noir BoundedVec<u8, MAX> as noir_js takes it. */
export interface BoundedVec {
  storage: number[];
  len: number;
}

/** The circuit's inputs in the field order of the Prover.toml. */
export interface ProverInputs {
  issuer_header_b64: BoundedVec;
  hdr_window_b64_start: number;
  hdr_alg_offset: number;
  hdr_typ_offset: number;
  payload: BoundedVec;
  issuer_sig_b64: number[];
  issuer_sig: number[];
  disclosures_tail: BoundedVec;
  kb_header: BoundedVec;
  kb_alg_offset: number;
  kb_typ_offset: number;
  kb_payload: BoundedVec;
  kb_signature: number[];
  issuer_pub_x: number[];
  issuer_pub_y: number[];
  age_salt: BoundedVec;
  age_obj_disclosed: number;
  age_leaf_disclosed: number;
  age_obj_disclosure: BoundedVec;
  sd_offset: number;
  age_obj_digest_offset: number;
  age_sd_offset: number;
  age_target_offset: number;
  vct_offset: number;
  cnf_offset: number;
  x_offset: number;
  y_offset: number;
  exp_offset: number;
  kb_aud_offset: number;
  kb_nonce_offset: number;
  kb_sd_hash_offset: number;
  challenge: number[];
  subject: number[];
}

/** The five public outputs the circuit will commit, predicted from the inputs. Hex with 0x. */
export interface ExpectedPublicOutputs {
  issuer_key_hash: string;
  over18: 1;
  expiry: number;
  nonce: string;
  subject: string;
}

export interface GeneratedInputs {
  inputs: ProverInputs;
  shape: AgeShape;
  tamper: TamperMode;
  /** The one-line layout summary gen-prover.ts prints (sizes against the maxima). */
  summary: string;
  expected: ExpectedPublicOutputs;
}

// The circuit decodes a 128-char (96-byte) window of the issuer header that starts at a
// 4-aligned base64url offset chosen here; alg and typ must both lie inside it.
const HEADER_WINDOW_B64 = 128;
const HEADER_WINDOW_RAW = 96;

// The ECDSA blackbox in Noir/Barretenberg only accepts low-s signatures. The circuit gets the
// low-s form and checks it against the base64url signature that stays in the sd_hash preimage
// (same r, s or n - s).
const P256_N = BigInt("0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551");
function lowS(sig: Uint8Array): Bytes {
  const s = BigInt("0x" + hexEncode(sig.subarray(32)));
  const ns = s > P256_N / 2n ? P256_N - s : s;
  return concat(sig.subarray(0, 32), hexDecode(ns.toString(16).padStart(64, "0")));
}

const uniqueIndex = (hay: string, needle: string, from = 0, label = needle): number => {
  const i = hay.indexOf(needle, from);
  if (i < 0) throw new Error(`${label} not found`);
  if (hay.indexOf(needle, i + 1) >= 0) throw new Error(`${label} occurs more than once; circuit assumes one`);
  return i;
};
// Byte offset (UTF-8) of a JS string index; payload fragments are ASCII but claim values may not be.
const byteOffset = (s: string, idx: number) => utf8Length(s.slice(0, idx));
const byteIndexOf = (hay: string, needle: string, from = 0) => {
  const i = hay.indexOf(needle, from);
  return i < 0 ? -1 : byteOffset(hay, i);
};
// Finds `needle` inside the array/object that opens right after `anchorEnd`, before any ] or }
// (the circuit checks the same: no closer between the container start and the target).
const targetInside = (hayBytes: string, anchorEnd: number, needle: string, label: string): number => {
  const t = hayBytes.indexOf(needle, anchorEnd);
  if (t < 0) throw new Error(`${label}: target not found`);
  const between = hayBytes.slice(anchorEnd, t);
  if (/[\]}]/.test(between)) throw new Error(`${label}: container closes before the target`);
  return t;
};

const bounded = (name: string, b: Uint8Array, max: number): BoundedVec => {
  if (b.length > max) throw new Error(`${name}: ${b.length} bytes exceeds max ${max}`);
  const storage = new Uint8Array(max);
  storage.set(b, 0);
  return { storage: Array.from(storage), len: b.length };
};
const list = (b: Uint8Array): number[] => Array.from(b);

export async function buildProverInputs(input: ProverInput, C: CircuitConstants, tamper: TamperMode = ""): Promise<GeneratedInputs> {
  if (!TAMPER_MODES.includes(tamper)) throw new Error(`unknown tamper mode ${tamper}`);
  const parts: string[] = input.presentation.split("~");
  if (parts.length < 2) throw new Error("presentation has no KB-JWT");
  const issuerJwt = parts[0];
  const kbJwt = parts[parts.length - 1];
  const disclosures = parts.slice(1, -1);
  const [headerB64, payloadB64, sigB64] = issuerJwt.split(".");
  const payloadRaw = b64urlDecode(payloadB64);
  const payloadJson = utf8Decode(payloadRaw);
  const payloadObj = JSON.parse(payloadJson);

  // Sanity: the circuit re-encodes the raw payload; the round trip must be exact.
  if (b64urlEncode(payloadRaw) !== payloadB64) throw new Error("payload base64url round trip differs");
  if (sigB64.length !== 86) throw new Error(`issuer signature base64url length ${sigB64.length}, expected 86`);
  if (headerB64.length < HEADER_WINDOW_B64) throw new Error(`issuer header shorter than ${HEADER_WINDOW_B64} base64url chars`);

  // --- issuer header: alg and typ inside one 96-byte window of the decoded header ----------
  // The window starts at base64url char hdrWindowStart (a multiple of 4), i.e. decoded byte
  // hdrWindowStart * 3 / 4; both fragments must fall inside its 96 bytes. Key order is free
  // (the Bundesdruckerei PID header has x5c, kid, typ, alg; docs/evidence/g0-2026-09-08.md).
  const headerJson = latin1Decode(b64urlDecode(headerB64)); // byte-exact view
  const hdrAlgAbs = headerJson.indexOf('"alg":"ES256"');
  const hdrTypAbs = (() => {
    const d = headerJson.indexOf('"typ":"dc+sd-jwt"');
    const v = headerJson.indexOf('"typ":"vc+sd-jwt"');
    return d >= 0 ? d : v;
  })();
  if (hdrAlgAbs < 0) throw new Error('issuer header: "alg":"ES256" not found');
  if (hdrTypAbs < 0) throw new Error('issuer header: "typ":"dc+sd-jwt" (or vc+sd-jwt) not found');
  const hdrLo = Math.min(hdrAlgAbs, hdrTypAbs);
  const hdrHi = Math.max(hdrAlgAbs + 13, hdrTypAbs + 17);
  // largest 4-aligned start whose window still begins at or before the first fragment,
  // clamped so the window ends inside the header
  const hdrMaxStart = Math.floor((headerB64.length - HEADER_WINDOW_B64) / 4) * 4;
  let hdrWindowStart = Math.min(Math.floor(hdrLo / 3) * 4, hdrMaxStart);
  let hdrWindowRaw = (hdrWindowStart / 4) * 3;
  if (hdrHi > hdrWindowRaw + HEADER_WINDOW_RAW) {
    throw new Error(`issuer header: "alg" (byte ${hdrAlgAbs}) and "typ" (byte ${hdrTypAbs}) do not share one ${HEADER_WINDOW_RAW}-byte window`);
  }
  const hdrAlgOffset = hdrAlgAbs - hdrWindowRaw;
  const hdrTypOffset = hdrTypAbs - hdrWindowRaw;

  // --- issuer payload offsets ---------------------------------------------------
  const vctOffset = uniqueIndex(payloadJson, '"vct":"urn:eudi:pid:de:1"');
  const cnfFragment = '"cnf":{"jwk":{';
  const cnfOffset = uniqueIndex(payloadJson, cnfFragment);
  const xOffset = payloadJson.indexOf('"x":"', cnfOffset);
  const yOffset = payloadJson.indexOf('"y":"', cnfOffset);
  if (xOffset < 0 || yOffset < 0) throw new Error("cnf.jwk x/y not found");
  if (xOffset >= cnfOffset + C.CNF_WINDOW || yOffset >= cnfOffset + C.CNF_WINDOW) throw new Error(`cnf.jwk x/y further than ${C.CNF_WINDOW} bytes after cnf`);
  const expOffset = uniqueIndex(payloadJson, '"exp":');
  if (!/^\d{10}[,}]/.test(payloadJson.slice(expOffset + 6))) throw new Error("issuer exp is not a 10 digit number");

  // --- age shape and witness -------------------------------------------------------
  const decodedDisc = await Promise.all(
    disclosures.map(async (d) => {
      const raw = b64urlDecode(d);
      const arr = JSON.parse(utf8Decode(raw));
      if (!Array.isArray(arr) || arr.length !== 3) throw new Error("only object-property disclosures are supported");
      return { b64: d, raw, arr, digest: b64urlEncode(await sha256(latin1Encode(d))) };
    }),
  );
  const leafDisc = decodedDisc.find((d) => d.arr[1] === "18" && d.arr[2] === true);
  const objDisc = decodedDisc.find((d) => d.arr[1] === "age_equal_or_over" && d.arr[2] && typeof d.arr[2] === "object");
  const ageInPayload = payloadObj.age_equal_or_over && typeof payloadObj.age_equal_or_over === "object";

  let shape: AgeShape;
  if (ageInPayload && Array.isArray(payloadObj.age_equal_or_over._sd)) shape = "A";
  else if (objDisc && Array.isArray(objDisc.arr[2]._sd)) shape = "B";
  else if (objDisc && objDisc.arr[2]["18"] === true) shape = "C";
  else throw new Error("no age_equal_or_over.18: neither nested _sd in the payload (A), nor a disclosed age object with _sd (B) or with plain values (C)");
  if ((shape === "A" || shape === "B") && !leafDisc) throw new Error('no presented disclosure ["salt","18",true]');

  let ageSalt = "";
  if (leafDisc) {
    ageSalt = String(leafDisc.arr[0]);
    // The circuit rebuilds the disclosure as ["<salt>","18",true] byte for byte.
    if (utf8Decode(leafDisc.raw) !== `["${ageSalt}","18",true]`) throw new Error("age disclosure is not in the canonical form the circuit rebuilds");
    if (utf8Length(ageSalt) > C.SALT_MAX_LEN) throw new Error("age salt exceeds SALT_MAX_LEN");
  }

  let ageObjDisclosed = 0;
  const ageLeafDisclosed = leafDisc ? 1 : 0;
  let ageObjRaw: Bytes = new Uint8Array(0);
  let sdOffset = 0;
  let ageObjDigestOffset = 0;
  let ageSdOffset = 0;
  let ageTargetOffset = 0;
  const leafDigestQuoted = leafDisc ? `"${leafDisc.digest}"` : "";
  if (shape === "A") {
    const frag = '"age_equal_or_over":{"_sd":[';
    ageSdOffset = uniqueIndex(payloadJson, frag);
    ageTargetOffset = targetInside(payloadJson, ageSdOffset + frag.length, leafDigestQuoted, "age_equal_or_over._sd");
  } else {
    ageObjDisclosed = 1;
    ageObjRaw = objDisc!.raw;
    if (ageObjRaw.length > C.AGE_OBJ_DISC_MAX) throw new Error(`age object disclosure ${ageObjRaw.length} bytes exceeds AGE_OBJ_DISC_MAX ${C.AGE_OBJ_DISC_MAX}`);
    const discJson = latin1Decode(ageObjRaw); // byte-exact view
    // anchor the object disclosure digest in the payload's "_sd" array that contains it
    const objDigestQuoted = `"${objDisc!.digest}"`;
    ageObjDigestOffset = byteIndexOf(payloadJson, objDigestQuoted);
    if (ageObjDigestOffset < 0) throw new Error("age object disclosure digest not in the issuer payload");
    const sdIdx = payloadJson.lastIndexOf('"_sd":[', payloadJson.indexOf(objDigestQuoted));
    if (sdIdx < 0) throw new Error('no "_sd":[ before the age object digest');
    sdOffset = byteOffset(payloadJson, sdIdx);
    targetInside(payloadJson, sdIdx + 7, objDigestQuoted, "top-level _sd");
    if (shape === "B") {
      const frag = '"age_equal_or_over",{"_sd":[';
      ageSdOffset = uniqueIndex(discJson, frag);
      ageTargetOffset = targetInside(discJson, ageSdOffset + frag.length, leafDigestQuoted, "disclosed age object _sd");
    } else {
      const frag = '"age_equal_or_over",{';
      ageSdOffset = uniqueIndex(discJson, frag);
      ageTargetOffset = targetInside(discJson, ageSdOffset + frag.length, '"18":true', "disclosed age object");
      if (!/[,}]/.test(discJson[ageTargetOffset + 9] ?? "")) throw new Error('"18":true not terminated by , or }');
    }
    // ["<salt>", must precede the claim name
    if (!discJson.startsWith('["') || discJson[ageSdOffset - 2] !== '"' || discJson[ageSdOffset - 1] !== "," || discJson.slice(2, ageSdOffset - 2).includes('"')) {
      throw new Error('age object disclosure is not ["<salt>","age_equal_or_over",{...');
    }
  }

  // --- KB-JWT --------------------------------------------------------------------
  const [kbHeaderB64, kbPayloadB64, kbSigB64] = kbJwt.split(".");
  const kbHeaderRaw = b64urlDecode(kbHeaderB64);
  const kbHeaderJson = latin1Decode(kbHeaderRaw);
  if (b64urlEncode(kbHeaderRaw) !== kbHeaderB64) throw new Error("KB header base64url round trip differs");
  const kbAlgOffset = kbHeaderJson.indexOf('"alg":"ES256"');
  const kbTypOffset = kbHeaderJson.indexOf('"typ":"kb+jwt"');
  if (kbAlgOffset < 0 || kbTypOffset < 0) throw new Error("KB-JWT header lacks alg ES256 or typ kb+jwt");
  const kbPayloadRaw = b64urlDecode(kbPayloadB64);
  const kbJson = utf8Decode(kbPayloadRaw);
  if (b64urlEncode(kbPayloadRaw) !== kbPayloadB64) throw new Error("KB payload base64url round trip differs");
  if (input.expected_aud !== C.PINNED_AUD) throw new Error(`circuit pins aud ${C.PINNED_AUD}; input expects ${input.expected_aud}`);
  const kbAudOffset = uniqueIndex(kbJson, `"aud":"${C.PINNED_AUD}"`);
  const kbNonceOffset = uniqueIndex(kbJson, '"nonce":"');
  const kbSdHashOffset = uniqueIndex(kbJson, '"sd_hash":"');

  const tail = "~" + disclosures.join("~") + "~";
  const sdHash = b64urlEncode(await sha256(latin1Encode(issuerJwt + tail)));
  const kbObj = JSON.parse(kbJson);
  if (kbObj.sd_hash !== sdHash) throw new Error("sd_hash in KB-JWT does not match the presentation");

  // --- keys, subject, challenge ----------------------------------------------------
  const sec1 = hexDecode(input.issuer_key_sec1_hex);
  if (sec1.length !== 65 || sec1[0] !== 4) throw new Error("issuer key must be SEC1 uncompressed (65 bytes)");
  const issuerX = sec1.subarray(1, 33);
  const issuerY = sec1.subarray(33, 65);
  const subject = hexDecode(input.bound_address_hex);
  let challenge = hexDecode(input.challenge_hex);
  if (subject.length !== 20 || challenge.length !== 32) throw new Error("subject must be 20 bytes, challenge 32 bytes");
  const nonce = hexEncode(await sha256(concat(subject, challenge)));
  if (kbObj.nonce !== nonce) throw new Error("KB-JWT nonce != hex(sha256(subject||challenge))");

  // --- tampering for negative tests --------------------------------------------------
  let issuerSigB64 = sigB64;
  let issuerSigRaw = b64urlDecode(sigB64);
  let kbSig = b64urlDecode(kbSigB64);
  switch (tamper) {
    case "":
      break;
    case "issuer-sig": // flip one bit of r, consistently in raw and base64url form
      issuerSigRaw = new Uint8Array(issuerSigRaw) as Bytes;
      issuerSigRaw[3] ^= 1;
      issuerSigB64 = b64urlEncode(issuerSigRaw);
      break;
    case "age-disclosure": // wrong salt: the digest is no longer in the age _sd (A, B); wrong object salt (C)
      if (shape === "C") {
        ageObjRaw = new Uint8Array(ageObjRaw) as Bytes;
        ageObjRaw[2] = ageObjRaw[2] === 0x41 ? 0x42 : 0x41;
      } else {
        ageSalt = (ageSalt[0] === "A" ? "B" : "A") + ageSalt.slice(1);
      }
      break;
    case "nonce": // different challenge, nonce in the KB-JWT no longer matches
      challenge = new Uint8Array(challenge) as Bytes;
      challenge[0] ^= 1;
      break;
    case "kb-sig":
      kbSig = new Uint8Array(kbSig) as Bytes;
      kbSig[5] ^= 1;
      break;
    case "hdr-window": // a window that does not contain the alg fragment; the relative offsets stay
      hdrWindowStart = hdrWindowStart > 0 ? 0 : hdrMaxStart;
      hdrWindowRaw = (hdrWindowStart / 4) * 3;
      if (hdrAlgAbs >= hdrWindowRaw && hdrAlgAbs + 13 <= hdrWindowRaw + HEADER_WINDOW_RAW) throw new Error("hdr-window tamper: the header is too short to place the window away from alg");
      break;
  }

  const inputs: ProverInputs = {
    issuer_header_b64: bounded("issuer_header_b64", latin1Encode(headerB64), C.HEADER_B64_MAX),
    hdr_window_b64_start: hdrWindowStart,
    hdr_alg_offset: hdrAlgOffset,
    hdr_typ_offset: hdrTypOffset,
    payload: bounded("payload", payloadRaw, C.PAYLOAD_MAX_LEN),
    issuer_sig_b64: list(latin1Encode(issuerSigB64)),
    issuer_sig: list(lowS(issuerSigRaw)),
    disclosures_tail: bounded("disclosures_tail", latin1Encode(tail), C.TAIL_MAX),
    kb_header: bounded("kb_header", kbHeaderRaw, C.KB_HEADER_MAX),
    kb_alg_offset: kbAlgOffset,
    kb_typ_offset: kbTypOffset,
    kb_payload: bounded("kb_payload", kbPayloadRaw, C.KB_PAYLOAD_MAX),
    kb_signature: list(lowS(kbSig)),
    issuer_pub_x: list(issuerX),
    issuer_pub_y: list(issuerY),
    age_salt: bounded("age_salt", latin1Encode(ageSalt), C.SALT_MAX_LEN),
    age_obj_disclosed: ageObjDisclosed,
    age_leaf_disclosed: ageLeafDisclosed,
    age_obj_disclosure: bounded("age_obj_disclosure", ageObjRaw, C.AGE_OBJ_DISC_MAX),
    sd_offset: sdOffset,
    age_obj_digest_offset: ageObjDigestOffset,
    age_sd_offset: ageSdOffset,
    age_target_offset: ageTargetOffset,
    vct_offset: vctOffset,
    cnf_offset: cnfOffset,
    x_offset: xOffset,
    y_offset: yOffset,
    exp_offset: expOffset,
    kb_aud_offset: kbAudOffset,
    kb_nonce_offset: kbNonceOffset,
    kb_sd_hash_offset: kbSdHashOffset,
    challenge: list(challenge),
    subject: list(subject),
  };

  const summary =
    `age shape ${shape}; header window at b64 ${hdrWindowStart} (byte ${hdrWindowRaw}), alg at byte ${hdrAlgAbs}, typ at byte ${hdrTypAbs}; ` +
    `header_b64 ${headerB64.length}/${C.HEADER_B64_MAX}, payload ${payloadRaw.length}/${C.PAYLOAD_MAX_LEN}, tail ${tail.length}/${C.TAIL_MAX}, ` +
    `kb_header ${kbHeaderRaw.length}/${C.KB_HEADER_MAX}, kb_payload ${kbPayloadRaw.length}/${C.KB_PAYLOAD_MAX}, age_obj_disclosure ${ageObjRaw.length}/${C.AGE_OBJ_DISC_MAX}`;
  const expected: ExpectedPublicOutputs = {
    issuer_key_hash: "0x" + hexEncode(await sha256(sec1)),
    over18: 1,
    expiry: payloadObj.exp, // committed expiry is the issuer exp; KB-JWT exp is checked off chain
    nonce: "0x" + nonce,
    subject: "0x" + hexEncode(subject),
  };
  return { inputs, shape, tamper, summary, expected };
}

/** The line gen-prover.ts prints; companion `prove` and the spike parse it. */
export function expectedLine(e: ExpectedPublicOutputs): string {
  return `expected public outputs: issuer_key_hash=${e.issuer_key_hash} over18=${e.over18} expiry=${e.expiry} nonce=${e.nonce} subject=${e.subject}`;
}

/** Prover.toml text, byte for byte what gen-prover.ts wrote before the split. */
export function proverInputsToToml(g: GeneratedInputs, inputPath: string): string {
  const arr = (b: number[]) => `[${b.join(", ")}]`;
  const bv = (name: string, v: BoundedVec) => `${name}.storage = ${arr(v.storage)}\n${name}.len = ${v.len}\n`;
  const I = g.inputs;
  let toml = `# Generated by circuits/tools/gen-prover.ts from ${inputPath}\n`;
  toml += g.tamper ? `# TAMPERED (${g.tamper}): this witness must fail\n` : "";
  toml += `# age shape ${g.shape}\n`;
  toml += bv("issuer_header_b64", I.issuer_header_b64);
  toml += `hdr_window_b64_start = ${I.hdr_window_b64_start}\n`;
  toml += `hdr_alg_offset = ${I.hdr_alg_offset}\n`;
  toml += `hdr_typ_offset = ${I.hdr_typ_offset}\n`;
  toml += bv("payload", I.payload);
  toml += `issuer_sig_b64 = ${arr(I.issuer_sig_b64)}\n`;
  toml += `issuer_sig = ${arr(I.issuer_sig)}\n`;
  toml += bv("disclosures_tail", I.disclosures_tail);
  toml += bv("kb_header", I.kb_header);
  toml += `kb_alg_offset = ${I.kb_alg_offset}\n`;
  toml += `kb_typ_offset = ${I.kb_typ_offset}\n`;
  toml += bv("kb_payload", I.kb_payload);
  toml += `kb_signature = ${arr(I.kb_signature)}\n`;
  toml += `issuer_pub_x = ${arr(I.issuer_pub_x)}\n`;
  toml += `issuer_pub_y = ${arr(I.issuer_pub_y)}\n`;
  toml += bv("age_salt", I.age_salt);
  toml += `age_obj_disclosed = ${I.age_obj_disclosed}\n`;
  toml += `age_leaf_disclosed = ${I.age_leaf_disclosed}\n`;
  toml += bv("age_obj_disclosure", I.age_obj_disclosure);
  toml += `sd_offset = ${I.sd_offset}\n`;
  toml += `age_obj_digest_offset = ${I.age_obj_digest_offset}\n`;
  toml += `age_sd_offset = ${I.age_sd_offset}\n`;
  toml += `age_target_offset = ${I.age_target_offset}\n`;
  toml += `vct_offset = ${I.vct_offset}\n`;
  toml += `cnf_offset = ${I.cnf_offset}\n`;
  toml += `x_offset = ${I.x_offset}\n`;
  toml += `y_offset = ${I.y_offset}\n`;
  toml += `exp_offset = ${I.exp_offset}\n`;
  toml += `kb_aud_offset = ${I.kb_aud_offset}\n`;
  toml += `kb_nonce_offset = ${I.kb_nonce_offset}\n`;
  toml += `kb_sd_hash_offset = ${I.kb_sd_hash_offset}\n`;
  toml += `challenge = ${arr(I.challenge)}\n`;
  toml += `subject = ${arr(I.subject)}\n`;
  return toml;
}
