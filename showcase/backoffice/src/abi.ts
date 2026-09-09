/** The AttestationRegistry ABI, read from the app's JSON so the desk and the UI share one source. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Abi, AbiFunction } from 'viem'

const ABI_PATH = fileURLToPath(new URL('../../../app/src/abi/AttestationRegistry.json', import.meta.url))

export const registryAbi: Abi = JSON.parse(readFileSync(ABI_PATH, 'utf8')) as Abi

/** The single ABI entry for a function, the shape Privy wants in an ethereum_calldata condition. */
export function abiFunction(name: string): AbiFunction {
  const item = registryAbi.find((e) => e.type === 'function' && e.name === name)
  if (!item || item.type !== 'function') throw new Error(`ABI has no function ${name}`)
  return item
}
