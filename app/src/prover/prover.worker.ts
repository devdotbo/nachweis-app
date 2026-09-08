/// <reference lib="webworker" />
/**
 * The prover worker: everything that touches the presentation happens here, off the UI thread.
 * Decrypts the wallet's JWE with WebCrypto, runs the statement checks of shared/pid/statement.ts,
 * derives the circuit inputs (shared/pid/prover-inputs.ts), executes the witness with noir_js,
 * proves with bb.js UltraHonk (keccak transcript, the EVM verifier's flavour) on all cores, verifies
 * in the tab and posts proof, public inputs and timings back. The presentation, the disclosures and
 * the KB-JWT are locals of one function call; nothing about the holder is posted or logged.
 */
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js'
import { Noir, type CompiledCircuit, type InputMap } from '@noir-lang/noir_js'
import constantsSrc from '../../../circuits/pid-sdjwt/src/constants.nr?raw'
import { hexDecode, hexEncode, utf8Decode } from '../../../shared/pid/bytes'
import { decryptCompactJwe } from '../../../shared/pid/jwe'
import { buildProverInputs, parseCircuitConstants } from '../../../shared/pid/prover-inputs'
import { decodePublicInputWords } from '../../../shared/pid/public-inputs'
import { checkKbFreshness, issuerKeyFromX5c, verifyPresentation } from '../../../shared/pid/statement'
import type { ProveRequest, WorkerMessage, WorkerPhase } from './messages'

const post = (m: WorkerMessage) => self.postMessage(m)
const log = (line: string) => post({ type: 'log', line })

async function prove(req: ProveRequest): Promise<void> {
  const t: Record<string, number> = {}
  let phase: WorkerPhase = 'checking'
  const mark = (name: string, from: number) => {
    t[name] = Math.round(performance.now() - from)
    log(`${name}: ${t[name]} ms`)
  }
  let api: Barretenberg | undefined
  try {
    // 1. the wallet's response: JWE -> vp_token -> presentation (WebCrypto only)
    post({ type: 'phase', phase })
    let t0 = performance.now()
    const constants = parseCircuitConstants(constantsSrc)
    const circuitPromise = fetch(req.circuitUrl).then(async (r) => {
      if (!r.ok) throw new Error(`circuit artifact ${r.status} from ${req.circuitUrl}`)
      return (await r.json()) as CompiledCircuit & { hash?: number; noir_version?: string }
    })
    const { plaintext, header } = await decryptCompactJwe(req.jwe, req.privateKey)
    const body = JSON.parse(utf8Decode(plaintext)) as { vp_token?: Record<string, unknown> }
    const vp = body?.vp_token
    if (!vp || typeof vp !== 'object') throw new Error('decrypted response has no vp_token')
    const [credId, value] = Object.entries(vp)[0] as [string, unknown]
    const presentation = Array.isArray(value) ? String(value[0]) : String(value)
    if (!presentation.includes('~')) throw new Error('vp_token entry is not an SD-JWT presentation')
    mark('jwe_decrypt', t0)
    log(`decrypted ${String(header.alg)}/${String(header.enc)}: vp_token[${credId}] is an SD-JWT with ${presentation.split('~').length - 2} disclosures (${presentation.length} chars)`)

    // 2. statement checks, the companion's `prove` pre-check
    t0 = performance.now()
    const issuerKeySec1 = issuerKeyFromX5c(presentation.split('~')[0])
    const boundAddress = hexDecode(req.boundAddress)
    const challenge = hexDecode(req.challengeHex)
    const verified = await verifyPresentation({ presentation, issuerKeySec1, expectedVct: req.expectedVct, expectedAud: constants.PINNED_AUD, boundAddress, challenge })
    if (req.kbWindowSecs > 0) checkKbFreshness(verified, Math.floor(Date.now() / 1000), req.kbWindowSecs)
    if (!verified.over18) throw new Error('age_equal_or_over.18 is not disclosed as true; the circuit cannot prove this presentation')
    if (verified.expiry === 0) throw new Error('issuer credential has no exp; the circuit requires one')
    if (verified.nonce !== req.nonce.toLowerCase()) throw new Error('KB-JWT nonce differs from the bridge session nonce')
    mark('precheck', t0)
    log(`statement holds: over18, expiry ${verified.expiry}, nonce bound to ${req.boundAddress}; ${verified.disclosedClaimNames.length} disclosures anchored (names and values stay in the worker)`)

    // 3. circuit inputs (the same derivation as circuits/tools/gen-prover.ts)
    t0 = performance.now()
    const generated = await buildProverInputs(
      {
        presentation,
        issuer_key_sec1_hex: hexEncode(issuerKeySec1),
        expected_vct: req.expectedVct,
        expected_aud: constants.PINNED_AUD,
        bound_address_hex: req.boundAddress,
        challenge_hex: req.challengeHex,
      },
      constants,
    )
    mark('gen_inputs', t0)
    log(generated.summary)

    // 4. witness
    phase = 'witness'
    post({ type: 'phase', phase })
    t0 = performance.now()
    const circuit = await circuitPromise
    log(`circuit ${circuit.noir_version ?? '?'} hash ${circuit.hash ?? '?'}, bytecode ${circuit.bytecode.length} chars (base64)`)
    const noir = new Noir(circuit)
    const { witness } = await noir.execute(generated.inputs as unknown as InputMap)
    mark('witness', t0)
    log(`witness ${witness.length} bytes (gz)`)

    // 5. prove (UltraHonk, keccak transcript for the Solidity verifier)
    phase = 'init'
    post({ type: 'phase', phase, note: 'first run downloads the 67 MB CRS from the Aztec CDN into IndexedDB' })
    t0 = performance.now()
    // Barretenberg.new fetches the wasm, spawns the worker pool and, on first use, downloads the
    // CRS range (numPoints * 64 bytes) from the Aztec CDN into IndexedDB. 2^16 pages = the wasm32
    // ceiling (4 GiB); bb.js caps iPhone/iPad at 2^14 itself.
    api = await Barretenberg.new({ threads: req.threads, memory: { maximum: 2 ** 16 } })
    mark('bb_init', t0)
    const backend = new UltraHonkBackend(circuit.bytecode, api)
    phase = 'proving'
    post({ type: 'phase', phase })
    t0 = performance.now()
    const proof = await backend.generateProof(witness, { verifierTarget: 'evm' })
    mark('prove', t0)
    log(`proof ${proof.proof.length} bytes, ${proof.publicInputs.length} public inputs`)

    // 6. verify in the tab and cross-check the committed values against the statement check
    phase = 'verifying'
    post({ type: 'phase', phase })
    t0 = performance.now()
    const verifiedInTab = await backend.verifyProof(proof, { verifierTarget: 'evm' })
    mark('verify', t0)
    if (!verifiedInTab) throw new Error('bb.js verifyProof returned false in the tab')
    const decoded = decodePublicInputWords(proof.publicInputs)
    const expect = (label: string, got: string | number, want: string | number) => {
      if (String(got).toLowerCase() !== String(want).toLowerCase()) throw new Error(`public input ${label} is ${got}, the statement check expected ${want}`)
    }
    expect('subject', decoded.subject, '0x' + verified.subject)
    expect('issuer_key_hash', decoded.issuer_key_hash, '0x' + verified.issuerKeyHash)
    expect('nonce', decoded.nonce, '0x' + verified.nonce)
    expect('expiry', decoded.expiry, verified.expiry)
    expect('over18', decoded.over18, 1)
    expect('expected.nonce', generated.expected.nonce, decoded.nonce)
    log(`verified in the tab: ${verifiedInTab}; public inputs match the statement check`)

    post({
      type: 'done',
      proofHex: '0x' + hexEncode(proof.proof),
      publicInputsHex: proof.publicInputs.map((w) => (w.startsWith('0x') ? w : '0x' + w)),
      decoded,
      verifiedInTab,
      timingsMs: t,
      threads: req.threads,
      crossOriginIsolated: self.crossOriginIsolated,
    })
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e), phase })
  } finally {
    await api?.destroy().catch(() => undefined)
  }
}

self.onmessage = (ev: MessageEvent<ProveRequest>) => {
  if (ev.data?.type === 'prove') void prove(ev.data)
}
