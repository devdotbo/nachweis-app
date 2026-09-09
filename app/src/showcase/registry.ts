/**
 * The showcase: one demo per case, each a route under /showcase/<slug> with its code in src/showcase/<slug>/.
 * A demo adds one line here (wiki/showcase-brief.md); the router (src/App.tsx) renders whatever is listed.
 */
import type { ComponentType } from 'react'
import type { Wallet } from '../lib/wallet'
import { SavingsPlanBoard } from './savings-plan/SavingsPlanBoard'

export interface ShowcaseEntry {
  slug: string
  title: string
  /** One sentence, shown in the gallery and as the page's subtitle. */
  sentence: string
  component: ComponentType<{ wallet: Wallet }>
}

export const SHOWCASE: ShowcaseEntry[] = [
  { slug: 'savings-plan', title: 'The attested savings plan', sentence: 'One eligibility decision, reused by a recurring plan, a second issuer, the permissioned pool and a transfer; one revoke closes every door.', component: SavingsPlanBoard },
]
