/**
 * Showcase registry: one line per demo built on Attestat (wiki showcase-brief.md). Each entry is a route
 * /showcase/<slug> rendered by ShowcaseRoute; the component is loaded lazily so a demo costs nothing until opened.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export interface ShowcaseEntry {
  slug: string
  title: string
  /** One sentence, obeys product.md's honesty rules. */
  sentence: string
  component: LazyExoticComponent<ComponentType>
}

export const SHOWCASES: ShowcaseEntry[] = [
  { slug: 'payout-desk', title: 'Contractor payout desk', sentence: 'A company pays freelance contractors in a test stablecoin from a Privy server wallet that may only pay through GatedPayout, and GatedPayout pays only addresses with a live Attestat decision.', component: lazy(() => import('./payout-desk/PayoutDeskScreen').then((m) => ({ default: m.PayoutDeskScreen }))) },
]

export function showcaseOf(slug: string | undefined): ShowcaseEntry | undefined {
  return SHOWCASES.find((s) => s.slug === slug)
}
