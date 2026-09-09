import type { Address } from 'viem'
import { REGISTRY } from '../config'
import { useDecision } from '../lib/chain'
import { addressUrl } from '../lib/explorer'
import { decisionJson } from '../lib/format'

export function ChainPanel({ address }: { address?: Address }) {
  const { decision } = useDecision(address)
  const url = addressUrl(REGISTRY)
  return (
    <section className={`card${address ? '' : ' locked'}`} id="chain">
      <h2>What the chain sees</h2>
      <p className="lead">
        The registry's stored decision for {address ? <code>{address}</code> : 'your address'} under this policy, read from {url ? <a href={url} target="_blank" rel="noreferrer">the AttestationRegistry</a> : 'the AttestationRegistry'} at <code>{REGISTRY}</code>.
      </p>
      <pre className="raw">{decisionJson(decision)}</pre>
      <p className="note mint">No identity documents on chain, and nothing we could use to find you. The chain stores a policy id, predicate bits, a tier, an expiry and an opaque status reference.</p>
    </section>
  )
}
