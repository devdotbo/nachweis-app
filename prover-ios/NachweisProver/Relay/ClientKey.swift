import CryptoKit
import Foundation

/// The client's ephemeral P-256 key the wallet encrypts to. Secure Enclave
/// when the device has one (the private scalar never leaves it; ECDH runs
/// inside), in-memory CryptoKit key otherwise (simulator).
final class ClientKey {
    enum Backing {
        case secureEnclave(SecureEnclave.P256.KeyAgreement.PrivateKey)
        case software(P256.KeyAgreement.PrivateKey)
    }

    let backing: Backing

    init(preferSecureEnclave: Bool = true) {
        if preferSecureEnclave, SecureEnclave.isAvailable,
           let k = try? SecureEnclave.P256.KeyAgreement.PrivateKey() {
            backing = .secureEnclave(k)
        } else {
            backing = .software(P256.KeyAgreement.PrivateKey())
        }
    }

    var isSecureEnclave: Bool {
        if case .secureEnclave = backing { return true }
        return false
    }

    var publicKey: P256.KeyAgreement.PublicKey {
        switch backing {
        case .secureEnclave(let k): return k.publicKey
        case .software(let k): return k.publicKey
        }
    }

    /// `{kty: EC, crv: P-256, x, y, alg: ECDH-ES, use: enc}` as the relay wants it.
    var publicJWK: [String: String] {
        let raw = publicKey.rawRepresentation // x || y, 64 bytes
        return [
            "kty": "EC",
            "crv": "P-256",
            "x": raw.prefix(32).base64URLEncoded(),
            "y": raw.suffix(32).base64URLEncoded(),
            "alg": "ECDH-ES",
            "use": "enc",
        ]
    }

    func sharedSecret(with epk: P256.KeyAgreement.PublicKey) throws -> SharedSecret {
        switch backing {
        case .secureEnclave(let k): return try k.sharedSecretFromKeyAgreement(with: epk)
        case .software(let k): return try k.sharedSecretFromKeyAgreement(with: epk)
        }
    }
}

extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    init?(base64URL s: String) {
        var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b.count % 4 != 0 { b += "=" }
        self.init(base64Encoded: b)
    }

    init?(hex: String) {
        var h = Substring(hex)
        if h.hasPrefix("0x") { h = h.dropFirst(2) }
        guard h.count % 2 == 0 else { return nil }
        var out = Data(capacity: h.count / 2)
        var i = h.startIndex
        while i < h.endIndex {
            let j = h.index(i, offsetBy: 2)
            guard let b = UInt8(h[i..<j], radix: 16) else { return nil }
            out.append(b)
            i = j
        }
        self = out
    }

    var hexString: String { map { String(format: "%02x", $0) }.joined() }

    static func random(count: Int) -> Data {
        var d = Data(count: count)
        _ = d.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }
        return d
    }
}
