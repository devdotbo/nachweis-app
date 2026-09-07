// Generates circuits/pid-sdjwt/Prover.toml from a prover-sp1 style input.json
// (SD-JWT presentation + issuer key + bound address + challenge).
//
//   bun run circuits/tools/gen-prover.ts <input.json> [out.toml] [--tamper=issuer-sig|age-disclosure|nonce|kb-sig]
//
// No dependencies beyond bun. All offsets are byte offsets into the raw
// (base64url-decoded) JSON of the issuer payload and the KB-JWT payload.
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

// Max lengths are read from constants.nr so tool and circuit cannot drift.
const constantsSrc = readFileSync(join(circuitDir, "src", "constants.nr"), "utf8");
const constant = (name: string): number => {
  const m = constantsSrc.match(new RegExp(`pub global ${name}: u32 = (\\d+);`));
  if (!m) throw new Error(`constant ${name} not found in constants.nr`);
  return Number(m[1]);
};
const HEADER_B64_MAX = constant("HEADER_B64_MAX");
const PAYLOAD_MAX_LEN = constant("PAYLOAD_MAX_LEN");
const TAIL_MAX = constant("TAIL_MAX");
const KB_PAYLOAD_MAX = constant("KB_PAYLOAD_MAX");
const SALT_MAX_LEN = constant("SALT_MAX_LEN");
const MAX_AGE_ENTRIES = constant("MAX_AGE_ENTRIES");

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

const uniqueIndex = (hay: string, needle: string, from = 0, label = needle): number => {
  const i = hay.indexOf(needle, from);
  if (i < 0) throw new Error(`${label} not found`);
  if (hay.indexOf(needle, i + 1) >= 0) throw new Error(`${label} occurs more than once; circuit assumes one`);
  return i;
};

// --- issuer payload offsets ---------------------------------------------------
const vctOffset = uniqueIndex(payloadJson, '"vct":"urn:eudi:pid:de:1"');
const ageSdFragment = '"age_equal_or_over":{"_sd":[';
const ageSdOffset = uniqueIndex(payloadJson, ageSdFragment);
const cnfFragment = '"cnf":{"jwk":{';
const cnfOffset = uniqueIndex(payloadJson, cnfFragment);
const xOffset = payloadJson.indexOf('"x":"', cnfOffset);
const yOffset = payloadJson.indexOf('"y":"', cnfOffset);
if (xOffset < 0 || yOffset < 0) throw new Error("cnf.jwk x/y not found");
const expOffset = uniqueIndex(payloadJson, '"exp":');

// --- age disclosure ------------------------------------------------------------
const ageDisc = disclosures.find((d) => {
  const arr = JSON.parse(fromB64url(d).toString("utf8"));
  return Array.isArray(arr) && arr[1] === "18" && arr[2] === true;
});
if (!ageDisc) throw new Error('no presented disclosure ["salt","18",true]');
const ageDiscArr = JSON.parse(fromB64url(ageDisc).toString("utf8"));
let ageSalt: string = ageDiscArr[0];
// The circuit rebuilds the disclosure as ["<salt>","18",true] byte for byte.
if (fromB64url(ageDisc).toString("utf8") !== `["${ageSalt}","18",true]`) {
  throw new Error("age disclosure is not in the canonical form the circuit rebuilds");
}
const ageDigest = b64url(sha256(Buffer.from(ageDisc, "ascii")));
const ageArray: string[] = payloadObj.age_equal_or_over._sd;
const ageDigestIndex = ageArray.indexOf(ageDigest);
if (ageDigestIndex < 0) throw new Error("age disclosure digest not in age_equal_or_over._sd");
if (ageDigestIndex >= MAX_AGE_ENTRIES) throw new Error("age digest index exceeds MAX_AGE_ENTRIES");
// Check the fixed 46-byte stride layout the circuit assumes.
const entriesBase = ageSdOffset + ageSdFragment.length;
for (let j = 0; j <= ageDigestIndex; j++) {
  const s = entriesBase + 46 * j;
  if (payloadJson[s] !== '"' || payloadJson[s + 44] !== '"') throw new Error(`age _sd entry ${j} not 43 chars quoted`);
  if (j < ageDigestIndex && payloadJson[s + 45] !== ",") throw new Error(`age _sd entry ${j} not followed by ,`);
}
if (payloadJson.slice(entriesBase + 46 * ageDigestIndex + 1, entriesBase + 46 * ageDigestIndex + 44) !== ageDigest) {
  throw new Error("age digest stride check failed");
}

// --- KB-JWT --------------------------------------------------------------------
const [kbHeaderB64, kbPayloadB64, kbSigB64] = kbJwt.split(".");
if (kbHeaderB64 !== "eyJhbGciOiJFUzI1NiIsInR5cCI6ImtiK2p3dCJ9") throw new Error("KB-JWT header is not {alg:ES256,typ:kb+jwt}");
const kbPayloadRaw = fromB64url(kbPayloadB64);
const kbJson = kbPayloadRaw.toString("utf8");
if (b64url(kbPayloadRaw) !== kbPayloadB64) throw new Error("KB payload base64url round trip differs");
const kbAudOffset = uniqueIndex(kbJson, `"aud":"${input.expected_aud}"`);
if (input.expected_aud !== "https://self-issued.me/v2") throw new Error("circuit pins aud https://self-issued.me/v2");
const kbExpOffset = uniqueIndex(kbJson, '"exp":');
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
  case "age-disclosure": // wrong salt, digest no longer in age_equal_or_over._sd
    ageSalt = (ageSalt[0] === "A" ? "B" : "A") + ageSalt.slice(1);
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
toml += bounded("issuer_header_b64", ascii(headerB64), HEADER_B64_MAX);
toml += bounded("payload", payloadRaw, PAYLOAD_MAX_LEN);
toml += `issuer_sig_b64 = ${bytes(ascii(issuerSigB64))}\n`;
toml += `issuer_sig = ${bytes(lowS(issuerSigRaw))}\n`;
toml += bounded("disclosures_tail", ascii(tail), TAIL_MAX);
toml += bounded("kb_payload", kbPayloadRaw, KB_PAYLOAD_MAX);
toml += `kb_signature = ${bytes(lowS(kbSig))}\n`;
toml += `issuer_pub_x = ${bytes(issuerX)}\n`;
toml += `issuer_pub_y = ${bytes(issuerY)}\n`;
toml += bounded("age_salt", ascii(ageSalt), SALT_MAX_LEN);
toml += `age_sd_offset = ${ageSdOffset}\n`;
toml += `age_digest_index = ${ageDigestIndex}\n`;
toml += `vct_offset = ${vctOffset}\n`;
toml += `cnf_offset = ${cnfOffset}\n`;
toml += `x_offset = ${xOffset}\n`;
toml += `y_offset = ${yOffset}\n`;
toml += `exp_offset = ${expOffset}\n`;
toml += `kb_aud_offset = ${kbAudOffset}\n`;
toml += `kb_exp_offset = ${kbExpOffset}\n`;
toml += `kb_nonce_offset = ${kbNonceOffset}\n`;
toml += `kb_sd_hash_offset = ${kbSdHashOffset}\n`;
toml += `challenge = ${bytes(challenge)}\n`;
toml += `subject = ${bytes(subject)}\n`;
writeFileSync(outPath, toml);

const expiry = Math.min(payloadObj.exp, kbObj.exp);
console.log(`wrote ${outPath}${tamper ? ` (tampered: ${tamper})` : ""}`);
console.log(`header_b64 ${headerB64.length}/${HEADER_B64_MAX}, payload ${payloadRaw.length}/${PAYLOAD_MAX_LEN}, tail ${tail.length}/${TAIL_MAX}, kb_payload ${kbPayloadRaw.length}/${KB_PAYLOAD_MAX}`);
console.log(`expected public outputs: issuer_key_hash=0x${sha256(sec1).toString("hex")} over18=1 expiry=${expiry} nonce=0x${nonce} subject=0x${subject.toString("hex")}`);
