import { Suspense } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { SHOWCASES, showcaseOf } from './registry'

export const SHOWCASE_PATH = '/showcase'

/** /showcase: the list of demos. /showcase/:slug: one demo, lazily loaded. Unknown slugs go home. */
export function ShowcaseIndex() {
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Showcase</h1>
          <p className="sub">Demos built on Attestat: one eligibility decision on chain, read by more than one door. Official test wallet, sample identity; nothing here is a live product.</p>
        </div>
      </div>
      <ul className="list">
        {SHOWCASES.map((s) => (
          <li key={s.slug} className="item">
            <div className="top">
              <Link to={`${SHOWCASE_PATH}/${s.slug}`}>{s.title}</Link>
            </div>
            <p className="muted">{s.sentence}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}

export function ShowcaseRoute() {
  const { slug } = useParams()
  const entry = showcaseOf(slug)
  if (!entry) return <Navigate to={SHOWCASE_PATH} replace />
  const C = entry.component
  return (
    <Suspense fallback={<main className="page">Loading {entry.title}</main>}>
      <C />
    </Suspense>
  )
}
