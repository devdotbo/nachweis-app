import type { Address } from 'viem'
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
  else if (session?.state === 'presented') status = 'presented, awaiting issuer'
  return { decision, eligible: Boolean(eligible), status }
}

export function StatusCard({ address, session }: { address?: Address; session?: Session }) {
  const { decision, status } = useInvestorStatus(address, session)
  const cls = status === 'permitted' ? 'open' : status === 'presented, awaiting issuer' ? 'waiting' : 'closed'
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
