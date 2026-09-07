// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {stdJson} from "forge-std/StdJson.sol";

/// @notice Loads prover-sp1/fixtures/calldata-groth16.json (SP1 6.1.0 Groth16 proof of the synthetic
///         over-18 PID vector). Shared by the unit and the fork tests.
library Sp1Fixture {
    using stdJson for string;

    struct Data {
        bytes32 vkey;
        bytes publicValues;
        bytes proof;
        bytes32 issuerKeyHash;
        bytes32 vctHash;
        uint8 over18;
        address subject;
        uint64 expiry;
        bytes32 nonce;
    }

    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function load() internal view returns (Data memory d) {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/../prover-sp1/fixtures/calldata-groth16.json"));
        d.vkey = json.readBytes32(".vkey");
        d.publicValues = json.readBytes(".publicValues");
        d.proof = json.readBytes(".proof");
        d.issuerKeyHash = json.readBytes32(".decoded.issuerKeyHash");
        d.vctHash = json.readBytes32(".decoded.vctHash");
        d.over18 = uint8(json.readUint(".decoded.over18"));
        d.subject = json.readAddress(".decoded.subject");
        d.expiry = uint64(json.readUint(".decoded.expiry"));
        d.nonce = json.readBytes32(".decoded.nonce");
    }
}
