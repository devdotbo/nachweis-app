// Produces the fixtures the spike page loads, all synthetic:
//   public/generated/circuit.json  the committed compiled circuit (prover-android assets copy)
//   public/generated/inputs.json   the circuit inputs for the realistic fixture, converted from the
//                                  Prover.toml that circuits/tools/gen-prover.ts writes (the generator
//                                  is not ported; its output is converted 1:1 into noir_js's InputMap)
//   public/generated/jwe.json      a wallet-style JWE (ECDH-ES, A128GCM) of the same presentation,
//                                  encrypted to a fresh P-256 key whose private JWK sits next to it
//
//   bun run scripts/prepare-inputs.ts [input.json]   (default: prover-sp1/fixtures/realistic-input.json)
import { CompactEncrypt, exportJWK, generateKeyPair } from "jose";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
const repo = resolve(here, "..", "..", "..");
const inputPath = resolve(process.argv[2] ?? join(repo, "prover-sp1", "fixtures", "realistic-input.json"));
const outDir = join(here, "..", "public", "generated");
mkdirSync(outDir, { recursive: true });

// 1. circuit artifact: the committed one (same hash as `nargo compile` on the current source)
const artifact = join(repo, "prover-android", "app", "src", "main", "assets", "pid_sdjwt.json");
copyFileSync(artifact, join(outDir, "circuit.json"));

// 2. Prover.toml via the generator, then TOML -> InputMap
const toml = join(outDir, "Prover.toml");
const gen = spawnSync(process.execPath, ["run", join(repo, "circuits", "tools", "gen-prover.ts"), inputPath, toml], { encoding: "utf8" });
if (gen.status !== 0) throw new Error(`gen-prover.ts failed\n${gen.stdout}\n${gen.stderr}`);
const expected = gen.stdout.split("\n").find((l) => l.startsWith("expected public outputs")) ?? "";

const inputs: Record<string, unknown> = {};
for (const line of readFileSync(toml, "utf8").split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue;
  const m = line.match(/^([A-Za-z0-9_]+)(?:\.(storage|len))? = (.+)$/);
  if (!m) throw new Error(`unexpected TOML line: ${line}`);
  const [, name, field, raw] = m;
  const value = raw.startsWith("[") ? JSON.parse(raw) : Number(raw);
  if (field) {
    const bv = (inputs[name] ??= {}) as Record<string, unknown>;
    bv[field] = value;
  } else {
    inputs[name] = value;
  }
}
const input = JSON.parse(readFileSync(inputPath, "utf8"));
writeFileSync(join(outDir, "inputs.json"), JSON.stringify({ inputs, expected, source: inputPath.replace(repo + "/", "") }));

// 3. wallet-style JWE of the presentation (the companion's answerAsWallet shape)
const { privateKey, publicKey } = await generateKeyPair("ECDH-ES", { crv: "P-256", extractable: true });
const priv = await exportJWK(privateKey);
const pub = await exportJWK(publicKey);
const plaintext = JSON.stringify({ vp_token: { "pid-sdjwt": [input.presentation] } });
const jwe = await new CompactEncrypt(new TextEncoder().encode(plaintext))
  .setProtectedHeader({ alg: "ECDH-ES", enc: "A128GCM", kid: "spike-response-key" })
  .encrypt(publicKey);
writeFileSync(
  join(outDir, "jwe.json"),
  JSON.stringify({ jwe, privateJwk: { kty: "EC", crv: "P-256", x: priv.x, y: priv.y, d: priv.d }, publicJwk: { kty: "EC", crv: "P-256", x: pub.x, y: pub.y }, plaintextSha256: null }),
);
console.log(`wrote ${outDir}/{circuit.json,inputs.json,jwe.json}`);
console.log(expected);
