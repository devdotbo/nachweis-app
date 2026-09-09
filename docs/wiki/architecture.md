---
type: reference
title: Architecture
updated: 2026-09-07
---

# Architecture

One decision object, three consumers, one pluggable proof interface. Code: /Users/bioharz/git/ethglobal/nachweis-app (contracts, service, app, circuits, prover-sp1) and the verifier worktree /Users/bioharz/git/ethglobal/nachweis-verifier-relay (branch nachweis-relay). Background memo: /Users/bioharz/git/ethglobal/nachweis/raw/2026-09-06-pluggable-architecture.md.

## Input: EUDI presentation to verifier-service

- The investor's official test wallet answers an OpenID4VP request (DCQL, SD-JWT PID, vct urn:eudi:pid:de:1) from verifier-service. Registered minimal request: given_name, family_name, age_equal_or_over.18 (FACT, /Users/bioharz/git/eudi-wallet-hackathon/verifier/verifier-core/src/pid.rs:140-146).
- verifier-service checks issuer trust (x5c chain to the sandbox trust anchor), disclosure digests, the KB-JWT holder binding, nonce and audience. Pre-existing, disclosed.
- Address binding (new, WP3): the investor's wallet signs the EIP-191 session message; the KB-JWT nonce is lowercase hex of sha256(address20 || challenge32) (FACT, /Users/bioharz/git/ethglobal/nachweis-app/prover-sp1/NOTES.md, statement item 6). The same definition binds the presentation to the address in the SP1 guest and in the relay branch. The EUDI wallet does not sign the address; the EVM key does (open question b).
- Issuer approval (new): the issuer matches name plus age to its onboarding record and approves in a separate step; remaining checks are stubs labelled simulated.

## Decision: EligibilityDecision on Sepolia

FACT, /Users/bioharz/git/ethglobal/nachweis-app/contracts/src/interfaces/IEligibility.sol:

    struct Decision {
        bytes32 policyId;   // issuer policy identifier
        uint256 bits;       // predicate bits, meaning per policy (bit 0 = over 18)
        uint8   tier;       // issuer-defined tier, informational
        uint64  expiry;     // unix seconds, after which the decision no longer counts
        bytes32 statusRef;  // opaque reference to an off-chain status entry, never a name
        bool    revoked;    // set by an operator revoke
    }

Stored per (subject address, policyId) in AttestationRegistry. Two write paths: attestByOperator (issuer operator key) and attestWithProof (see proof interface). Revoke by operator. Read: isEligible(subject, policyId, requiredBits) and decisionOf(subject, policyId). No name, no document, no string.

## Outputs: the consumers

1. FundToken transfer check: the demo fund token's transfer hook calls isEligible before subscribe, transfer and withdraw (contracts/src/FundToken.sol, Subscription.sol).
2. Uniswap v4 permissioned pool: an IAllowlistChecker implementation (checkAllowlist(address account, address tokenAddress) returns PermissionFlag, FACT per positions.md turn 5 citing v4-periphery) reads the same registry (WP7). Sepolia PermissionsAdapterFactory 0xE6B0d96919334C33d06266d1420F97f6f434fA2B, PermissionedHooks 0x51247E2291d290d17C08813A175AC86465EdE8c0 (FACT fetched 2026-09-06, positions.md).
3. Stretch, not this week: Uniswap CCA IValidationHook as a third consumer (README mention only).

One revoke closes every door in the same block.

## Proof interface: IProofVerifier

FACT, /Users/bioharz/git/ethglobal/nachweis-app/contracts/src/interfaces/IProofVerifier.sol and AttestationRegistry.attestWithProof:

    interface IProofVerifier {
        function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
    }

One implementation per policy, set by the registry owner. Before calling verify, the registry binds:

    publicInputs[0] = bytes32(uint256(uint160(subject)))
    publicInputs[1] = decision.policyId
    publicInputs[2] = bytes32(decision.bits)
    publicInputs[3] = bytes32(uint256(decision.expiry))

tier and statusRef are caller-supplied and not bound by the proof in this layout; consumers gate on bits only until the layout is extended. A revoked decision cannot be reopened through attestWithProof.

SP1 adapter (WP2b, merged to main 2026-09-07, FACT /Users/bioharz/git/ethglobal/nachweis-app/contracts/src/sp1/Sp1PidVerifier.sol): implements IProofVerifier. Proof argument = abi.encode(bytes publicValues, bytes sp1ProofBytes). Config immutable: gateway, vkey, issuerKeyHash, vctHash, policyId; default POLICY_ID = keccak256("nachweis.pid.over18.v1"). bits = BIT_IDENTITY (1, identity evidence accepted, always set when a proof exists) | BIT_OVER_18 (2, set iff the proof's over18 is 1). The registry consumes nonces through IProofVerifier.nonceOf(proof) and reverts with NonceConsumed on replay. Sepolia fork test against the real SP1VerifierGateway: the Groth16 fixture verifies at about 280k gas; tampered public values and a tampered proof are rejected (read-only fork, no transaction). forge test 2026-09-07: 47 passed, 4 fork tests skipped without RPC.

Address control (decision 2026-09-07): the proof binds the subject address through the nonce (sha256(address || challenge) inside the KB-JWT), but no wallet signature is inside the proof. Control of the address is shown off chain: the wallet signs an EIP-191 message "nachweis:session:<session_id>" and the bridge verifies it before attesting. Video beat 3a stays as "wallet signs the session" with that caption.

## Where the proof is made: three deployment steps, one interface

1. Today, server: verifier-service verifies the presentation and generates the proof (SP1, R1). The chain sees policy, bits, expiry and a bound address, never a name. The server did see the presentation; say so.
2. Next, device: the proof moves to the investor's device (companion prover on the Pixel, eid-privacy Noir circuit; browser bb.js unverified). verifier-service becomes a blind relay: the client generates an ephemeral encryption key, the server signs the JAR and relays the JWE unopened. Same contract, same record.
3. When wallets ship provers: the wallet proves on the phone (Longfellow over mdoc); verifier-zk already accepts Longfellow proofs (pre-existing). Nothing on chain changes.

The chain side is final in all three; only the prover location moves. The landing page states the same three steps (/Users/bioharz/git/ethglobal/nachweis-site/index.html, section "Where the proof lives").
