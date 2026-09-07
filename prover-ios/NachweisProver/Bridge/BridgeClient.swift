import Foundation

/// The Nachweis bridge (`service/`): session with bound address and
/// challenge, and the proof submission endpoint added on branch wp5-companion
/// (`POST /sessions/:id/noir-proof {proof_hex, public_inputs_hex[]}`).
struct BridgeClient {
    let baseURL: URL

    struct Session: Decodable {
        let session_id: String
        let state: String?
        let detail: String?
        let error: String?
        let nonce: String?
        let bound_address: String?
        let challenge_hex: String?
        let address_verified: Bool?
        let tx_hash: String?
    }

    /// POST /sessions {bound_address}. The bridge picks the 32-byte challenge.
    func createSession(boundAddress: String) async throws -> Session {
        try await HTTP.postJSON(baseURL.appendingPathComponent("sessions"), body: ["bound_address": boundAddress])
    }

    func getSession(id: String) async throws -> Session {
        try await HTTP.getJSON(baseURL.appendingPathComponent("sessions/\(id)"))
    }

    /// The proof bytes as `bb prove -t evm` writes them, the 86 public inputs
    /// as 32-byte hex words. The phone holds no Ethereum key: the bridge (or
    /// the investor's browser via NoirPidVerifier) sends the transaction.
    func submitNoirProof(sessionID: String, proof: Data, publicInputs: [Data]) async throws -> Session {
        try await HTTP.postJSON(baseURL.appendingPathComponent("sessions/\(sessionID)/noir-proof"), body: [
            "proof_hex": "0x" + proof.hexString,
            "public_inputs_hex": publicInputs.map { "0x" + $0.hexString },
        ])
    }
}
