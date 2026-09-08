/** Messages between the investor screen and the prover worker (src/prover/prover.worker.ts). */
import type { DecodedPublicInputs } from '../../../shared/pid/public-inputs'

export type WorkerPhase = 'checking' | 'witness' | 'init' | 'proving' | 'verifying'
export const WORKER_PHASES: readonly WorkerPhase[] = ['checking', 'witness', 'init', 'proving', 'verifying']

export interface ProveRequest {
  type: 'prove'
  /** The wallet's compact JWE as picked up from the relay. */
  jwe: string
  /** The tab's ephemeral ECDH private key (non-extractable; structured-cloned into the worker). */
  privateKey: CryptoKey
  /** 0x + 40 hex, the bridge session's bound address. */
  boundAddress: string
  /** 64 hex chars, the bridge session's challenge. */
  challengeHex: string
  /** 64 hex chars, the nonce the bridge and the relay derived; the KB-JWT must carry it. */
  nonce: string
  /** Where the stripped circuit artifact is served. */
  circuitUrl: string
  threads: number
  /** KB-JWT freshness window in seconds, 0 disables. */
  kbWindowSecs: number
  expectedVct: string
}

export type WorkerMessage =
  | { type: 'phase'; phase: WorkerPhase; note?: string }
  | { type: 'log'; line: string }
  | {
      type: 'done'
      proofHex: string
      publicInputsHex: string[]
      decoded: DecodedPublicInputs
      verifiedInTab: boolean
      timingsMs: Record<string, number>
      threads: number
      crossOriginIsolated: boolean
    }
  | { type: 'error'; message: string; phase?: WorkerPhase }
