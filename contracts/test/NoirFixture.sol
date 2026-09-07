// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";

/// @notice Loads test/fixtures/noir/{proof,public_inputs,vk_hash}.bin, the bb (evm target) output for the
///         pid-sdjwt circuit on the minted PID vector. See test/fixtures/noir/SOURCE.md.
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
        d.subject = 0xcF02AD5376095e285FC88AE8c1Fa240791370c17;
        d.issuerKeyHash = 0x841e741b14eacdfdeca2e96fd95af5b987b5b872f88f8e359df29f7635556656;
        d.over18 = 1;
        d.expiry = 1780435560;
        d.nonce = 0xe6de79975a3b30ad89d7af4e44fcdba843df4b70d4b3307e687e5498bbe0a25d;
    }
}
