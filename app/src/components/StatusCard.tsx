import type { Address } from 'viem'
import { BRIDGE_STATES, type BridgeState } from '../bridge'
import { POLICY_ID, REQUIRED_BITS } from '../config'
import { useDecision, useEligible, useRegistryStatus } from '../lib/chain'
import { bitFlags, formatExpiry, shortHex, tierLabel } from '../lib/format'
import type { Session } from '../lib/sessions'
import { hasDecision } from '../lib/types'
import { proofOrigin, type StepState } from '../lib/journey'
import { StateChip } from './Rail'
import { TxHash } from './TxLine'

export type InvestorStatus = 'not permitted' | 'presented, awaiting issuer' | 'evidence on chain, awaiting issuer approval' | 'permitted' | 'revoked' | 'expired'

/** Chain first: isEligible needs evidence and issuer approval; statusOf tells which of the two is missing. */
export function useInvestorStatus(address?: Address, session?: Session) {
  const { decision } = useDecision(address)
  const eligible = useEligible(address)
  const chain = useRegistryStatus(address)
  let status: InvestorStatus = 'not permitted'
  if (eligible) status = 'permitted'
  else if (decision.revoked || chain.revoked) status = 'revoked'
  else if (hasDecision(decision) && decision.expiry <= BigInt(Math.floor(Date.now() / 1000))) status = 'expired'
  else if (chain.hasDecision && !chain.approved) status = 'evidence on chain, awaiting issuer approval'
  else if (session && (session.state === 'presented' || session.state === 'proved' || session.state === 'attested') && session.bridge?.state !== 'failed')
    status = 'presented, awaiting issuer'
  return { decision, chain, eligible: Boolean(eligible), status }
}

const STEPS: readonly BridgeState[] = BRIDGE_STATES.filter((s) => s !== 'failed' && s !== 'revoked')

function stepClass(step: BridgeState, current: BridgeState): string {
  if (current === 'failed') return step === 'created' ? 'step done' : 'step failed'
  if (current === 'revoked') return step === 'approved' ? 'step failed' : 'step done'
  const i = STEPS.indexOf(step)
  const c = STEPS.indexOf(current)
  return i < c ? 'step done' : i === c ? 'step current' : 'step'
}

export function StatusCard({ address, session, state }: { address?: Address; session?: Session; state?: StepState }) {
  const { decision, chain, status } = useInvestorStatus(address, session)
  const origin = proofOrigin(session)
  const cls = status === 'permitted' ? 'open' : status === 'presented, awaiting issuer' || status === 'evidence on chain, awaiting issuer approval' ? 'waiting' : 'closed'
  const b = session?.bridge
  // The issuer approves and revokes on chain; show that step from the chain even when the bridge still says attested.
  const shown: BridgeState = chain.revoked && b?.state !== 'failed' ? 'revoked' : chain.approved && b?.state !== 'failed' ? 'approved' : (b?.state ?? 'created')
  return (
    <section className={`card${address ? '' : ' locked'}`} id="eligibility">
      <h2>
        Eligibility
        <StateChip state={state} />
      </h2>
      <p className="lead">Two things open the doors: the proof's evidence stored on chain, and the issuer's approval as a separate transaction. Both are read live from the registry.</p>
      <div className="row">
        <span className={`status ${cls}`}>{status}</span>
        <span className="muted">
          required bits 0x{REQUIRED_BITS.toString(16)} under policy {shortHex(POLICY_ID, 6)}
        </span>
      </div>
      {!address ? <div className="empty">Connect a wallet to read its eligibility from the registry.</div> : null}
      {session ? (
        <>
          <div className="steps">
            {STEPS.map((s) => (
              <span key={s} className={stepClass(s, shown)}>
                {s}
              </span>
            ))}
            {shown === 'failed' ? <span className="step failed">failed</span> : null}
            {shown === 'revoked' ? <span className="step failed">revoked</span> : null}
          </div>
          {b?.detail ? <p className={`muted${b.state === 'failed' ? ' err' : ''}`}>bridge: {b.detail}</p> : null}
          {b?.txHash ? (
            <p className="row">
              <span className="muted">attest tx</span>
              <TxHash hash={b.txHash} chars={12} />
            </p>
          ) : null}
          {origin ? <p className="caption">{origin.caption}</p> : null}
          {session.bridgeError ? <p className="err">{session.bridgeError}</p> : null}
        </>
      ) : null}
      <div className="flags">
        {bitFlags(decision.bits).map((f) => (
          <span key={f.label} className={`flag${f.on ? ' on' : ''}`}>
            {f.on ? 'yes' : 'no'}: {f.label}
          </span>
        ))}
      </div>
      <dl className="kv">
        <dt>policyId</dt>
        <dd>{decision.policyId}</dd>
        <dt>bits</dt>
        <dd>0x{decision.bits.toString(16)}</dd>
        <dt>tier</dt>
        <dd>{tierLabel(decision.tier)}</dd>
        <dt>expiry</dt>
        <dd>{formatExpiry(decision.expiry)}</dd>
        <dt>statusRef</dt>
        <dd>{decision.statusRef}</dd>
        <dt>revoked</dt>
        <dd>{decision.revoked ? 'true' : 'false'}</dd>
        <dt>approved</dt>
        <dd data-testid="approved">{chain.approved ? 'true' : 'false'}</dd>
      </dl>
      {address && !hasDecision(decision) ? <p className="muted">No decision on chain for this address yet (decisionOf returns zeros).</p> : null}
      {chain.hasDecision && !chain.approved && !chain.revoked ? <p className="muted">Evidence is on chain. The doors open only after the issuer approves.</p> : null}
      {chain.revoked ? <p className="muted">Approval withdrawn by the issuer, a manual step on the issuer console. Re-approval is the issuer's decision; a replayed proof cannot reopen the doors.</p> : null}
      <p className="caption">Checks beyond identity evidence and age are simulated in this build.</p>
    </section>
  )
}
