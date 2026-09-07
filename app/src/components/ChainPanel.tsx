import type { Address } from 'viem'
import { REGISTRY } from '../config'
import { useDecision } from '../lib/chain'
import { decisionJson } from '../lib/format'

export function ChainPanel({ address }: { address?: Address }) {
  const { decision } = useDecision(address)
  return (
    <section className={`card span2${address ? '' : ' locked'}`}>
      <h2>
        <span className="n">5</span>What the chain sees
      </h2>
      <p className="lead">
        AttestationRegistry.decisionOf({address ?? 'subject'}, policyId) at {REGISTRY}
      </p>
      <pre className="raw">{decisionJson(decision)}</pre>
      <p className="note mint">No name, no document. The chain stores a policy id, predicate bits, a tier, an expiry and an opaque status reference.</p>
    </section>
  )
}
