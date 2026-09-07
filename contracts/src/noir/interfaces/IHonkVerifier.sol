// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @title IHonkVerifier
/// @notice Interface of the bb-generated UltraHonk verifier (`IVerifier` in
///         src/noir/PidSdJwtUltraHonkVerifier.sol). Declared separately so that the adapter does not
///         pull the 100 KB generated file into its own compilation unit.
/// @dev The generated verifier reverts with a typed error (Errors.*) on a malformed or invalid proof
///      and returns true otherwise; a false return is not produced by the current generator.
interface IHonkVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}
