/**
 * The investor's journey as the rail shows it: nine steps, each derived from the wallet, the
 * session in this browser and the chain (statusOf, isEligible, balanceOf). The chain wins over
 * the session wherever both speak.
 */
import type { Address } from 'viem'
import { POOL } from '../config'
import type { Session } from './sessions'
import type { RegistryStatus } from './types'

/** 'revoked': the issuer withdrew the approval; shown in red like 'failed' but named for what happened. */
export type StepState = 'off' | 'current' | 'ready' | 'done' | 'failed' | 'revoked'
export type StepId = 'connect' | 'present' | 'prove' | 'attested' | 'approved' | 'subscribe' | 'swap' | 'holdings' | 'history'

export interface Step {
  id: StepId
  label: string
  /** Section anchor in the flow column. */
  anchor: string
  state: StepState
  /** One short line under the label: what is happening or what happened. */
  detail?: string
}

export interface JourneyInput {
  address?: Address
  session?: Session
  chain: RegistryStatus
  eligible: boolean
  balance?: bigint
  historyCount: number
  /** A swap through the permissioned pool went through from this browser (receipts store). */
  swapped?: boolean
}

const PROVED_STATES = new Set(['proved', 'attested', 'approved', 'revoked'])

export function journeySteps(i: JourneyInput): Step[] {
  const { address, session, chain, eligible, balance } = i
  const b = session?.bridge?.state
  const proved = Boolean(session && (PROVED_STATES.has(session.state) || (b && PROVED_STATES.has(b)))) || chain.hasDecision
  const proveFailed = b === 'failed' || session?.browser?.phase === 'failed'
  const presented = Boolean(session && (session.signature === 'signed' || session.state !== 'pending'))

  const steps: Step[] = []
  steps.push({ id: 'connect', label: 'Connect wallet', anchor: '#connect', state: address ? 'done' : 'current', detail: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'the subject address' })
  steps.push({
    id: 'present',
    label: 'Present your ID',
    anchor: '#present',
    state: !address ? 'off' : session?.state === 'rejected' ? 'failed' : presented ? 'done' : 'current',
    detail: !session ? 'official test wallet, sample identity' : session.state === 'rejected' ? 'presentation rejected' : session.signature === 'signed' ? 'session signed by your wallet' : session.signature === 'failed' ? 'signature refused' : 'waiting for your signature',
  })
  steps.push({
    id: 'prove',
    label: 'Prove',
    anchor: '#prove',
    state: !presented || session?.state === 'rejected' ? 'off' : proveFailed && !proved ? 'failed' : proved ? 'done' : 'current',
    detail: proved ? proofOriginShort(session) : proveFailed ? 'proof failed' : 'where the proof is made',
  })
  steps.push({
    id: 'attested',
    label: 'Evidence on chain',
    anchor: '#eligibility',
    state: chain.hasDecision ? 'done' : proved ? 'current' : 'off',
    detail: chain.hasDecision ? 'decision stored' : proved ? 'attest transaction in flight' : 'attestWithProof',
  })
  steps.push({
    id: 'approved',
    label: 'Issuer approval',
    anchor: '#eligibility',
    state: chain.revoked ? 'revoked' : chain.approved ? 'done' : chain.hasDecision ? 'current' : 'off',
    detail: chain.revoked ? 'withdrawn by the issuer (manual)' : chain.approved ? 'approved, doors open' : chain.hasDecision ? 'awaiting the issuer' : 'a separate step by the issuer',
  })
  const held = balance !== undefined && balance > 0n
  steps.push({ id: 'subscribe', label: 'Subscribe', anchor: '#doors', state: held ? 'done' : eligible ? 'current' : 'off', detail: held ? 'fund token received' : eligible ? 'door open' : 'door closed' })
  steps.push({
    id: 'swap',
    label: 'Swap',
    anchor: '#doors',
    state: !POOL ? 'off' : i.swapped ? 'done' : eligible ? 'current' : 'off',
    detail: !POOL ? 'no pool configured' : i.swapped ? 'swapped in the permissioned pool' : eligible ? 'permissioned pool open' : 'door closed',
  })
  steps.push({ id: 'holdings', label: 'Holdings', anchor: '#holdings', state: held ? 'done' : 'off', detail: held ? 'fund token balance' : 'nothing held yet' })
  steps.push({ id: 'history', label: 'History', anchor: '#history', state: i.historyCount > 0 ? 'done' : 'off', detail: i.historyCount > 0 ? `${i.historyCount} ${i.historyCount === 1 ? 'entry' : 'entries'}` : 'receipts and registry events' })

  // One marker: the first step that needs the investor now; later open steps are "ready".
  let marked = false
  for (const s of steps) {
    if (s.state === 'current') {
      if (marked) s.state = 'ready'
      marked = true
    }
  }
  return steps
}

function proofOriginShort(session?: Session): string {
  const o = proofOrigin(session)
  return o ? o.short : 'proof accepted'
}

/**
 * Where the proof was made, for the caption on screen. Browser: the tab. Noir proof through the
 * handoff: the phone app or the desktop companion (on the investor's computer). Anything else the
 * bridge proved itself on the issuer's server (SP1 route), which saw the presentation.
 */
export function proofOrigin(session?: Session): { short: string; caption: string } | undefined {
  switch (proofRoute(session)) {
    case 'browser':
      return { short: 'made in this browser tab', caption: "Proof made in this browser tab. The relay passed the wallet's encrypted answer through unopened; the tab decrypted it, proved and dropped it." }
    case 'companion':
      return { short: 'made by the desktop companion', caption: "Proof made by the desktop companion on the investor's computer. The relay passed the wallet's encrypted answer through unopened." }
    case 'phone':
      return { short: 'made on the phone', caption: "Proof made by the phone app. The relay passed the wallet's encrypted answer through unopened." }
    case 'noir':
      return { short: 'made on the phone or the companion', caption: "Proof made by the phone app or the desktop companion, not by a server. The relay passed the wallet's encrypted answer through unopened." }
    case 'sp1':
      return { short: "made by the issuer's server", caption: "Proof made by the issuer's bridge server (SP1 route). The chain does not trust the server, but the server did see the presentation." }
    default:
      return undefined
  }
}

/** Which route made the proof, or undefined while nothing is proved yet (or the decision came without a proof). */
export type ProofRoute = 'browser' | 'phone' | 'companion' | 'noir' | 'sp1'

export function proofRoute(session?: Session): ProofRoute | undefined {
  if (!session) return undefined
  if (session.browser?.phase === 'submitted') return 'browser'
  const b = session.bridge
  if (!b || !PROVED_STATES.has(b.state)) return undefined
  if (b.proofSystem?.startsWith('noir')) {
    if (session.provePath === 'companion') return 'companion'
    if (session.provePath === 'phone') return 'phone'
    return 'noir'
  }
  return 'sp1'
}
