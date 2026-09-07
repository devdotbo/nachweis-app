import type { Abi } from 'viem'
import registryJson from '../abi/AttestationRegistry.json'
import fundTokenJson from '../abi/FundToken.json'
import subscriptionJson from '../abi/Subscription.json'

export const registryAbi = registryJson as Abi
export const fundTokenAbi = fundTokenJson as Abi
export const subscriptionAbi = subscriptionJson as Abi
