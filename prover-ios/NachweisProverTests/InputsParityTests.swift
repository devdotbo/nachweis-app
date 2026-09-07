import XCTest
@testable import NachweisProver

/// The Rust core's input derivation must match circuits/tools/gen-prover.ts:
/// Prover.toml here is the committed output of that tool for the test vector.
final class InputsParityTests: XCTestCase {
    func testDerivedInputsMatchGenProverToml() throws {
        let tv = try TestVector.load()
        let d = try ProverEngine.deriveInputs(presentation: tv.presentation, issuerKeySec1Hex: tv.issuerKeySec1Hex, boundAddressHex: tv.boundAddressHex, challengeHex: tv.challengeHex)
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "Prover", withExtension: "toml"))
        let expected = try String(contentsOf: url, encoding: .utf8)
        let body = expected.split(separator: "\n", omittingEmptySubsequences: false).dropFirst().joined(separator: "\n")
        XCTAssertEqual(d.proverToml, body)
        XCTAssertEqual(d.witness.count, 4281)
        XCTAssertEqual(d.nonce, "0x306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762")
        XCTAssertEqual(d.issuerKeyHash, "0x78cf23963b47d3e393c79ea091c4ed80ebbae4ff78992058dd92fd34e1635183")
        XCTAssertEqual(d.expiry, 1_819_756_800)
        XCTAssertEqual(d.publicInputsHex.count, 86)
    }

    func testTamperedChallengeIsRejected() throws {
        let tv = try TestVector.load()
        XCTAssertThrowsError(try ProverEngine.deriveInputs(presentation: tv.presentation, issuerKeySec1Hex: tv.issuerKeySec1Hex, boundAddressHex: tv.boundAddressHex, challengeHex: "0x" + String(repeating: "00", count: 32)))
    }
}
