/**
 * Showcase demos (wiki/showcase-brief.md): one route per case under /showcase/<slug>. Each case adds one
 * line here; its code lives in src/showcase/<slug>/. Keep entries lazy so a demo's code is not in the
 * product bundle until its route is opened.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export interface ShowcaseEntry {
  slug: string
  title: string
  /** One sentence for the gallery. */
  sentence: string
  Component: LazyExoticComponent<ComponentType>
}

export const SHOWCASE: ShowcaseEntry[] = [
  { slug: 'backoffice', title: 'Compliance desk', sentence: "An issuer's desk approves and withdraws investor wallets under a four-eyes rule from a Privy server wallet whose policy allows approve and revoke on the registry and nothing else.", Component: lazy(() => import('./backoffice/BackofficeDesk').then((m) => ({ default: m.BackofficeDesk }))) },
]

export const SHOWCASE_PATH = '/showcase'
