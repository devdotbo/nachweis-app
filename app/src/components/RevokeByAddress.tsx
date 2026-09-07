import { useState } from 'react'
import { isAddress, type Address } from 'viem'
import { POLICY_ID } from '../config'
import { useRegistryTx } from '../lib/chain'
import { TxLine } from './TxLine'

/** Revoke for a subject without a session in this browser (for example after a reload). */
export function RevokeByAddress({ operator }: { operator?: Address }) {
  const [value, setValue] = useState('')
  const { tx, revoke } = useRegistryTx(operator)
  const valid = isAddress(value)
  return (
    <section className={`card${operator ? '' : ' locked'}`}>
      <h2>
        <span className="n">3</span>Revoke by address
      </h2>
      <p className="lead">AttestationRegistry.revoke(subject, policyId). Closes Subscribe and Swap for that address.</p>
      <div className="row">
        <input
          className="chip"
          style={{ flex: 1, minWidth: 260, background: 'var(--ink-2)', border: '1px solid var(--line)', color: 'inherit', padding: '9px 12px' }}
          placeholder="0x subject address"
          value={value}
          onChange={(e) => setValue(e.target.value.trim())}
        />
        <button type="button" className="btn btn-coral" disabled={!operator || !valid || tx.status === 'pending'} onClick={() => void revoke(value as Address, POLICY_ID).catch(() => {})}>
          Revoke
        </button>
      </div>
      <TxLine tx={tx} />
    </section>
  )
}
