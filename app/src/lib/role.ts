import { useLocation } from 'react-router'

export type Role = 'investor' | 'issuer'

export const ISSUER_PATH = '/issuer'

/** The area on screen decides the role: the issuer console at /issuer, the investor portal everywhere else. */
export function useRole(): Role {
  const { pathname } = useLocation()
  return pathname === ISSUER_PATH || pathname.startsWith(`${ISSUER_PATH}/`) ? 'issuer' : 'investor'
}
