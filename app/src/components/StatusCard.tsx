import type { Address } from 'viem'
import { BRIDGE_STATES, type BridgeState } from '../bridge'
import { POLICY_ID, REQUIRED_BITS } from '../config'
import { useDecision, useEligible } from '../lib/chain'
import { bitFlags, formatExpiry, shortHex, tierLabel } from '../lib/format'
import type { Session } from '../lib/sessions'
import { hasDecision } from '../lib/types'

export type InvestorStatus = 'not permitted' | 'presented, awaiting issuer' | 'permitted' | 'revoked' | 'expired'

export function useInvestorStatus(address?: Address, session?: Session) {
  const { decision } = useDecision(address)
  const eligible = useEligible(address)
  let status: InvestorStatus = 'not permitted'
  if (eligible) status = 'permitted'
  else if (decision.revoked) status = 'revoked'
  else if (hasDecision(decision) && decision.expiry <= BigInt(Math.floor(Date.now() / 1000))) status = 'expired'
  else if (session && (session.state === 'presented' || session.state === 'attested') && session.bridge?.state !== 'failed') status = 'presented, awaiting issuer'
  return { decision, eligible: Boolean(eligible), status }
}

const STEPS: readonly BridgeState[] = BRIDGE_STATES.filter((s) => s !== 'failed')

function stepClass(step: BridgeState, current: BridgeState): string {
  if (current === 'failed') return step === 'created' ? 'step done' : 'step failed'
  const i = STEPS.indexOf(step)
  const c = STEPS.indexOf(current)
  return i < c ? 'step done' : i === c ? 'step current' : 'step'
}

export function StatusCard({ address, session }: { address?: Address; session?: Session }) {
  const { decision, status } = useInvestorStatus(address, session)
  const cls = status === 'permitted' ? 'open' : status === 'presented, awaiting issuer' ? 'waiting' : 'closed'
  const b = session?.bridge
  return (
    <section className={`card${address ? '' : ' locked'}`}>
      <h2>
        <span className="n">3</span>Eligibility
      </h2>
      <div className="row">
        <span className={`status ${cls}`}>{status}</span>
        <span className="muted">
          required bits 0x{REQUIRED_BITS.toString(16)} under policy {shortHex(POLICY_ID, 6)}
        </span>
      </div>
      {session ? (
        <>
          <div className="steps">
            {STEPS.map((s) => (
              <span key={s} className={stepClass(s, b?.state ?? 'created')}>
                {s}
              </span>
            ))}
            {b?.state === 'failed' ? <span className="step failed">failed</span> : null}
          </div>
          {b?.detail ? <p className={`muted${b.state === 'failed' ? ' err' : ''}`}>bridge: {b.detail}</p> : null}
          {b?.txHash ? (
            <p className="row">
              <span className="muted">attest tx</span>
              <code>{b.txHash}</code>
            </p>
          ) : null}
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
      </dl>
      {!hasDecision(decision) ? <p className="muted">No decision on chain for this address yet (decisionOf returns zeros).</p> : null}
    </section>
  )
}
