import type { Step } from '../lib/journey'

/** The journey rail: nine steps, one marker. Links scroll to the matching section. */
export function Rail({ steps, note }: { steps: Step[]; note?: string }) {
  return (
    <nav className="rail" aria-label="Your progress">
      <h2>Your progress</h2>
      <ol>
        {steps.map((s) => (
          <li key={s.id} className={s.state} aria-current={s.state === 'current' ? 'step' : undefined}>
            <a href={s.anchor}>
              <span className="pip" aria-hidden="true" />
              <span>
                {s.label}
                {s.detail ? <span className="small">{s.detail}</span> : null}
              </span>
            </a>
          </li>
        ))}
      </ol>
      {note ? <p className="foot">{note}</p> : null}
    </nav>
  )
}

/** The chip next to a section title. Generic words on purpose: the section body says what exactly happened. */
export function StateChip({ state }: { state?: Step['state'] }) {
  if (!state || state === 'off') return null
  const text = state === 'done' ? 'complete' : state === 'failed' ? 'failed' : state === 'ready' ? 'ready' : 'in progress'
  return <span className={`state ${state === 'ready' ? 'done' : state}`}>{text}</span>
}
