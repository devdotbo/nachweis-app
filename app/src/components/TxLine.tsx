import type { TxState } from '../lib/types'
import { shortHex } from '../lib/format'

export function TxLine({ tx }: { tx: TxState }) {
  switch (tx.status) {
    case 'idle':
      return null
    case 'pending':
      return (
        <p className="row">
          <span className="status waiting">tx pending</span>
          <span className="muted">{tx.label}</span>
        </p>
      )
    case 'done':
      return (
        <p className="row">
          <span className="status open">tx confirmed</span>
          <code>{shortHex(tx.hash, 8)}</code>
        </p>
      )
    case 'error':
      return <p className="err">{tx.message}</p>
  }
}
