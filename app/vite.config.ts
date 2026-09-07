import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const devSigner = Boolean(env.VITE_DEV_PRIVATE_KEY || env.VITE_DEV_OPERATOR_KEY)
  // The dev signer signs in the page with a plaintext key. A production bundle must never carry one.
  if (devSigner && mode === 'production' && process.env.NACHWEIS_ALLOW_DEV_SIGNER_BUILD !== '1') {
    throw new Error('VITE_DEV_PRIVATE_KEY or VITE_DEV_OPERATOR_KEY is set: refusing a production build with the dev signer (NACHWEIS_ALLOW_DEV_SIGNER_BUILD=1 overrides for local previews)')
  }
  return {
    plugins: [react()],
    server: { port: 5173 },
    // A constant, so the bundler drops src/lib/devSigner.ts and the key reads when no key is set.
    define: { __NACHWEIS_DEV_SIGNER__: JSON.stringify(devSigner) },
  }
})
