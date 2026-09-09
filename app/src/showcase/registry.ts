/**
 * The showcase: one demo per case, each a route under /showcase/<slug> (src/App.tsx). A case adds one line
 * here and keeps its code in src/showcase/<slug>/. Components load lazily, so the investor portal and the
 * issuer console carry no showcase code on the first paint.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { Wallet } from '../lib/wallet'

export interface ShowcaseEntry {
  slug: string
  title: string
  /** One sentence in plain words: what the demo shows. */
  sentence: string
  Component: LazyExoticComponent<ComponentType<{ wallet: Wallet }>>
}

export const showcases: ShowcaseEntry[] = [
  { slug: 'investor-money', title: 'Fund desk for an email investor', sentence: 'Subscribe in a test stablecoin, receive a distribution, claim it and redeem, every movement gated by the eligibility decision on chain.', Component: lazy(() => import('./investor-money/InvestorMoneyPage').then((m) => ({ default: m.InvestorMoneyPage }))) },
]
