import { TxHash } from '../../components/TxLine'
import type { DeskTxState } from './desk'

/** The state of the last desk transaction: pending, confirmed with its hash, refused in simulation, or failed. */
export function DeskTxLine({ tx }: { tx: DeskTxState }) {
  switch (tx.status) {
    case 'idle':
      return null
    case 'pending':
      return (
        <p className="txline">
          <span className="status waiting">tx pending</span>
          <span className="muted">{tx.label}</span>
        </p>
      )
    case 'done':
      return (
        <p className="txline">
          <span className="status open">tx confirmed</span>
          <TxHash hash={tx.hash} /> <span className="muted">{tx.what}</span>
        </p>
      )
    case 'refused':
      return (
        <p className="note coral" data-testid="desk-refused">
          {tx.reason}
        </p>
      )
    case 'error':
      return <p className="err">{tx.message}</p>
  }
}
