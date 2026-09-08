import { defineConfig, loadEnv, searchForWorkspaceRoot, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * bb.js proves with a thread pool on SharedArrayBuffer, which the browser only hands out to a
 * cross-origin isolated page. Both headers must also come from the static host in production
 * (README, "Hosting"); without them the "Prove in this browser" path falls back to the handoff.
 */
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

/**
 * The compiled circuit (the same committed artifact the phone apps prove with; hash checked
 * against the on-chain VK in the WP26 spike), served at /circuits/pid_sdjwt.json stripped to what
 * noir_js needs (abi, bytecode, hash, noir_version): 2.9 MB instead of 3.9 MB. Dev serves it from
 * the repository, the build copies it into dist/.
 */
const CIRCUIT_SRC = resolve(repoRoot, 'prover-android/app/src/main/assets/pid_sdjwt.json')
export const CIRCUIT_ROUTE = '/circuits/pid_sdjwt.json'
function circuitArtifact(): Plugin {
  let stripped: string | undefined
  const load = () => {
    if (!stripped) {
      const a = JSON.parse(readFileSync(CIRCUIT_SRC, 'utf8')) as Record<string, unknown>
      stripped = JSON.stringify({ noir_version: a.noir_version, hash: a.hash, abi: a.abi, bytecode: a.bytecode })
    }
    return stripped
  }
  const serve = (server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) => {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== CIRCUIT_ROUTE) return next()
      const body = load()
      res.setHeader('content-type', 'application/json')
      res.setHeader('cache-control', 'public, max-age=3600')
      res.end(body)
    })
  }
  let outDir = 'dist'
  return {
    name: 'nachweis-circuit-artifact',
    configResolved(c) {
      outDir = c.build.outDir
    },
    configureServer: serve,
    configurePreviewServer: serve,
    closeBundle() {
      const dir = resolve(outDir, 'circuits')
      mkdirSync(dir, { recursive: true })
      writeFileSync(resolve(dir, 'pid_sdjwt.json'), load())
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const devSigner = Boolean(env.VITE_DEV_PRIVATE_KEY || env.VITE_DEV_OPERATOR_KEY)
  // The dev signer signs in the page with a plaintext key. A production bundle must never carry one.
  if (devSigner && mode === 'production' && process.env.NACHWEIS_ALLOW_DEV_SIGNER_BUILD !== '1') {
    throw new Error('VITE_DEV_PRIVATE_KEY or VITE_DEV_OPERATOR_KEY is set: refusing a production build with the dev signer (NACHWEIS_ALLOW_DEV_SIGNER_BUILD=1 overrides for local previews)')
  }
  return {
    plugins: [react(), circuitArtifact()],
    server: {
      port: 5173,
      headers: isolation,
      // The prover worker imports shared/pid (also used by the companion CLI) and the circuit's constants.nr.
      fs: { allow: [searchForWorkspaceRoot(process.cwd()), resolve(repoRoot, 'shared'), resolve(repoRoot, 'circuits/pid-sdjwt/src')] },
    },
    preview: { headers: isolation },
    // The wasm packages resolve their workers and .wasm files relative to import.meta.url; pre-bundling would break that.
    optimizeDeps: { exclude: ['@noir-lang/noir_js', '@noir-lang/acvm_js', '@noir-lang/noirc_abi', '@aztec/bb.js'] },
    worker: { format: 'es' as const },
    build: { target: 'esnext' },
    // A constant, so the bundler drops src/lib/devSigner.ts and the key reads when no key is set.
    define: { __NACHWEIS_DEV_SIGNER__: JSON.stringify(devSigner) },
  }
})
