import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptJwe, encryptJwe, generateP256, sec1FromJwk } from "../src/crypto";
import { publicKeyFromCertificate } from "../src/der";
import { loadOrCreateIssuerKey, mintPresentation, selfSignedLeaf } from "../src/mint";
import { decodePublicInputs, repoRoot, splitWords } from "../src/prove";
import { checkKbFreshness, issuerKeyFromX5c, StatementError, verifyPresentation } from "../src/statement";
import { encodeNoirProofArg, policyIdOf } from "../src/submit";
import { fromHex, hex, nonceOf, nowUnix, sha256 } from "../src/util";

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

describe("test issuer and minted presentation", () => {
  const dir = mkdtempSync(join(tmpdir(), "companion-test-"));
  const address = fromHex("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  const challenge = fromHex("0x00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff");
  const nonce = hex(nonceOf(address, challenge));
  const aud = "https://self-issued.me/v2";

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
    expect(toml).toContain("age_digest_index = 3");
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
    expect(d.issuer_key_hash).toBe("0x78cf23963b47d3e393c79ea091c4ed80ebbae4ff78992058dd92fd34e1635183");
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
