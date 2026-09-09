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
    <section className={`card${operator ? '' : ' locked'}`} id="revoke">
      <h2>Revoke by address</h2>
      <p className="lead">Withdraw approval for any subject under this policy, whether or not its session was opened in this browser. Closes Subscribe and Swap for that address at once. Manual revocation: the registry records who did it and when.</p>
      <div className="field">
        <input className="input" placeholder="0x subject address" value={value} onChange={(e) => setValue(e.target.value.trim())} aria-label="subject address" />
        <button type="button" className="btn btn-coral" disabled={!operator || !valid || tx.status === 'pending'} onClick={() => void revoke(value as Address, POLICY_ID).catch(() => {})}>
          Revoke
        </button>
      </div>
      {value && !valid ? <p className="err">Not an address: expected 0x followed by 40 hex characters.</p> : null}
      <TxLine tx={tx} />
    </section>
  )
}
