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
        XCTAssertEqual(d.witness.count, 6787) // WP13 circuit; count comes from the artifact ABI
        XCTAssertEqual(d.nonce, "0x306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762")
        XCTAssertEqual(d.issuerKeyHash, "0xb52359580c14e2d79d34605740d86338adc6a0868a22ec648d1896187813fd26")
        XCTAssertEqual(d.expiry, 1_819_756_800)
        XCTAssertEqual(d.publicInputsHex.count, 86)
    }

    func testIssuerKeyFromX5cLeaf() throws {
        // Empty override: the core takes the key from the x5c leaf, which for
        // the realistic vector is the signing key.
        let tv = try TestVector.load()
        let d = try ProverEngine.deriveInputs(presentation: tv.presentation, issuerKeySec1Hex: "", boundAddressHex: tv.boundAddressHex, challengeHex: tv.challengeHex)
        XCTAssertEqual(d.issuerKeySec1Hex, tv.issuerKeySec1Hex.replacingOccurrences(of: "0x", with: ""))
        XCTAssertEqual(d.issuerKeyHash, "0xb52359580c14e2d79d34605740d86338adc6a0868a22ec648d1896187813fd26")
    }

    func testWrongAudIsRejected() throws {
        let tv = try TestVector.load()
        XCTAssertThrowsError(try ProverEngine.deriveInputs(presentation: tv.presentation, issuerKeySec1Hex: "", boundAddressHex: tv.boundAddressHex, challengeHex: tv.challengeHex, expectedAud: "https://self-issued.me/v2"))
    }

    func testTamperedChallengeIsRejected() throws {
        let tv = try TestVector.load()
        XCTAssertThrowsError(try ProverEngine.deriveInputs(presentation: tv.presentation, issuerKeySec1Hex: tv.issuerKeySec1Hex, boundAddressHex: tv.boundAddressHex, challengeHex: "0x" + String(repeating: "00", count: 32)))
    }
}
