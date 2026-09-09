import { Suspense } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { SHOWCASE, SHOWCASE_PATH } from './registry'

/** /showcase lists the demos; /showcase/:slug renders one. Unknown slugs go home. */
export function ShowcaseRoute() {
  const { slug } = useParams()
  if (!slug) {
    return (
      <main className="page console">
        <div className="page-head">
          <div>
            <h1>Showcase</h1>
            <p className="sub">Demos built on Attestat: each one reads the same eligibility decision from the AttestationRegistry.</p>
          </div>
        </div>
        <div className="list">
          {SHOWCASE.map((s) => (
            <div className="item" key={s.slug}>
              <div className="top">
                <Link to={`${SHOWCASE_PATH}/${s.slug}`}>
                  <strong>{s.title}</strong>
                </Link>
              </div>
              <p className="muted">{s.sentence}</p>
            </div>
          ))}
        </div>
      </main>
    )
  }
  const entry = SHOWCASE.find((s) => s.slug === slug)
  if (!entry) return <Navigate to="/" replace />
  const C = entry.Component
  return (
    <Suspense fallback={<main className="page console" />}>
      <C />
    </Suspense>
  )
}
