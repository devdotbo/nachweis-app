/**
 * The local stack the specs run against, as scripts/app-e2e-local.sh wrote it. The specs start
 * nothing themselves.
 */
import { expect, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface StackEnv {
  mode: 'noir' | 'sp1-mock'
  appUrl: string
  rpcUrl: string
  verifierUrl: string
  bridgeUrl: string
  registry: string
  fundToken: string
  subscription: string
  noirVerifier: string
  policyId: string
  investor: string
  operator: string
  issuerJson: string
  issuerKeyPem: string
  issuerCertPem: string
  companionDir: string
  walletScript: string
  runDir: string
}

const ENV_PATH = process.env.APP_E2E_ENV ?? resolve(import.meta.dirname, '../../.e2e/app/env.json')

export function loadStack(): StackEnv {
  if (!existsSync(ENV_PATH)) throw new Error(`no stack: ${ENV_PATH} is missing, start one with scripts/app-e2e-local.sh`)
  return JSON.parse(readFileSync(ENV_PATH, 'utf8')) as StackEnv
}

/** Full-page screenshot into app/_preview/e2e/<mode>/<name>.png (gitignored). */
export async function shot(page: Page, mode: string, name: string): Promise<void> {
  const dir = resolve(import.meta.dirname, '../_preview/e2e', mode)
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: resolve(dir, `${name}.png`), fullPage: true })
}

/** Runs a bun script the way the shell scripts do (bb, nargo, foundry and bun on PATH). */
export function runBun(args: string[], cwd: string, timeoutMs: number): { status: number | null; stdout: string; stderr: string } {
  const home = process.env.HOME ?? ''
  const path = [`${home}/.nargo/bin`, `${home}/.bb`, `${home}/.foundry/bin`, `${home}/.cargo/bin`, `${home}/.bun/bin`, process.env.PATH ?? ''].join(':')
  const r = spawnSync('bun', args, { cwd, env: { ...process.env, PATH: path }, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

export function short(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/** Card by its heading text, e.g. card(page, 'Eligibility'). */
export function card(page: Page, heading: string) {
  return page.locator('section.card', { has: page.locator('h2', { hasText: heading }) })
}

/** The dev signer is connected as `address` for the role on screen. */
export async function expectConnected(page: Page, address: string): Promise<void> {
  await expect(page.locator('header .chip')).toContainText(short(address))
  await expect(page.locator('section.card .row > code', { hasText: new RegExp(`^${address}$`) })).toBeVisible()
}

