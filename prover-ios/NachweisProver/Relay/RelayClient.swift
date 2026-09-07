import Foundation

/// The verifier's blind relay (nachweis-verifier-relay docs/blind-relay.md).
struct RelayClient {
    let baseURL: URL

    struct CreatedRequest: Decodable {
        let session_id: String
        let request_uri: String
        let openid4vp_uri: String
        let nonce: String
        let bound_address: String
        let pickup_url: String
        let pickup_token: String
        let status_url: String
        let response_code: String?
    }

    struct Status: Decodable { let status: String }

    struct Pickup: Decodable {
        let jwe: String
        let nonce: String
        let bound_address: String
        let received_at: Int64
    }

    /// POST /relay/request. `challengeHex` is the 32-byte challenge the bridge
    /// session was created with (nonce = sha256(address20 || challenge)).
    func createRequest(clientJWK: [String: String], boundAddress: String, challengeHex: String, redirectURI: String?) async throws -> CreatedRequest {
        var body: [String: Any] = [
            "client_jwk": clientJWK,
            "bound_address": boundAddress,
            "challenge": challengeHex.hasPrefix("0x") ? challengeHex : "0x" + challengeHex,
        ]
        if let r = redirectURI, !r.isEmpty { body["redirect_uri"] = r }
        return try await HTTP.postJSON(baseURL.appendingPathComponent("relay/request"), body: body)
    }

    func status(sessionID: String) async throws -> String {
        let s: Status = try await HTTP.getJSON(baseURL.appendingPathComponent("relay/status/\(sessionID)"))
        return s.status
    }

    /// One-time pickup with the token; the relay drops the JWE afterwards.
    func pickup(sessionID: String, token: String) async throws -> Pickup {
        try await HTTP.getJSON(baseURL.appendingPathComponent("relay/response/\(sessionID)"), headers: ["X-Pickup-Token": token])
    }
}

enum HTTP {
    struct Error: Swift.Error, LocalizedError {
        let status: Int
        let body: String
        var errorDescription: String? { "HTTP \(status): \(body.prefix(300))" }
    }

    static func postJSON<T: Decodable>(_ url: URL, body: [String: Any], headers: [String: String] = [:]) async throws -> T {
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try await send(req)
    }

    static func getJSON<T: Decodable>(_ url: URL, headers: [String: String] = [:]) async throws -> T {
        var req = URLRequest(url: url)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        return try await send(req)
    }

    private static func send<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, resp) = try await URLSession.shared.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw Error(status: status, body: String(decoding: data, as: UTF8.self)) }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
