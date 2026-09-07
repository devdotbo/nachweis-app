// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";

/// @notice Loads test/fixtures/noir/{proof,public_inputs,vk_hash}.bin, the bb (evm target) output for the
///         pid-sdjwt circuit on the realistic PID vector (prover-sp1/fixtures/realistic-input.json). See
///         test/fixtures/noir/SOURCE.md.
library NoirFixture {
    struct Data {
        bytes proof;
        bytes32[] publicInputs; // 86 field elements
        bytes32 vkHash;
        // decoded values, as documented in SOURCE.md
        address subject;
        bytes32 issuerKeyHash;
        uint8 over18;
        uint64 expiry;
        bytes32 nonce;
    }

    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function load() internal view returns (Data memory d) {
        string memory dir = string.concat(vm.projectRoot(), "/test/fixtures/noir/");
        d.proof = vm.readFileBinary(string.concat(dir, "proof.bin"));
        bytes memory raw = vm.readFileBinary(string.concat(dir, "public_inputs.bin"));
        require(raw.length % 32 == 0, "public_inputs.bin: not a multiple of 32");
        d.publicInputs = new bytes32[](raw.length / 32);
        for (uint256 i = 0; i < d.publicInputs.length; i++) {
            bytes32 word;
            assembly {
                word := mload(add(add(raw, 0x20), mul(i, 0x20)))
            }
            d.publicInputs[i] = word;
        }
        d.vkHash = bytes32(vm.readFileBinary(string.concat(dir, "vk_hash.bin")));
        d.subject = 0xF99EDdE971F4e9c88715a79CA78963284A2955dC;
        d.issuerKeyHash = 0xb52359580c14e2d79d34605740d86338adc6a0868a22ec648d1896187813fd26;
        d.over18 = 1;
        d.expiry = 1819756800; // issuer credential exp, 2027-09-01T00:00:00Z
        d.nonce = 0x306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762;
    }
}
