// `prove`: native pre-check, Prover.toml via circuits/tools/gen-prover.ts, nargo execute, bb prove
// (evm target), decode and cross-check the 86 public inputs. Everything that carries the
// presentation (input.json, Prover toml, witness) is written 0600 and removed when done.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type DecodedPublicInputs, type SessionFile } from "./session";
import { checkKbFreshness, issuerKeyFromX5c, StatementError, verifyPresentation, type Verified } from "./statement";
import { fromHex, hex, hex0x, log, nowUnix } from "./util";

export interface ProveOptions {
  issuerKeySec1Hex?: string; // override; default: x5c leaf of the issuer JWT
  expectedVct: string;
  expectedAud: string;
  kbWindowSecs: number; // 0 disables the freshness check
  circuitDir: string;
  vkPath?: string;
  skipBbVerify?: boolean;
}

export function repoRoot(): string {
  return resolve(dirname(new URL(import.meta.url).pathname), "..", "..");
}

export function defaultCircuitDir(): string {
  return process.env.NACHWEIS_CIRCUIT_DIR ?? join(repoRoot(), "circuits", "pid-sdjwt");
}

function toolPath(name: string): string {
  const home = process.env.HOME ?? "";
  const candidates = [
    ...(process.env.PATH ?? "").split(":").map((p) => join(p, name)),
    join(home, ".nargo", "bin", name),
    join(home, ".bb", name),
    join(home, ".bun", "bin", name),
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error(`${name} not found on PATH (nargo: ~/.nargo/bin, bb: ~/.bb)`);
  return found;
}

interface RunResult {
  ms: number;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], cwd: string, label: string): RunResult {
  const t = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: process.env });
  const ms = Date.now() - t;
  if (r.status !== 0) {
    throw new Error(`${label} failed (exit ${r.status}) after ${ms} ms\n${cmd} ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  }
  log(`${label}: ${(ms / 1000).toFixed(2)} s`);
  return { ms, stdout: r.stdout, stderr: r.stderr };
}

/// Native statement check with the same rules as prover-sp1/lib, plus the freshness window.
export async function precheck(session: SessionFile, opts: ProveOptions): Promise<{ verified: Verified; issuerKeySec1: Buffer }> {
  if (!session.presentation) throw new Error("session has no presentation; run `pickup` first");
  const issuerKeySec1 = opts.issuerKeySec1Hex ? fromHex(opts.issuerKeySec1Hex) : issuerKeyFromX5c(session.presentation.split("~")[0]);
  const verified = await verifyPresentation({
    presentation: session.presentation,
    issuerKeySec1,
    expectedVct: opts.expectedVct,
    expectedAud: opts.expectedAud,
    boundAddress: fromHex(session.bound_address),
    challenge: fromHex(session.challenge_hex),
  });
  if (opts.kbWindowSecs > 0) checkKbFreshness(verified, nowUnix(), opts.kbWindowSecs);
  if (!verified.over18) throw new StatementError("age_equal_or_over.18 is not disclosed as true; the circuit cannot prove this presentation");
  if (verified.expiry === 0) throw new StatementError("issuer credential has no exp; the circuit requires one");
  return { verified, issuerKeySec1 };
}

/// 86 field elements: subject 20 bytes, issuer_key_hash 32 bytes, over18, expiry (u64), nonce 32 bytes.
export function decodePublicInputs(words: Buffer[]): DecodedPublicInputs {
  if (words.length !== 86) throw new Error(`expected 86 public inputs, got ${words.length}`);
  const byteAt = (i: number): number => {
    const w = words[i];
    if (w.length !== 32 || !w.subarray(0, 31).every((b) => b === 0)) throw new Error(`public input ${i} is not a byte`);
    return w[31];
  };
  const bytes = (from: number, n: number) => Buffer.from(Array.from({ length: n }, (_, k) => byteAt(from + k)));
  const expiryWord = words[53];
  if (!expiryWord.subarray(0, 24).every((b) => b === 0)) throw new Error("expiry public input exceeds u64");
  return {
    subject: hex0x(bytes(0, 20)),
    issuer_key_hash: hex0x(bytes(20, 32)),
    over18: byteAt(52),
    expiry: Number(expiryWord.readBigUInt64BE(24)),
    nonce: hex0x(bytes(54, 32)),
  };
}

export function splitWords(raw: Buffer): Buffer[] {
  if (raw.length % 32 !== 0) throw new Error(`public_inputs is ${raw.length} bytes, not a multiple of 32`);
  return Array.from({ length: raw.length / 32 }, (_, i) => raw.subarray(i * 32, (i + 1) * 32));
}

export async function prove(session: SessionFile, sessionPath: string, opts: ProveOptions): Promise<SessionFile["proof"]> {
  const timings: Record<string, number> = {};
  let t = Date.now();
  const { verified, issuerKeySec1 } = await precheck(session, opts);
  timings.precheck_ms = Date.now() - t;
  log(`statement holds natively (${timings.precheck_ms} ms): over18=${verified.over18}, expiry=${verified.expiry}, disclosed claims: ${verified.disclosedClaimNames.join(", ")}`);

  const circuitDir = resolve(opts.circuitDir);
  const nargo = toolPath("nargo");
  const bb = toolPath("bb");
  const bun = process.execPath;
  const genProver = join(circuitDir, "..", "tools", "gen-prover.ts");
  if (!existsSync(genProver)) throw new Error(`${genProver} not found`);
  const acir = join(circuitDir, "target", "pid_sdjwt.json");
  if (!existsSync(acir)) {
    log("compiling the circuit (target/pid_sdjwt.json missing)");
    t = Date.now();
    run(nargo, ["compile"], circuitDir, "nargo compile");
    timings.compile_ms = Date.now() - t;
  }

  // Working files next to the session file, 0600; the Prover toml has to live in the package dir.
  const workDir = join(dirname(sessionPath), `proof-${session.session_id.slice(0, 8)}`);
  mkdirSync(workDir, { recursive: true, mode: 0o700 });
  const inputJson = join(workDir, "input.json");
  writeFileSync(
    inputJson,
    JSON.stringify({
      presentation: session.presentation,
      issuer_key_sec1_hex: hex(issuerKeySec1),
      expected_vct: opts.expectedVct,
      expected_aud: opts.expectedAud,
      bound_address_hex: session.bound_address,
      challenge_hex: session.challenge_hex,
    }),
    { mode: 0o600 },
  );
  const proverName = `Prover-companion-${session.session_id.slice(0, 8)}`;
  const proverToml = join(circuitDir, `${proverName}.toml`);
  const witnessName = `companion-${session.session_id.slice(0, 8)}`;
  const witnessPath = join(circuitDir, "target", `${witnessName}.gz`);
  const cleanup = () => {
    for (const f of [inputJson, proverToml, witnessPath]) {
      try {
        if (existsSync(f)) unlinkSync(f);
      } catch {}
    }
  };
  try {
    t = Date.now();
    const gen = run(bun, ["run", genProver, inputJson, proverToml], circuitDir, "gen-prover.ts");
    chmodSync(proverToml, 0o600);
    timings.gen_prover_ms = Date.now() - t;
    const expectedLine = gen.stdout.split("\n").find((l) => l.startsWith("expected public outputs"));
    if (expectedLine) log(expectedLine);

    t = Date.now();
    run(nargo, ["execute", witnessName, "-p", proverName, "--silence-warnings"], circuitDir, "nargo execute");
    timings.execute_ms = Date.now() - t;

    let vk = opts.vkPath ?? process.env.NACHWEIS_VK ?? join(circuitDir, "out", "adapted", "vk");
    if (!existsSync(vk)) {
      const vkDir = join(workDir, "vk");
      mkdirSync(vkDir, { recursive: true });
      t = Date.now();
      run(bb, ["write_vk", "-b", acir, "-o", vkDir, "-t", "evm"], circuitDir, "bb write_vk");
      timings.write_vk_ms = Date.now() - t;
      vk = join(vkDir, "vk");
    }

    const outDir = join(workDir, "out");
    mkdirSync(outDir, { recursive: true });
    t = Date.now();
    run(bb, ["prove", "-b", acir, "-w", witnessPath, "-k", vk, "-o", outDir, "-t", "evm"], circuitDir, "bb prove");
    timings.bb_prove_ms = Date.now() - t;

    const proofBytes = readFileSync(join(outDir, "proof"));
    const publicInputsRaw = readFileSync(join(outDir, "public_inputs"));
    if (!opts.skipBbVerify) {
      t = Date.now();
      run(bb, ["verify", "-k", vk, "-p", join(outDir, "proof"), "-i", join(outDir, "public_inputs"), "-t", "evm"], circuitDir, "bb verify");
      timings.bb_verify_ms = Date.now() - t;
    }

    const words = splitWords(publicInputsRaw);
    const decoded = decodePublicInputs(words);
    const expect = (label: string, got: string | number, want: string | number) => {
      if (String(got).toLowerCase() !== String(want).toLowerCase()) throw new Error(`public input ${label} is ${got}, the pre-check expected ${want}`);
    };
    expect("subject", decoded.subject, "0x" + verified.subject);
    expect("issuer_key_hash", decoded.issuer_key_hash, "0x" + verified.issuerKeyHash);
    expect("nonce", decoded.nonce, "0x" + verified.nonce);
    expect("expiry", decoded.expiry, verified.expiry);
    expect("over18", decoded.over18, 1);
    log(`proof ${proofBytes.length} bytes, ${words.length} public inputs; bb prove ${(timings.bb_prove_ms / 1000).toFixed(2)} s`);
    return {
      proof_hex: hex0x(proofBytes),
      public_inputs_hex: words.map(hex0x),
      decoded,
      issuer_key_sec1_hex: hex(issuerKeySec1),
      expected_aud: opts.expectedAud,
      timings_ms: timings,
    };
  } finally {
    cleanup();
  }
}
