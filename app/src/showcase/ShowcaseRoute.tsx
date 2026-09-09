import { Link, useParams } from 'react-router'
import type { Wallet } from '../lib/wallet'
import { SHOWCASE } from './registry'

/** /showcase/:slug renders the listed demo; /showcase and an unknown slug list them. */
export function ShowcaseRoute({ wallet }: { wallet: Wallet }) {
  const { slug } = useParams()
  const entry = SHOWCASE.find((e) => e.slug === slug)
  if (entry) {
    const Demo = entry.component
    return <Demo wallet={wallet} />
  }
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Showcase</h1>
          <p className="sub">Demos built on Attestat, the toolkit: each reads the same on-chain eligibility decision.</p>
        </div>
      </div>
      <ul className="gallery">
        {SHOWCASE.map((e) => (
          <li key={e.slug}>
            <Link to={`/showcase/${e.slug}`}>{e.title}</Link>
            <span className="muted">{e.sentence}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
