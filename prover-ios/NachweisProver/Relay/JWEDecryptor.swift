import CryptoKit
import Foundation

/// JWE compact serialization, `alg: ECDH-ES` (direct key agreement),
/// `enc: A128GCM` (RFC 7516, RFC 7518 section 4.6). This is what the EUDI
/// wallets send for `direct_post.jwt`; the relay stores it unopened.
enum JWEDecryptor {
    struct Header: Decodable {
        struct EPK: Decodable { let kty: String; let crv: String; let x: String; let y: String }
        let alg: String
        let enc: String
        let epk: EPK
        let apu: String?
        let apv: String?
    }

    enum Error: Swift.Error, LocalizedError {
        case format(String)
        var errorDescription: String? { if case .format(let m) = self { return "JWE: \(m)" }; return nil }
    }

    static func decrypt(compact: String, key: ClientKey) throws -> Data {
        let parts = compact.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 5 else { throw Error.format("expected 5 parts, got \(parts.count)") }
        guard let headerRaw = Data(base64URL: parts[0]) else { throw Error.format("header base64url") }
        let header = try JSONDecoder().decode(Header.self, from: headerRaw)
        guard header.alg == "ECDH-ES" else { throw Error.format("alg \(header.alg), expected ECDH-ES") }
        guard header.enc == "A128GCM" else { throw Error.format("enc \(header.enc), expected A128GCM") }
        guard parts[1].isEmpty else { throw Error.format("ECDH-ES has an empty encrypted key") }
        guard header.epk.kty == "EC", header.epk.crv == "P-256",
              let x = Data(base64URL: header.epk.x), let y = Data(base64URL: header.epk.y),
              x.count == 32, y.count == 32 else { throw Error.format("epk is not a P-256 point") }
        let epk = try P256.KeyAgreement.PublicKey(rawRepresentation: x + y)
        guard let iv = Data(base64URL: parts[2]), iv.count == 12 else { throw Error.format("iv") }
        guard let ct = Data(base64URL: parts[3]) else { throw Error.format("ciphertext") }
        guard let tag = Data(base64URL: parts[4]), tag.count == 16 else { throw Error.format("tag") }

        let z = try key.sharedSecret(with: epk)
        let apu = header.apu.flatMap { Data(base64URL: $0) } ?? Data()
        let apv = header.apv.flatMap { Data(base64URL: $0) } ?? Data()
        let cek = z.withUnsafeBytes { concatKDF(z: Data($0), algorithmID: "A128GCM", apu: apu, apv: apv, keyBits: 128) }

        let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv), ciphertext: ct, tag: tag)
        // AAD is the ASCII of the protected header exactly as transmitted.
        return try AES.GCM.open(box, using: SymmetricKey(data: cek), authenticating: Data(parts[0].utf8))
    }

    /// NIST SP 800-56A Concat KDF with SHA-256 as RFC 7518 section 4.6.2
    /// specifies it: Hash(counter || Z || AlgorithmID || PartyUInfo || PartyVInfo || SuppPubInfo).
    static func concatKDF(z: Data, algorithmID: String, apu: Data, apv: Data, keyBits: UInt32) -> Data {
        func lp(_ d: Data) -> Data { UInt32(d.count).bigEndianData + d }
        var otherInfo = Data()
        otherInfo += lp(Data(algorithmID.utf8))
        otherInfo += lp(apu)
        otherInfo += lp(apv)
        otherInfo += keyBits.bigEndianData
        let rounds = Int((keyBits + 255) / 256)
        var out = Data()
        for i in 1...rounds {
            var h = SHA256()
            h.update(data: UInt32(i).bigEndianData)
            h.update(data: z)
            h.update(data: otherInfo)
            out += Data(h.finalize())
        }
        return out.prefix(Int(keyBits / 8))
    }
}

extension UInt32 {
    var bigEndianData: Data { withUnsafeBytes(of: bigEndian) { Data($0) } }
}
