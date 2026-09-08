// Generates circuits/pid-sdjwt/Prover.toml from a prover-sp1 style input.json
// (SD-JWT presentation + issuer key + bound address + challenge).
//
//   bun run circuits/tools/gen-prover.ts <input.json> [out.toml] [--tamper=issuer-sig|age-disclosure|nonce|kb-sig|hdr-window]
//
// No dependencies beyond bun. The derivation itself lives in shared/pid/prover-inputs.ts
// (Uint8Array and WebCrypto only), so the web app's browser prover feeds the same object to
// noir_js; this file reads the files and writes the TOML. Byte offsets and the three age shapes
// are described in circuits/pid-sdjwt/REALISM.md, section 3.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildProverInputs, expectedLine, parseCircuitConstants, proverInputsToToml, TAMPER_MODES, type TamperMode } from "../../shared/pid/prover-inputs";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const tamper = ((args.find((a) => a.startsWith("--tamper=")) ?? "").split("=")[1] ?? "") as TamperMode;
if (positional.length < 1) {
  console.error("usage: gen-prover.ts <input.json> [out.toml] [--tamper=issuer-sig|age-disclosure|nonce|kb-sig|hdr-window]");
  process.exit(2);
}
if (!TAMPER_MODES.includes(tamper)) throw new Error(`unknown tamper mode ${tamper}`);
const circuitDir = join(dirname(new URL(import.meta.url).pathname), "..", "pid-sdjwt");
const inputPath = positional[0];
const outPath = positional[1] ?? join(circuitDir, "Prover.toml");

// Max lengths and the pinned aud are read from constants.nr so tool and circuit cannot drift.
const constants = parseCircuitConstants(readFileSync(join(circuitDir, "src", "constants.nr"), "utf8"));
const input = JSON.parse(readFileSync(inputPath, "utf8"));
const generated = await buildProverInputs(input, constants, tamper);
writeFileSync(outPath, proverInputsToToml(generated, inputPath));

console.log(`wrote ${outPath}${tamper ? ` (tampered: ${tamper})` : ""}`);
console.log(generated.summary);
console.log(expectedLine(generated.expected));
