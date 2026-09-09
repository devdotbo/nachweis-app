/**
 * The one place the app decides between the Privy provider tree and the plain wagmi tree.
 * With VITE_PRIVY_APP_ID set it renders src/lib/PrivyWalletProvider.tsx (PrivyProvider, QueryClientProvider,
 * WagmiProvider from @privy-io/wagmi), loaded lazily so a build without the app id carries no Privy code
 * on the first paint; unset it renders `plain`, the caller's own provider tree, unchanged.
 *
 * Another screen or demo reuses it as `<PrivyBoundary plain={<its own wagmi tree>}>{children}</PrivyBoundary>`;
 * inside, `usePrivyBridge()` (src/lib/privyContext.ts) is non-null exactly when Privy is on.
 */
import { lazy, Suspense, type ReactNode } from 'react'
import { PRIVY_APP_ID } from '../config'

/** True when the build carries a Privy app id (VITE_PRIVY_APP_ID). */
export const PRIVY_ENABLED: boolean = Boolean(PRIVY_APP_ID)

const PrivyWalletProvider = lazy(() => import('./PrivyWalletProvider').then((m) => ({ default: m.PrivyWalletProvider })))

export function PrivyBoundary({ children, plain }: { children: ReactNode; plain: ReactNode }) {
  if (!PRIVY_APP_ID) return <>{plain}</>
  return (
    <Suspense fallback={null}>
      <PrivyWalletProvider appId={PRIVY_APP_ID}>{children}</PrivyWalletProvider>
    </Suspense>
  )
}
