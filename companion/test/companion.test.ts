import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptJwe, encryptJwe, generateP256, sec1FromJwk } from "../src/crypto";
import { handoffUri, parseHandoff } from "../src/handoff";
import { publicKeyFromCertificate } from "../src/der";
import { loadOrCreateIssuerKey, mintPresentation, selfSignedLeaf } from "../src/mint";
import { decodePublicInputs, repoRoot, splitWords } from "../src/prove";
import { checkKbFreshness, issuerKeyFromX5c, StatementError, verifyPresentation } from "../src/statement";
import { encodeNoirProofArg, policyIdOf } from "../src/submit";
import { fromHex, hex, nonceOf, nowUnix, PINNED_AUD, sha256 } from "../src/util";

const root = repoRoot();
const fixture = JSON.parse(readFileSync(join(root, "prover-sp1/fixtures/input.json"), "utf8"));

describe("nonce", () => {
  test("matches the relay test vector (docs/blind-relay.md)", () => {
    const n = nonceOf(fromHex("0x1111111111111111111111111111111111111111"), fromHex("0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"));
    expect(hex(n)).toBe("1acae0a2ea4cb86477660574adedbf294b130b0eecb1e903e29e4bae19614be5");
  });
  test("matches the fixture KB-JWT nonce", () => {
    const n = nonceOf(fromHex(fixture.bound_address_hex), fromHex(fixture.challenge_hex));
    expect(hex(n)).toBe("306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762");
  });
});

describe("statement pre-check on the SP1 fixture", () => {
  const input = {
    presentation: fixture.presentation as string,
    issuerKeySec1: fromHex(fixture.issuer_key_sec1_hex),
    expectedVct: fixture.expected_vct as string,
    expectedAud: fixture.expected_aud as string,
    boundAddress: fromHex(fixture.bound_address_hex),
    challenge: fromHex(fixture.challenge_hex),
  };
  test("holds with the fixture issuer key", async () => {
    const v = await verifyPresentation(input);
    expect(v.over18).toBe(true);
    expect(v.expiry).toBe(1819756800);
    expect(v.issuerKeyHash).toBe("78cf23963b47d3e393c79ea091c4ed80ebbae4ff78992058dd92fd34e1635183");
    expect(v.disclosedClaimNames).toEqual(["given_name", "family_name", "18"]);
    // The stored fixture's KB-JWT is stale (exp = iat + 300 at minting).
    expect(() => checkKbFreshness(v, nowUnix(), 600)).toThrow(/KB-JWT expired/);
  });
  test("fails on a different challenge with the nonce error", async () => {
    const challenge = Buffer.from(input.challenge);
    challenge[0] ^= 1;
    await expect(verifyPresentation({ ...input, challenge })).rejects.toThrow(/nonce is not bound/);
  });
  test("fails on the wrong audience", async () => {
    await expect(verifyPresentation({ ...input, expectedAud: "x509_hash:abc" })).rejects.toThrow(/aud mismatch/);
  });
  test("x5c leaf of the fixture is ERICA's key, not the synthetic signer", async () => {
    const key = issuerKeyFromX5c(fixture.presentation.split("~")[0]);
    expect(key.length).toBe(65);
    expect(hex(key)).not.toBe(fixture.issuer_key_sec1_hex);
    await expect(verifyPresentation({ ...input, issuerKeySec1: key })).rejects.toThrow(/Invalid issuer JWT signature/);
  });
});

describe("statement pre-check on the realistic Noir fixture", () => {
  const realistic = JSON.parse(readFileSync(join(root, "prover-sp1/fixtures/realistic-input.json"), "utf8"));
  const input = {
    presentation: realistic.presentation as string,
    issuerKeySec1: fromHex(realistic.issuer_key_sec1_hex),
    expectedVct: realistic.expected_vct as string,
    expectedAud: realistic.expected_aud as string,
    boundAddress: fromHex(realistic.bound_address_hex),
    challenge: fromHex(realistic.challenge_hex),
  };
  test("aud is the pinned client_id, the same string the circuit constant carries", () => {
    expect(realistic.expected_aud).toBe(PINNED_AUD);
    const constants = readFileSync(join(root, "circuits/pid-sdjwt/src/constants.nr"), "utf8");
    expect(constants).toContain(`"\\"aud\\":\\"${PINNED_AUD}\\""`);
  });
  test("x5c leaf is the signer: the key derived from the leaf verifies the issuer signature", async () => {
    const key = issuerKeyFromX5c(realistic.presentation.split("~")[0]);
    expect(hex(key)).toBe(realistic.issuer_key_sec1_hex);
    const v = await verifyPresentation({ ...input, issuerKeySec1: key });
    expect(v.over18).toBe(true);
    expect(v.expiry).toBe(1819756800);
    expect(v.issuerKeyHash).toBe("b52359580c14e2d79d34605740d86338adc6a0868a22ec648d1896187813fd26");
    expect(v.disclosedClaimNames).toEqual(["given_name", "family_name", "18"]);
  });
  test("the other age shapes verify natively too", async () => {
    const dir = mkdtempSync(join(tmpdir(), "companion-shapes-"));
    const issuer = await loadOrCreateIssuerKey(join(dir, "issuer.json"));
    for (const ageShape of ["disclosed", "plain"] as const) {
      const { presentation } = await mintPresentation({ issuer, nonce: hex(nonceOf(input.boundAddress, input.challenge)), aud: PINNED_AUD, ageShape });
      const v = await verifyPresentation({ ...input, presentation, issuerKeySec1: fromHex(issuer.sec1_hex) });
      expect(v.over18).toBe(true);
    }
  });
});

describe("test issuer and minted presentation", () => {
  const dir = mkdtempSync(join(tmpdir(), "companion-test-"));
  const address = fromHex("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  const challenge = fromHex("0x00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff");
  const nonce = hex(nonceOf(address, challenge));
  const aud = PINNED_AUD;

  test("self-signed leaf carries the key and parses back", async () => {
    const { privateJwk } = await generateP256();
    const der = await selfSignedLeaf(privateJwk, "t");
    expect(publicKeyFromCertificate(der)).toEqual(sec1FromJwk(privateJwk));
  });

  test("issuer key file is created once and reports the pinned hash", async () => {
    const p = join(dir, "issuer.json");
    const a = await loadOrCreateIssuerKey(p);
    const b = await loadOrCreateIssuerKey(p);
    expect(b.sec1_hex).toBe(a.sec1_hex);
    expect(a.issuer_key_hash).toBe("0x" + hex(sha256(fromHex(a.sec1_hex))));
    expect(publicKeyFromCertificate(Buffer.from(a.cert_der_b64, "base64"))).toEqual(fromHex(a.sec1_hex));
  });

  test("minted presentation satisfies the statement, with the issuer key taken from x5c", async () => {
    const issuer = await loadOrCreateIssuerKey(join(dir, "issuer.json"));
    const { presentation } = await mintPresentation({ issuer, nonce, aud });
    const key = issuerKeyFromX5c(presentation.split("~")[0]);
    const v = await verifyPresentation({ presentation, issuerKeySec1: key, expectedVct: "urn:eudi:pid:de:1", expectedAud: aud, boundAddress: address, challenge });
    expect(v.over18).toBe(true);
    expect(v.nonce).toBe(nonce);
    expect(v.issuerKeyHash).toBe(issuer.issuer_key_hash.slice(2));
    checkKbFreshness(v, nowUnix(), 600);
    expect(() => checkKbFreshness(v, nowUnix() + 301, 600)).toThrow(StatementError);
  });

  test("minted presentation is in the byte layout gen-prover.ts accepts", async () => {
    const issuer = await loadOrCreateIssuerKey(join(dir, "issuer.json"));
    const { presentation } = await mintPresentation({ issuer, nonce, aud });
    const inputPath = join(dir, "input.json");
    await Bun.write(
      inputPath,
      JSON.stringify({ presentation, issuer_key_sec1_hex: issuer.sec1_hex, expected_vct: "urn:eudi:pid:de:1", expected_aud: aud, bound_address_hex: "0x" + hex(address), challenge_hex: hex(challenge) }),
    );
    const out = join(dir, "Prover.toml");
    const r = spawnSync(process.execPath, ["run", join(root, "circuits/tools/gen-prover.ts"), inputPath, out], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`nonce=0x${nonce}`);
    expect(r.stdout).toContain(`issuer_key_hash=${issuer.issuer_key_hash}`);
    const toml = readFileSync(out, "utf8");
    expect(toml).toContain("# age shape A");
    expect(toml).toContain("age_leaf_disclosed = 1");
  });

  test("JWE ECDH-ES A128GCM round trip with the ephemeral key", async () => {
    const { privateJwk, publicJwk } = await generateP256();
    const jwe = await encryptJwe(Buffer.from('{"vp_token":{"pid":["a~b~c"]}}'), { ...publicJwk, kid: "relay-enc-key" });
    expect(jwe.split(".").length).toBe(5);
    const { plaintext, protectedHeader } = await decryptJwe(jwe, privateJwk);
    expect(plaintext.toString()).toBe('{"vp_token":{"pid":["a~b~c"]}}');
    expect(protectedHeader.alg).toBe("ECDH-ES");
    expect(protectedHeader.enc).toBe("A128GCM");
    const other = await generateP256();
    await expect(decryptJwe(jwe, other.privateJwk)).rejects.toThrow();
  });
});

describe("public inputs and proof encoding", () => {
  test("decode the Noir fixture (contracts/test/fixtures/noir)", () => {
    const words = splitWords(readFileSync(join(root, "contracts/test/fixtures/noir/public_inputs.bin")));
    const d = decodePublicInputs(words);
    expect(d.subject).toBe("0xf99edde971f4e9c88715a79ca78963284a2955dc");
    expect(d.issuer_key_hash).toBe("0xb52359580c14e2d79d34605740d86338adc6a0868a22ec648d1896187813fd26");
    expect(d.over18).toBe(1);
    expect(d.expiry).toBe(1819756800);
    expect(d.nonce).toBe("0x306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762");
  });
  test("abi.encode(bytes, bytes32[]) shape", () => {
    const enc = encodeNoirProofArg("0xaabb", [`0x${"11".repeat(32)}`]);
    const b = fromHex(enc);
    expect(b.readUInt32BE(28)).toBe(0x40); // offset of bytes
    expect(b.readUInt32BE(60)).toBe(0x80); // offset of bytes32[]
    expect(b.readUInt32BE(92)).toBe(2); // proof length
    expect(b.readUInt32BE(156)).toBe(1); // array length
  });
  test("policy id", () => {
    expect(policyIdOf(undefined)).toBe("0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f");
    expect(policyIdOf(`0x${"ab".repeat(32)}`)).toBe(`0x${"ab".repeat(32)}`);
  });
});

describe("two-device handoff", () => {
  const sid = "aa7d4435-c509-46b1-83b1-7c0cb9ca55ca";
  const addr = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const ch = "7426bd0ea9dbe592f719371e370251246c99a1838fe3c2bf5646e90221f69df2";
  const expectedNonce = hex(nonceOf(fromHex(addr), fromHex(ch)));

  test("compact JSON from the web app", () => {
    const h = parseHandoff(JSON.stringify({ v: 1, s: sid, a: addr, c: ch, r: "http://10.0.2.2:8090", b: "http://10.0.2.2:8788/" }));
    expect(h.session_id).toBe(sid);
    expect(h.bound_address).toBe(addr.toLowerCase());
    expect(h.challenge_hex).toBe(ch);
    expect(h.nonce).toBe(expectedNonce);
    expect(h.verifier_url).toBe("http://10.0.2.2:8090");
    expect(h.bridge_url).toBe("http://10.0.2.2:8788");
  });

  test("URI round trip, 0x-prefixed challenge, missing verifier", () => {
    const h = parseHandoff(`nachweis://handoff?v=1&s=${sid}&a=${addr}&c=0x${ch}&b=${encodeURIComponent("http://127.0.0.1:8788")}`);
    expect(h.verifier_url).toBeUndefined();
    expect(h.bridge_url).toBe("http://127.0.0.1:8788");
    expect(parseHandoff(handoffUri(h))).toEqual(h);
  });

  test("bridge handoff body, nonce cross-checked", () => {
    const h = parseHandoff(JSON.stringify({ session_id: sid, bound_address: addr, challenge_hex: ch, nonce: expectedNonce, verifier_url: null, bridge_url: "http://127.0.0.1:8788", expires_at: 1 }));
    expect(h.nonce).toBe(expectedNonce);
    expect(() => parseHandoff(JSON.stringify({ session_id: sid, bound_address: addr, challenge_hex: ch, nonce: "00".repeat(32), bridge_url: "http://x" }))).toThrow(/nonce/);
  });

  test("rejects bad input", () => {
    expect(() => parseHandoff("hello")).toThrow(/JSON object or a nachweis/);
    expect(() => parseHandoff(JSON.stringify({ v: 2, s: sid, a: addr, c: ch, b: "http://x" }))).toThrow(/version/);
    expect(() => parseHandoff(JSON.stringify({ v: 1, s: "not-a-uuid", a: addr, c: ch, b: "http://x" }))).toThrow(/UUID/);
    expect(() => parseHandoff(JSON.stringify({ v: 1, s: sid, a: addr, c: ch.slice(2), b: "http://x" }))).toThrow(/32 bytes/);
    expect(() => parseHandoff(JSON.stringify({ v: 1, s: sid, a: addr, c: ch, b: "ftp://x" }))).toThrow(/http/);
  });
});
