import CryptoKit
import XCTest
@testable import NachweisProver

final class JWETests: XCTestCase {
    /// RFC 7518 Appendix C: ECDH-ES Concat KDF known answer (A128GCM, apu Alice, apv Bob).
    func testConcatKDFKnownAnswer() {
        let z = Data([158, 86, 217, 29, 129, 113, 53, 211, 114, 131, 66, 131, 191, 132, 38, 156, 251, 49, 110, 163, 218, 128, 106, 72, 246, 218, 167, 121, 140, 254, 144, 196])
        let key = JWEDecryptor.concatKDF(z: z, algorithmID: "A128GCM", apu: Data("Alice".utf8), apv: Data("Bob".utf8), keyBits: 128)
        XCTAssertEqual(key.base64URLEncoded(), "VqqN6vgjbSBcIijNcacQGg")
    }

    /// Encrypt to the client key the way a wallet does (fresh epk, ECDH-ES
    /// direct, A128GCM, AAD = protected header) and decrypt it back.
    func testRoundTripWithSoftwareKey() throws {
        let client = ClientKey(preferSecureEnclave: false)
        let epk = P256.KeyAgreement.PrivateKey()
        let header: [String: Any] = [
            "alg": "ECDH-ES", "enc": "A128GCM", "apu": Data("wallet".utf8).base64URLEncoded(), "apv": Data("verifier".utf8).base64URLEncoded(),
            "epk": ["kty": "EC", "crv": "P-256", "x": epk.publicKey.rawRepresentation.prefix(32).base64URLEncoded(), "y": epk.publicKey.rawRepresentation.suffix(32).base64URLEncoded()],
        ]
        let headerB64 = try JSONSerialization.data(withJSONObject: header).base64URLEncoded()
        let z = try epk.sharedSecretFromKeyAgreement(with: client.publicKey)
        let cek = z.withUnsafeBytes { JWEDecryptor.concatKDF(z: Data($0), algorithmID: "A128GCM", apu: Data("wallet".utf8), apv: Data("verifier".utf8), keyBits: 128) }
        let plaintext = Data(#"{"vp_token":{"pid":["a.b.c~d~e.f.g"]}}"#.utf8)
        let nonce = AES.GCM.Nonce()
        let box = try AES.GCM.seal(plaintext, using: SymmetricKey(data: cek), nonce: nonce, authenticating: Data(headerB64.utf8))
        let compact = [headerB64, "", Data(nonce).base64URLEncoded(), box.ciphertext.base64URLEncoded(), box.tag.base64URLEncoded()].joined(separator: ".")

        let out = try JWEDecryptor.decrypt(compact: compact, key: client)
        XCTAssertEqual(out, plaintext)
        XCTAssertEqual(try FlowModel.extractPresentation(from: out), "a.b.c~d~e.f.g")
    }

    func testPublicJWKShape() {
        let jwk = ClientKey(preferSecureEnclave: false).publicJWK
        XCTAssertEqual(jwk["kty"], "EC"); XCTAssertEqual(jwk["crv"], "P-256"); XCTAssertEqual(jwk["alg"], "ECDH-ES"); XCTAssertEqual(jwk["use"], "enc")
        XCTAssertEqual(Data(base64URL: jwk["x"]!)?.count, 32)
    }
}
