# Sepolia deployment record, 2026-09-10

Written by scripts/sepolia-deploy.sh (dry run). Re-running the script with `--record docs/deployments/sepolia-dry-run-2026-09-10.md` skips every step whose address below is live.
Dry run on an anvil fork of Sepolia (chain id 31337, fork source https://ethereum-sepolia-rpc.publicnode.com, fork block 11673625). The addresses below exist only on that fork. The env lines are written as they would be for a real Sepolia run.

- Deployer (registry owner, token issuer, operator, LP): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
- Policy id: 0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f (keccak256("nachweis.pid.over18.v1")), required bits 3
- NoirPidVerifier issuer pin: 0xb4f2bfa1df99f06e588d39931b2cfd517a2befe8737c7f86bfa5c668d2abe079 (sandbox PID issuer (official German test wallet; scripts/browser-real-wallet-up.sh))
- Uniswap v4 on Sepolia: PoolManager 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543, PermissionsAdapterFactory 0xE6B0d96919334C33d06266d1420F97f6f434fA2B, PermissionedHooks 0x51247E2291d290d17C08813A175AC86465EdE8c0, UniversalRouter 0x54C707Df83f03bc9cA64ED2CcF9C99B63FD854b7, PositionManager 0xf99D553912084c99F6299291b75Fe9B7119Aa1A7, Permit2 0x000000000022D473030F116dDEE9F6B43aC78BA3, StateView 0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C
- Etherscan verification: skipped (dry run)
- Probe: investor 0x70997970C51812dc3A010C7d01b50e0d17dc79C8: subscribe minted 100000000000000000000 NDF wei; swap of 100000000 mUSD raw returned 90652862473832711386 NDF wei; probe gas 446373 (not counted in the deployer total)

## Addresses

```
CHAIN_ID=31337
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
DEPLOY_BLOCK=11673626
REGISTRY=0xe8a133308f421aba4C468A4eAA1b0bc88ADb674B
FUND_TOKEN=0xe3e131BfAd12666A52640C6d59974089B37b7F23
SUBSCRIPTION=0xCdDB057F68563A97A76c798DaaFCeDe08eA977A3
HONK_VERIFIER=0xe3C5bfDDAdF8E04cE1e7e62251279b09b1cE61B5
NOIR_VERIFIER=0x6AeE38b431cE8197607d01bc4CDe3fC1EB855507
MOCK_STABLE=0xfB4B1BCF76148a3f2c435F9C115E0aB141Ad24F1
CHECKER=0x919ec08B1052ae94e54b027bdA4A86DF8CAcB494
ADAPTER=0xc440aD626959d97a689Ba0465f2F1eD293a0b20D
POOL_ID=0xfa0cb27b941c0dc747079b9d214115f2a39a38e4370f99b18e4a8b72489f1be6
CURRENCY0=0xc440aD626959d97a689Ba0465f2F1eD293a0b20D
CURRENCY1=0xfB4B1BCF76148a3f2c435F9C115E0aB141Ad24F1
POOL_FEE=3000
TICK_SPACING=60
LP_TOKEN_ID=9
POLICY_ID=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f
ISSUER_KEY_HASH=0xb4f2bfa1df99f06e588d39931b2cfd517a2befe8737c7f86bfa5c668d2abe079
DEPLOYER_GAS_TOTAL=14180393
```

## Env lines for the browser-real-wallet stack (docs/demo-runbook.md, "Sepolia run")

App (Vite), `scripts/browser-real-wallet-up.sh --deployment <this file>` passes them itself:

```
VITE_CHAIN_ID=11155111
VITE_RPC_URL=<SEPOLIA_RPC_URL>
VITE_REGISTRY=0xe8a133308f421aba4C468A4eAA1b0bc88ADb674B
VITE_FUND_TOKEN=0xe3e131BfAd12666A52640C6d59974089B37b7F23
VITE_SUBSCRIPTION=0xCdDB057F68563A97A76c798DaaFCeDe08eA977A3
VITE_POLICY_ID=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f
VITE_REQUIRED_BITS=3
VITE_POOL_ADAPTER=0xc440aD626959d97a689Ba0465f2F1eD293a0b20D
VITE_POOL_STABLE=0xfB4B1BCF76148a3f2c435F9C115E0aB141Ad24F1
VITE_POOL_FEE=3000
VITE_POOL_TICK_SPACING=60
```

Bridge (service/):

```
RPC_URL=<SEPOLIA_RPC_URL>
OPERATOR_PRIVATE_KEY=$DEPLOYER_PRIVATE_KEY
REGISTRY=0xe8a133308f421aba4C468A4eAA1b0bc88ADb674B
NOIR_VERIFIER=0x6AeE38b431cE8197607d01bc4CDe3fC1EB855507
POLICY_ID=nachweis.pid.over18.v1
REQUIRE_ADDRESS_PROOF=true
```

Automation (automation/.env, only with the Privy standing order):

```
CHAIN_ID=11155111
RPC_URL=<SEPOLIA_RPC_URL>
REGISTRY=0xe8a133308f421aba4C468A4eAA1b0bc88ADb674B
SUBSCRIPTION=0xCdDB057F68563A97A76c798DaaFCeDe08eA977A3
FUND_TOKEN=0xe3e131BfAd12666A52640C6d59974089B37b7F23
START_BLOCK=11673626
```

## Gas

14180393 gas used by the deployer over all runs of this record (14180393 in this run); at 2 gwei 0.0284 ETH, at 20 gwei 0.2836 ETH; with a 1.5 margin fund 0.043 ETH (2 gwei) to 0.425 ETH (20 gwei)
Deployer balance went from 10000.000000000000000000 to 9999.993974954872025693 ETH (0.006025 ETH spent at the node's gas price, 1.964352385 gwei at start).

## Runs


### 2026-09-10T07:59:04Z (dry run, block 11673625)

| step | what | gas used | transactions |
|---|---|---|---|
| 1 | Deploy.s.sol | 2292580 | CREATE 0x6b4eed78e20d8b8b9023847078d0a809cd8103afc01006cff9b90339281a7540; setOperator(bytes32,address,bool) 0x833bdf2909b8b6bfc43e3194d80d92ec7ac8bf78b990ea906b27fc0eed1c5f82; FundToken 0x144fa3a175d273d656db8f12f2339be9b5b32f0abe27ce1751ade56d8da9ae8c; Subscription 0x6c13bc11faa5f1735319d2136274a85a0387510602361d5071fe0616fd37a9f8; FundToken 0x9a8930f36fb2e1423883274cf707dfd55e4e957813033f3b8444a81df1849c00 |
| 2 | DeployNoirVerifier.s.sol | 7504986 | ZKTranscriptLib 0xdd5d4ea4a682e449cbc0822aab43c2524bb4601563ef159e014e80fd1e10109a; HonkVerifier 0x9e15016d6f64d55e178d7064f53e8cd79c1ccc2f84398dda384822f8687a9f71; CREATE 0x0bd437d69fa6b02e0f2c313e0ff04e7bc2ae32d69bcd0dfc9fcc5eca6ca3319e; setVerifier(bytes32,address) 0x094a0e42ca8d12cdce715df0ae87947857b41786d31ec4c250dfabb3669e15f8 |
| 3 | CreatePermissionedPool.s.sol | 3247324 | MockStable 0xe6d03ea91ce3aba3a82f229c69cc0ad5b9e6f1159cd900f19d36805adebd9fc2; EudiAllowlistChecker 0xf11797f482a8bef0eb46bfd719975561393e4ca27a974a212b09bb1522e72cb9; createPermissionsAdapter(address,address,address) 0x773cc8a1de3991c43068857269c96c73e4652e53622c941a8bdfe72cd54794fa; attestByOperator(address,(bytes32,uint256,uint8,uint64,bytes32,bool)) 0x51d8f41207070d5ab6269c62ea48ccbdae16e29dd2b16bfba50cc61154aa4064; mint(address,uint256) 0x91e979b2a604ab54001e08e61ba15c11e7fa41c997de72fc1088e0933605a48b; approve(address,uint256) 0x02db52bea20eb182a2c8faaca67f1913d616ab9857d11ea839d586608148cf03; depositForVerification(uint256) 0x9825b3cf7a0fbd12b400d3a30d0e87ba0debc132cd41744506987e10cc4351ee; verifyPermissionsAdapter(address) 0xce3605cdd0259c86a9c34fa965f6a8ae5b38c885cc2ba625d654ffbb8ec9ba37; updateAllowedWrapper(address,bool) 0xb0e7349ae007c95acc12d75a2970e49702f2d819d7f8afa5ee85f535474148af; updateAllowedWrapper(address,bool) 0xe1dad2cc9800dfc6b326616a392de9b6fc3729c7cd9213463231baa24f9031ea; updateAllowedWrapper(address,bool) 0xf0d487ce484910a650857c482be43d3604aaf9c69f6fd02f35706e3d9100559b; updateAllowedWrapper(address,bool) 0x72670dd2b5e9a531f04bdb46048aed455beeffb9ffac77722b07953d147fb665; updateAllowedHook(address,bool) 0x0b5c8826a9ea25a4d46e0e39a31e8182583456b9b7814d4d80711944d98c0038; initialize((address,address,uint24,int24,address),uint160) 0x9e407efa324ea995e33ed315b2af11c7e6f138914d93eeb95475eb49eaad02bd; updateSwappingEnabled(bool) 0x76d4403479a5242c1c186912e50f27b42ab475c745ea63576851a8d0165a3186 |
| 4 | AddLiquidityPermissioned.s.sol | 1010987 | attestByOperator(address,(bytes32,uint256,uint8,uint64,bytes32,bool)) 0x8378080fd529a2cee1d04c76bb295377a3199b4cd4bbad1429d76019cde143ff; mint(address,uint256) 0x5049364e96926693cd2bf801ca222856976be52c162fc654f3357f52a67353ba; mint(address,uint256) 0x41c065a44351f3adcd611e895b0fdf4af4e3e430ec9384fca446019622ca96d3; approve(address,uint256) 0x8a4bd914d9b809dea5acaf0df8ef4896bb3a978779ec806cf9fe6c564a5c2ab7; approve(address,uint256) 0x0c5875b4dbfd0818ed97017933345faba2237c6315e6250bbbe1f394f96fdc16; approve(address,address,uint160,uint48) 0x5a361b54e531fa84cd73977c679c1158f7381eb2db982b184cfb9bd65331ec48; approve(address,address,uint160,uint48) 0xf0c8bea4197136fb2300746a3d4f085325bc6d2e773d05a70fe3b983d67f06a8; modifyLiquidities(bytes,uint256) 0xcb631f4978d4e8310f17406899e43b5df6a5e35f9b224b5e51698e8c4b76889c |
| 7a | attestByOperator (operator path) | 124516 | 0x213d9f5be52b7ad5f0fe679f4588540bdd6f4557401592184421ea58cbcbe2b6 |
| 7b | Subscription.subscribe (investor) | 73717 | 0x6bd4319d688ef22ac7476ac342f9ac2f6acf50b9f2a80070aeecf9d98dc10e90 |
| 7c | SwapPermissioned.s.sol (100000000 mUSD raw in) | 372656 | mint(address,uint256) 0xc3e77f366aa0a9541bccecc5e0af08f2cf9b2aa506adc367256ad7922995bce3; approve(address,uint256) 0x0cce7b34186d7f65dcc0d4e2dde8654eb2890ddbed6a74487bacd72535b40367; approve(address,address,uint160,uint48) 0xfa73edfe1272b4a69df8be39fe62ab2e4d4b9a665bfca8c9dbbb57e323375aab; execute(bytes,bytes[],uint256) 0x311edc1eb067a65d0121c1f4a9ed225a0e74baf78af5a67654cef7750ca3cbf3 |


## Stack test on this deployment (2026-09-10)

`DEPLOYMENT_RPC=<the kept anvil> scripts/browser-real-wallet-up.sh --deployment docs/deployments/sepolia-dry-run-2026-09-10.md` attached the browser-real-wallet stack to the deployment above in 4 s: no anvil started, no forge script run, addresses and issuer pin from this record, `VITE_CHAIN_ID` from the record's chain id, the Swap door on from the adapter. The relay verifier was replaced by a local stub answering `/health` and `POST /relay/request` (via `G0_ENV`), because the real verifier reads the builder's RP key; the bridge and the Vite app were real. `app/e2e/swap.spec.ts` against that stack: 1 passed (11.3 s): attested by operator, permitted, mUSD faucet mint, swap through PermissionedHooks, "Swapped in the permissioned pool", revoke, "Refused by PermissionedHooks.beforeSwap". Not exercised: the phone flow through the real verifier, Etherscan verification, and any transaction on Sepolia itself.
