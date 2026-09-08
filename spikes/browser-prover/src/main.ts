// Spike: pid-sdjwt proof in a Chrome tab. Loads the compiled circuit and the generated inputs,
// decrypts a wallet-style JWE with WebCrypto, runs the witness generator (noir_js/acvm_js), proves
// with bb.js UltraHonk (keccak oracle, the EVM verifier's flavour), verifies in the tab and reports
// timings, memory, proof bytes and the 86 public inputs.
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir, type CompiledCircuit, type InputMap } from "@noir-lang/noir_js";
import { decryptCompactJwe, type Jwk } from "./jwe";

const $ = (id: string) => document.getElementById(id)!;
const logEl = $("log");
const log = (msg: string) => {
  logEl.textContent += `${new Date().toISOString().slice(11, 23)} ${msg}\n`;
  console.log(msg);
};
const status = (s: string) => ($("status").textContent = s);
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const mib = (n: number) => `${(n / 1048576).toFixed(0)} MiB`;

$("isolated").textContent = String(crossOriginIsolated);
const threads = navigator.hardwareConcurrency || 1;
$("threads").textContent = String(threads);

interface Report {
  startedAt: number;
  userAgent: string;
  crossOriginIsolated: boolean;
  threads: number;
  timingsMs: Record<string, number>;
  memory: Record<string, number | string>;
  jwe: { ok: boolean; presentationLength: number; header: Record<string, unknown> };
  witnessBytes: number;
  proofBytes: number;
  proofHex: string;
  publicInputs: string[];
  publicInputsDecoded: Record<string, string | number>;
  verified: boolean;
  vkHex: string;
  vkSha256: string;
  expected: string;
  error?: string;
}

// performance.memory is the main-thread JS heap only (bb.js wasm memory lives in workers), cheap
// enough to poll. performance.measureUserAgentSpecificMemory covers workers and wasm (needs
// isolation) but Chrome delays each call by up to tens of seconds, so it is taken once, off the
// critical path, right after proving. The decisive number is the renderer RSS sampled with `ps`.
function jsHeap(): number {
  return (performance as any).memory?.usedJSHeapSize ?? 0;
}
async function uaMemory(): Promise<number> {
  const p = performance as any;
  if (!p.measureUserAgentSpecificMemory) return 0;
  try {
    return (await p.measureUserAgentSpecificMemory()).bytes as number;
  } catch {
    return 0;
  }
}

function decodePublicInputs(words: string[]): Record<string, string | number> {
  if (words.length !== 86) throw new Error(`expected 86 public inputs, got ${words.length}`);
  const byteAt = (i: number) => parseInt(words[i].slice(-2), 16);
  const bytes = (from: number, n: number) => "0x" + Array.from({ length: n }, (_, k) => byteAt(from + k).toString(16).padStart(2, "0")).join("");
  return {
    subject: bytes(0, 20),
    issuer_key_hash: bytes(20, 32),
    over18: byteAt(52),
    expiry: Number(BigInt(words[53])),
    nonce: bytes(54, 32),
  };
}

async function run() {
  const startedAt = Date.now();
  const t: Record<string, number> = {};
  const memory: Record<string, number | string> = {};
  const report: Partial<Report> = { startedAt, userAgent: navigator.userAgent, crossOriginIsolated, threads, timingsMs: t, memory };
  logEl.textContent = "";
  $("result").textContent = "";
  let peak = 0;
  const sampler = setInterval(() => (peak = Math.max(peak, jsHeap())), 250);
  let uaAfterProve: Promise<number> = Promise.resolve(0);
  const mark = (name: string, from: number) => {
    t[name] = Math.round(performance.now() - from);
    log(`${name}: ${t[name]} ms`);
  };
  try {
    let t0 = performance.now();
    status("loading fixtures");
    const [circuit, inputsDoc, jweDoc] = await Promise.all([
      fetch("/generated/circuit.json").then((r) => r.json()) as Promise<CompiledCircuit & { noir_version: string; hash: number }>,
      fetch("/generated/inputs.json").then((r) => r.json()) as Promise<{ inputs: InputMap; expected: string; source: string }>,
      fetch("/generated/jwe.json").then((r) => r.json()) as Promise<{ jwe: string; privateJwk: Jwk }>,
    ]);
    mark("load_fixtures", t0);
    log(`circuit ${circuit.noir_version}, hash ${circuit.hash}, bytecode ${circuit.bytecode.length} chars (base64), inputs from ${inputsDoc.source}`);
    report.expected = inputsDoc.expected;

    // 1. wallet response: JWE -> vp_token -> presentation (WebCrypto only)
    t0 = performance.now();
    status("decrypting JWE");
    const { plaintext, header } = await decryptCompactJwe(jweDoc.jwe, jweDoc.privateJwk);
    const vp = JSON.parse(new TextDecoder().decode(plaintext));
    const presentation: string = Object.values(vp.vp_token as Record<string, string[]>)[0][0];
    mark("jwe_decrypt", t0);
    report.jwe = { ok: presentation.split("~").length >= 2, presentationLength: presentation.length, header };
    log(`JWE ${header.alg}/${header.enc} decrypted: presentation ${presentation.length} chars, ${presentation.split("~").length - 2} disclosures`);
    // The generated inputs were derived from the same presentation; assert that so the page proves what it decrypted.
    const payloadB64 = presentation.split("~")[0].split(".")[1];
    const payloadInput = (inputsDoc.inputs.payload as { storage: number[]; len: number });
    const payloadFromJwe = Uint8Array.from(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    if (payloadFromJwe.length !== payloadInput.len || !payloadFromJwe.every((b, i) => b === payloadInput.storage[i])) throw new Error("decrypted presentation differs from the generated inputs");
    log("decrypted issuer payload equals the circuit input payload");

    // 2. witness
    t0 = performance.now();
    status("generating witness (acvm_js)");
    const noir = new Noir(circuit);
    const { witness, returnValue } = await noir.execute(inputsDoc.inputs);
    mark("witness", t0);
    report.witnessBytes = witness.length;
    log(`witness ${witness.length} bytes (gz), return ${JSON.stringify(returnValue).slice(0, 120)}...`);

    // 3. prove (UltraHonk, keccak transcript for the Solidity verifier)
    t0 = performance.now();
    status(`proving (bb.js UltraHonk, verifierTarget evm, ${threads} threads)`);
    // Barretenberg.new fetches the wasm, spawns the worker pool and, on first use, downloads the
    // CRS range (numPoints * 64 bytes) from the Aztec CDN into IndexedDB.
    const api = await Barretenberg.new({ threads, memory: { maximum: 2 ** 16 } });
    mark("bb_init", t0);
    const backend = new UltraHonkBackend(circuit.bytecode, api);
    t0 = performance.now();
    const proof = await backend.generateProof(witness, { verifierTarget: "evm" });
    mark("prove", t0);
    report.proofBytes = proof.proof.length;
    report.proofHex = hex(proof.proof);
    report.publicInputs = proof.publicInputs;
    report.publicInputsDecoded = decodePublicInputs(proof.publicInputs);
    log(`proof ${proof.proof.length} bytes, ${proof.publicInputs.length} public inputs`);
    log(`decoded: ${JSON.stringify(report.publicInputsDecoded)}`);
    uaAfterProve = uaMemory();

    // 4. verify in the tab
    t0 = performance.now();
    status("verifying in the tab");
    report.verified = await backend.verifyProof(proof, { verifierTarget: "evm" });
    mark("verify", t0);
    log(`verified in browser: ${report.verified}`);
    t0 = performance.now();
    const vk = await backend.getVerificationKey({ verifierTarget: "evm" });
    mark("write_vk", t0);
    report.vkHex = hex(vk);
    report.vkSha256 = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", vk as Uint8Array<ArrayBuffer>)));
    log(`VK ${vk.length} bytes, sha256 ${report.vkSha256}`);
    await api.destroy();
    t.total_to_verified = Date.now() - startedAt;
    status(`done in ${(t.total_to_verified / 1000).toFixed(1)} s (load, JWE, witness, bb init, prove, verify), verified=${report.verified}`);
  } catch (e: any) {
    report.error = String(e?.stack ?? e);
    status(`failed: ${e?.message ?? e}`);
    log(`ERROR ${report.error}`);
  } finally {
    clearInterval(sampler);
    memory.peak_js_heap_main_thread = mib(peak);
    log(`peak main-thread JS heap (performance.memory, 250 ms samples): ${mib(peak)}`);
    const ua = await Promise.race([uaAfterProve, new Promise<number>((r) => setTimeout(() => r(-1), 60_000))]);
    memory.ua_specific_after_prove = ua < 0 ? "timed out after 60 s" : mib(ua);
    log(`measureUserAgentSpecificMemory after prove (workers and wasm included): ${memory.ua_specific_after_prove}`);
  }
  const full = report as Report;
  $("result").textContent = JSON.stringify({ ...full, proofHex: full.proofHex ? `${full.proofHex.slice(0, 64)}... (${full.proofHex.length / 2} bytes)` : undefined, vkHex: full.vkHex ? `${full.vkHex.slice(0, 64)}...` : undefined }, null, 2);
  (window as any).spikeReport = full;
  if (($("post") as HTMLInputElement).checked) {
    const r = await fetch("/__spike/result", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(full) });
    log(`stored: ${JSON.stringify(await r.json())}`);
  }
  return full;
}

$("run").addEventListener("click", () => void run());
(window as any).spikeRun = run;
