// Generates circuits/pid-sdjwt/Prover.toml from a prover-sp1 style input.json
// (SD-JWT presentation + issuer key + bound address + challenge).
//
//   bun run circuits/tools/gen-prover.ts <input.json> [out.toml] [--tamper=issuer-sig|age-disclosure|nonce|kb-sig]
//
// No dependencies beyond bun. All offsets are byte offsets into the raw
// (base64url-decoded) JSON of the issuer payload, the KB-JWT header and payload,
// and (shapes B, C) the raw age object disclosure. The age shapes are described
// in circuits/pid-sdjwt/REALISM.md, section 3.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const tamper = (args.find((a) => a.startsWith("--tamper=")) ?? "").split("=")[1] ?? "";
if (positional.length < 1) {
  console.error("usage: gen-prover.ts <input.json> [out.toml] [--tamper=issuer-sig|age-disclosure|nonce|kb-sig]");
  process.exit(2);
}
const circuitDir = join(dirname(new URL(import.meta.url).pathname), "..", "pid-sdjwt");
const inputPath = positional[0];
const outPath = positional[1] ?? join(circuitDir, "Prover.toml");

// Max lengths and the pinned aud are read from constants.nr so tool and circuit cannot drift.
const constantsSrc = readFileSync(join(circuitDir, "src", "constants.nr"), "utf8");
const constant = (name: string): number => {
  const m = constantsSrc.match(new RegExp(`pub global ${name}: u32 = (\\d+);`));
  if (!m) throw new Error(`constant ${name} not found in constants.nr`);
  return Number(m[1]);
};
const HEADER_B64_MAX = constant("HEADER_B64_MAX");
const PAYLOAD_MAX_LEN = constant("PAYLOAD_MAX_LEN");
const TAIL_MAX = constant("TAIL_MAX");
const KB_HEADER_MAX = constant("KB_HEADER_MAX");
const KB_PAYLOAD_MAX = constant("KB_PAYLOAD_MAX");
const SALT_MAX_LEN = constant("SALT_MAX_LEN");
const AGE_OBJ_DISC_MAX = constant("AGE_OBJ_DISC_MAX");
const CNF_WINDOW = constant("CNF_WINDOW");
const HEADER_PREFIX_RAW = 96; // first 128 base64url chars of the issuer header, decoded in-circuit
const audMatch = constantsSrc.match(/AUD_FRAGMENT: \[u8; \d+\] =\s*"\\"aud\\":\\"([^"\\]+)\\""\.as_bytes\(\);/);
if (!audMatch) throw new Error("AUD_FRAGMENT not found in constants.nr");
export const PINNED_AUD = audMatch[1];

const input = JSON.parse(readFileSync(inputPath, "utf8"));
const sha256 = (b: Uint8Array | Buffer) => createHash("sha256").update(b).digest();
const b64url = (b: Buffer) => b.toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url");

const parts: string[] = input.presentation.split("~");
if (parts.length < 2) throw new Error("presentation has no KB-JWT");
const issuerJwt = parts[0];
const kbJwt = parts[parts.length - 1];
const disclosures = parts.slice(1, -1);
const [headerB64, payloadB64, sigB64] = issuerJwt.split(".");
const payloadRaw = fromB64url(payloadB64);
const payloadJson = payloadRaw.toString("utf8");
const payloadObj = JSON.parse(payloadJson);

// Sanity: the circuit re-encodes the raw payload; the round trip must be exact.
if (b64url(payloadRaw) !== payloadB64) throw new Error("payload base64url round trip differs");
if (sigB64.length !== 86) throw new Error(`issuer signature base64url length ${sigB64.length}, expected 86`);
if (headerB64.length < 128) throw new Error("issuer header shorter than 128 base64url chars");

const uniqueIndex = (hay: string, needle: string, from = 0, label = needle): number => {
  const i = hay.indexOf(needle, from);
  if (i < 0) throw new Error(`${label} not found`);
  if (hay.indexOf(needle, i + 1) >= 0) throw new Error(`${label} occurs more than once; circuit assumes one`);
  return i;
};
// Byte offset (UTF-8) of a JS string index; payload fragments are ASCII but claim values may not be.
const byteOffset = (s: string, idx: number) => Buffer.byteLength(s.slice(0, idx), "utf8");
const byteIndexOf = (hay: string, needle: string, from = 0) => {
  const i = hay.indexOf(needle, from);
  return i < 0 ? -1 : byteOffset(hay, i);
};

// --- issuer header: alg and typ inside the first 96 decoded bytes -------------------
const headerHead = fromB64url(headerB64.slice(0, 128)).toString("latin1"); // 96 bytes
const hdrAlgOffset = headerHead.indexOf('"alg":"ES256"');
const hdrTypOffset = (() => {
  const d = headerHead.indexOf('"typ":"dc+sd-jwt"');
  const v = headerHead.indexOf('"typ":"vc+sd-jwt"');
  return d >= 0 ? d : v;
})();
if (hdrAlgOffset < 0 || hdrAlgOffset + 13 > HEADER_PREFIX_RAW) throw new Error('issuer header: "alg":"ES256" not within the first 96 decoded bytes');
if (hdrTypOffset < 0 || hdrTypOffset + 17 > HEADER_PREFIX_RAW) throw new Error('issuer header: "typ":"dc+sd-jwt" (or vc+sd-jwt) not within the first 96 decoded bytes');

// --- issuer payload offsets ---------------------------------------------------
const vctOffset = uniqueIndex(payloadJson, '"vct":"urn:eudi:pid:de:1"');
const cnfFragment = '"cnf":{"jwk":{';
const cnfOffset = uniqueIndex(payloadJson, cnfFragment);
const xOffset = payloadJson.indexOf('"x":"', cnfOffset);
const yOffset = payloadJson.indexOf('"y":"', cnfOffset);
if (xOffset < 0 || yOffset < 0) throw new Error("cnf.jwk x/y not found");
if (xOffset >= cnfOffset + CNF_WINDOW || yOffset >= cnfOffset + CNF_WINDOW) throw new Error(`cnf.jwk x/y further than ${CNF_WINDOW} bytes after cnf`);
const expOffset = uniqueIndex(payloadJson, '"exp":');
if (!/^\d{10}[,}]/.test(payloadJson.slice(expOffset + 6))) throw new Error("issuer exp is not a 10 digit number");

// --- age shape and witness -------------------------------------------------------
const decodedDisc = disclosures.map((d) => {
  const raw = fromB64url(d);
  const arr = JSON.parse(raw.toString("utf8"));
  if (!Array.isArray(arr) || arr.length !== 3) throw new Error("only object-property disclosures are supported");
  if (raw.toString("utf8") !== JSON.stringify(arr) && !(arr[1] === "18")) {
    // non-canonical serialisation is fine for the circuit (raw bytes are used), noted for the log only
  }
  return { b64: d, raw, arr, digest: b64url(sha256(Buffer.from(d, "ascii"))) };
});
const leafDisc = decodedDisc.find((d) => d.arr[1] === "18" && d.arr[2] === true);
const objDisc = decodedDisc.find((d) => d.arr[1] === "age_equal_or_over" && d.arr[2] && typeof d.arr[2] === "object");
const ageInPayload = payloadObj.age_equal_or_over && typeof payloadObj.age_equal_or_over === "object";

let shape: "A" | "B" | "C";
if (ageInPayload && Array.isArray(payloadObj.age_equal_or_over._sd)) shape = "A";
else if (objDisc && Array.isArray(objDisc.arr[2]._sd)) shape = "B";
else if (objDisc && objDisc.arr[2]["18"] === true) shape = "C";
else throw new Error("no age_equal_or_over.18: neither nested _sd in the payload (A), nor a disclosed age object with _sd (B) or with plain values (C)");
if ((shape === "A" || shape === "B") && !leafDisc) throw new Error('no presented disclosure ["salt","18",true]');

let ageSalt = "";
if (leafDisc) {
  ageSalt = String(leafDisc.arr[0]);
  // The circuit rebuilds the disclosure as ["<salt>","18",true] byte for byte.
  if (leafDisc.raw.toString("utf8") !== `["${ageSalt}","18",true]`) throw new Error("age disclosure is not in the canonical form the circuit rebuilds");
  if (Buffer.byteLength(ageSalt) > SALT_MAX_LEN) throw new Error("age salt exceeds SALT_MAX_LEN");
}

// Finds `needle` inside the array/object that opens right after `anchorEnd`, before any ] or }
// (the circuit checks the same: no closer between the container start and the target).
const targetInside = (hayBytes: string, anchorEnd: number, needle: string, label: string): number => {
  const t = hayBytes.indexOf(needle, anchorEnd);
  if (t < 0) throw new Error(`${label}: target not found`);
  const between = hayBytes.slice(anchorEnd, t);
  if (/[\]}]/.test(between)) throw new Error(`${label}: container closes before the target`);
  return t;
};

let ageObjDisclosed = 0;
let ageLeafDisclosed = leafDisc ? 1 : 0;
let ageObjRaw = Buffer.alloc(0);
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
  if (ageObjRaw.length > AGE_OBJ_DISC_MAX) throw new Error(`age object disclosure ${ageObjRaw.length} bytes exceeds AGE_OBJ_DISC_MAX ${AGE_OBJ_DISC_MAX}`);
  const discJson = ageObjRaw.toString("latin1"); // byte-exact view
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
const kbHeaderRaw = fromB64url(kbHeaderB64);
const kbHeaderJson = kbHeaderRaw.toString("latin1");
if (b64url(kbHeaderRaw) !== kbHeaderB64) throw new Error("KB header base64url round trip differs");
const kbAlgOffset = kbHeaderJson.indexOf('"alg":"ES256"');
const kbTypOffset = kbHeaderJson.indexOf('"typ":"kb+jwt"');
if (kbAlgOffset < 0 || kbTypOffset < 0) throw new Error("KB-JWT header lacks alg ES256 or typ kb+jwt");
const kbPayloadRaw = fromB64url(kbPayloadB64);
const kbJson = kbPayloadRaw.toString("utf8");
if (b64url(kbPayloadRaw) !== kbPayloadB64) throw new Error("KB payload base64url round trip differs");
if (input.expected_aud !== PINNED_AUD) throw new Error(`circuit pins aud ${PINNED_AUD}; input expects ${input.expected_aud}`);
const kbAudOffset = uniqueIndex(kbJson, `"aud":"${PINNED_AUD}"`);
const kbNonceOffset = uniqueIndex(kbJson, '"nonce":"');
const kbSdHashOffset = uniqueIndex(kbJson, '"sd_hash":"');

const tail = "~" + disclosures.join("~") + "~";
const sdHash = b64url(sha256(Buffer.from(issuerJwt + tail, "ascii")));
const kbObj = JSON.parse(kbJson);
if (kbObj.sd_hash !== sdHash) throw new Error("sd_hash in KB-JWT does not match the presentation");

// --- keys, subject, challenge ----------------------------------------------------
const sec1 = Buffer.from(input.issuer_key_sec1_hex, "hex");
if (sec1.length !== 65 || sec1[0] !== 4) throw new Error("issuer key must be SEC1 uncompressed (65 bytes)");
const issuerX = sec1.subarray(1, 33);
const issuerY = sec1.subarray(33, 65);
const subject = Buffer.from(input.bound_address_hex.replace(/^0x/, ""), "hex");
let challenge = Buffer.from(input.challenge_hex.replace(/^0x/, ""), "hex");
if (subject.length !== 20 || challenge.length !== 32) throw new Error("subject must be 20 bytes, challenge 32 bytes");
const nonce = sha256(Buffer.concat([subject, challenge])).toString("hex");
if (kbObj.nonce !== nonce) throw new Error("KB-JWT nonce != hex(sha256(subject||challenge))");

// The ECDSA blackbox in Noir/Barretenberg only accepts low-s signatures. The
// circuit gets the low-s form and checks it against the base64url signature
// that stays in the sd_hash preimage (same r, s or n - s).
const P256_N = BigInt("0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551");
const lowS = (sig: Buffer): Buffer => {
  const s = BigInt("0x" + sig.subarray(32).toString("hex"));
  const ns = s > P256_N / 2n ? P256_N - s : s;
  return Buffer.concat([sig.subarray(0, 32), Buffer.from(ns.toString(16).padStart(64, "0"), "hex")]);
};

// --- tampering for negative tests --------------------------------------------------
let issuerSigB64 = sigB64;
let issuerSigRaw = fromB64url(sigB64);
let kbSig = fromB64url(kbSigB64);
switch (tamper) {
  case "":
    break;
  case "issuer-sig": // flip one bit of r, consistently in raw and base64url form
    issuerSigRaw = Buffer.from(issuerSigRaw);
    issuerSigRaw[3] ^= 1;
    issuerSigB64 = b64url(issuerSigRaw);
    break;
  case "age-disclosure": // wrong salt: the digest is no longer in the age _sd (A, B); wrong object salt (C)
    if (shape === "C") {
      ageObjRaw = Buffer.from(ageObjRaw);
      ageObjRaw[2] = ageObjRaw[2] === 0x41 ? 0x42 : 0x41;
    } else {
      ageSalt = (ageSalt[0] === "A" ? "B" : "A") + ageSalt.slice(1);
    }
    break;
  case "nonce": // different challenge, nonce in the KB-JWT no longer matches
    challenge = Buffer.from(challenge);
    challenge[0] ^= 1;
    break;
  case "kb-sig":
    kbSig = Buffer.from(kbSig);
    kbSig[5] ^= 1;
    break;
  default:
    throw new Error(`unknown tamper mode ${tamper}`);
}

// --- TOML ----------------------------------------------------------------------------
const bytes = (b: Uint8Array | Buffer | number[]) => `[${Array.from(b).join(", ")}]`;
const bounded = (name: string, b: Buffer, max: number) => {
  if (b.length > max) throw new Error(`${name}: ${b.length} bytes exceeds max ${max}`);
  const storage = Buffer.concat([b, Buffer.alloc(max - b.length)]);
  return `${name}.storage = ${bytes(storage)}\n${name}.len = ${b.length}\n`;
};
const ascii = (s: string) => Buffer.from(s, "ascii");

let toml = `# Generated by circuits/tools/gen-prover.ts from ${inputPath}\n`;
toml += tamper ? `# TAMPERED (${tamper}): this witness must fail\n` : "";
toml += `# age shape ${shape}\n`;
toml += bounded("issuer_header_b64", ascii(headerB64), HEADER_B64_MAX);
toml += `hdr_alg_offset = ${hdrAlgOffset}\n`;
toml += `hdr_typ_offset = ${hdrTypOffset}\n`;
toml += bounded("payload", payloadRaw, PAYLOAD_MAX_LEN);
toml += `issuer_sig_b64 = ${bytes(ascii(issuerSigB64))}\n`;
toml += `issuer_sig = ${bytes(lowS(issuerSigRaw))}\n`;
toml += bounded("disclosures_tail", ascii(tail), TAIL_MAX);
toml += bounded("kb_header", kbHeaderRaw, KB_HEADER_MAX);
toml += `kb_alg_offset = ${kbAlgOffset}\n`;
toml += `kb_typ_offset = ${kbTypOffset}\n`;
toml += bounded("kb_payload", kbPayloadRaw, KB_PAYLOAD_MAX);
toml += `kb_signature = ${bytes(lowS(kbSig))}\n`;
toml += `issuer_pub_x = ${bytes(issuerX)}\n`;
toml += `issuer_pub_y = ${bytes(issuerY)}\n`;
toml += bounded("age_salt", ascii(ageSalt), SALT_MAX_LEN);
toml += `age_obj_disclosed = ${ageObjDisclosed}\n`;
toml += `age_leaf_disclosed = ${ageLeafDisclosed}\n`;
toml += bounded("age_obj_disclosure", ageObjRaw, AGE_OBJ_DISC_MAX);
toml += `sd_offset = ${sdOffset}\n`;
toml += `age_obj_digest_offset = ${ageObjDigestOffset}\n`;
toml += `age_sd_offset = ${ageSdOffset}\n`;
toml += `age_target_offset = ${ageTargetOffset}\n`;
toml += `vct_offset = ${vctOffset}\n`;
toml += `cnf_offset = ${cnfOffset}\n`;
toml += `x_offset = ${xOffset}\n`;
toml += `y_offset = ${yOffset}\n`;
toml += `exp_offset = ${expOffset}\n`;
toml += `kb_aud_offset = ${kbAudOffset}\n`;
toml += `kb_nonce_offset = ${kbNonceOffset}\n`;
toml += `kb_sd_hash_offset = ${kbSdHashOffset}\n`;
toml += `challenge = ${bytes(challenge)}\n`;
toml += `subject = ${bytes(subject)}\n`;
writeFileSync(outPath, toml);

const expiry = payloadObj.exp; // committed expiry is the issuer exp; KB-JWT exp is checked off chain
console.log(`wrote ${outPath}${tamper ? ` (tampered: ${tamper})` : ""}`);
console.log(
  `age shape ${shape}; header_b64 ${headerB64.length}/${HEADER_B64_MAX}, payload ${payloadRaw.length}/${PAYLOAD_MAX_LEN}, tail ${tail.length}/${TAIL_MAX}, kb_header ${kbHeaderRaw.length}/${KB_HEADER_MAX}, kb_payload ${kbPayloadRaw.length}/${KB_PAYLOAD_MAX}, age_obj_disclosure ${ageObjRaw.length}/${AGE_OBJ_DISC_MAX}`,
);
console.log(`expected public outputs: issuer_key_hash=0x${sha256(sec1).toString("hex")} over18=1 expiry=${expiry} nonce=0x${nonce} subject=0x${subject.toString("hex")}`);
