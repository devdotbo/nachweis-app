import Foundation
import SwiftUI

/// One run: bridge session, relay request, wallet response, decrypt, prove,
/// submit. Everything that touches the network or the prover is async; the
/// decrypted presentation stays in memory and is never logged or persisted.
@MainActor
final class FlowModel: ObservableObject {
    enum Step: Int, CaseIterable { case session, waiting, pickup, prove, submit }

    // Configuration (Session screen)
    @Published var bridgeURL = UserDefaults.standard.string(forKey: "bridgeURL") ?? "http://localhost:8787"
    @Published var verifierURL = UserDefaults.standard.string(forKey: "verifierURL") ?? "http://localhost:3000"
    @Published var boundAddress = UserDefaults.standard.string(forKey: "boundAddress") ?? "0xf99edde971f4e9c88715a79ca78963284a2955dc"
    /// SEC1 uncompressed issuer key. Test issuer key by default; a production
    /// build takes it from the pinned issuerKeyHash configuration, not from the
    /// presentation's x5c (the circuit does not check the chain).
    @Published var issuerKeySec1Hex = UserDefaults.standard.string(forKey: "issuerKeySec1Hex") ?? TestVector.issuerKeySec1Hex
    @Published var redirectURI = "nachweis://return"
    @Published var lowMemoryMode = false

    // State
    @Published var step: Step = .session
    @Published var busy = false
    @Published var error: String?
    @Published var log: [String] = []

    @Published var bridgeSessionID: String?
    @Published var challengeHex: String?
    @Published var relay: RelayClient.CreatedRequest?
    @Published var relayStatus = "pending"
    @Published var returnedResponseCode: String?

    @Published var presentationBytes: Int?
    @Published var derived: ProverEngine.Inputs?
    @Published var outcome: ProverEngine.Outcome?
    @Published var bridgeState: String?
    @Published var bridgeDetail: String?
    @Published var txHash: String?
    @Published var isTestVector = false

    private var clientKey: ClientKey?
    private var presentation: String?
    private var pollTask: Task<Void, Never>?

    var keyBacking: String { clientKey?.isSecureEnclave == true ? "Secure Enclave" : "in memory (CryptoKit)" }

    // MARK: session

    func persistConfig() {
        UserDefaults.standard.set(bridgeURL, forKey: "bridgeURL")
        UserDefaults.standard.set(verifierURL, forKey: "verifierURL")
        UserDefaults.standard.set(boundAddress, forKey: "boundAddress")
        UserDefaults.standard.set(issuerKeySec1Hex, forKey: "issuerKeySec1Hex")
    }

    /// Bridge session first (it owns the challenge), then the relay request
    /// with that challenge, so the KB-JWT nonce the wallet signs is the one
    /// the contract will recompute.
    func request() {
        run {
            self.persistConfig()
            guard let bridge = URL(string: self.bridgeURL), let verifier = URL(string: self.verifierURL) else { throw Fail("bad URL") }
            let s = try await BridgeClient(baseURL: bridge).createSession(boundAddress: self.boundAddress)
            guard let ch = s.challenge_hex else { throw Fail("bridge session has no challenge_hex") }
            self.bridgeSessionID = s.session_id
            self.challengeHex = ch
            self.note("bridge session \(s.session_id.prefix(8)), challenge \(ch.prefix(10))…")
            let key = ClientKey()
            self.clientKey = key
            self.note("client key: \(self.keyBacking)")
            let r = try await RelayClient(baseURL: verifier).createRequest(clientJWK: key.publicJWK, boundAddress: self.boundAddress, challengeHex: ch, redirectURI: self.redirectURI)
            guard r.nonce.lowercased() == (s.nonce ?? "").lowercased() else { throw Fail("relay nonce \(r.nonce) != bridge nonce \(s.nonce ?? "nil")") }
            self.relay = r
            self.relayStatus = "pending"
            self.step = .waiting
            self.startPolling()
        }
    }

    // MARK: waiting

    func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, let r = self.relay, let v = URL(string: self.verifierURL) else { return }
                if let st = try? await RelayClient(baseURL: v).status(sessionID: r.session_id) {
                    self.relayStatus = st
                    if st == "responded" || st == "picked_up" { self.step = .pickup; return }
                }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    func openInWallet() {
        guard let r = relay, let url = URL(string: r.openid4vp_uri) else { return }
        UIApplication.shared.open(url) { ok in
            Task { @MainActor in self.note(ok ? "opened openid4vp:// URI" : "no wallet handles openid4vp:// on this device") }
        }
    }

    /// nachweis://return?response_code=... from the wallet (same-device).
    func handleReturn(url: URL) {
        let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "response_code" }?.value
        returnedResponseCode = code
        if let expected = relay?.response_code, let code, code != expected {
            note("response_code mismatch: got \(code.prefix(8)), expected \(expected.prefix(8))")
        } else {
            note("wallet returned via \(url.scheme ?? "")://; picking up")
        }
        if step == .waiting { step = .pickup }
    }

    // MARK: pickup

    func pickup() {
        run {
            guard let r = self.relay, let key = self.clientKey, let v = URL(string: self.verifierURL) else { throw Fail("no relay session") }
            let p = try await RelayClient(baseURL: v).pickup(sessionID: r.session_id, token: r.pickup_token)
            self.note("JWE picked up, \(p.jwe.utf8.count) bytes, received_at \(p.received_at)")
            let plain = try JWEDecryptor.decrypt(compact: p.jwe, key: key)
            let pres = try Self.extractPresentation(from: plain)
            self.presentation = pres
            self.presentationBytes = pres.utf8.count
            self.note("presentation received, \(pres.utf8.count) bytes")
            self.pollTask?.cancel()
            self.step = .prove
        }
    }

    /// `{ vp_token: { <query id>: [<sd-jwt+kb>] } }` (OpenID4VP 1.0 with DCQL);
    /// also accepts a bare string or an array.
    static func extractPresentation(from plaintext: Data) throws -> String {
        let obj = try JSONSerialization.jsonObject(with: plaintext)
        guard let dict = obj as? [String: Any], let vp = dict["vp_token"] else { throw Fail("decrypted response has no vp_token") }
        func first(_ v: Any) -> String? {
            if let s = v as? String { return s }
            if let a = v as? [Any] { return a.lazy.compactMap(first).first }
            if let d = v as? [String: Any] { return d.values.lazy.compactMap(first).first }
            return nil
        }
        guard let s = first(vp), s.contains("~") else { throw Fail("vp_token holds no SD-JWT presentation") }
        return s
    }

    // MARK: test vector

    /// Runs Prove and Submit from the bundled test presentation without a
    /// wallet. Uses the fixture's challenge, so the bridge session (if any)
    /// must be created with that challenge; here we only prove and verify.
    func loadTestPresentation() {
        run {
            let tv = try TestVector.load()
            self.isTestVector = true
            self.boundAddress = tv.boundAddressHex
            self.issuerKeySec1Hex = tv.issuerKeySec1Hex
            self.challengeHex = tv.challengeHex
            self.presentation = tv.presentation
            self.presentationBytes = tv.presentation.utf8.count
            self.note("test presentation loaded, \(tv.presentation.utf8.count) bytes (prover-sp1/fixtures/input.json)")
            self.step = .prove
        }
    }

    // MARK: prove

    func derive() {
        run {
            guard let pres = self.presentation, let ch = self.challengeHex else { throw Fail("no presentation") }
            let d = try ProverEngine.deriveInputs(presentation: pres, issuerKeySec1Hex: self.issuerKeySec1Hex, boundAddressHex: self.boundAddress, challengeHex: ch)
            self.derived = d
            self.note("inputs derived: \(d.witness.count) witness values, nonce \(d.nonce.prefix(12))…, expiry \(d.expiry)")
        }
    }

    func prove() {
        run {
            if self.derived == nil {
                guard let pres = self.presentation, let ch = self.challengeHex else { throw Fail("no presentation") }
                self.derived = try ProverEngine.deriveInputs(presentation: pres, issuerKeySec1Hex: self.issuerKeySec1Hex, boundAddressHex: self.boundAddress, challengeHex: ch)
            }
            let inputs = self.derived!
            let low = self.lowMemoryMode
            self.note("proving (keccak transcript, ZK), low memory \(low)…")
            let o = try await Task.detached(priority: .userInitiated) { try ProverEngine.prove(inputs: inputs, lowMemory: low) }.value
            self.outcome = o
            self.writeProofFiles(o)
            self.note("proof \(o.proof.count) B, \(o.publicInputs.count) public inputs, execute \(o.executeMs) ms, prove \(o.proveMs) ms, total \(o.totalMs) ms, peak footprint \(o.peakFootprintBytes / 1_000_000) MB, local verify \(o.verifiedLocally)")
        }
    }

    /// Documents/proof and Documents/public_inputs, the two files `bb verify`
    /// takes (`prover-ios/scripts/verify-desktop.sh`). On the simulator:
    /// `xcrun simctl get_app_container booted io.nachweis.prover data`.
    private func writeProofFiles(_ o: ProverEngine.Outcome) {
        guard let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        try? o.proof.write(to: dir.appendingPathComponent("proof"))
        try? o.publicInputs.reduce(Data(), +).write(to: dir.appendingPathComponent("public_inputs"))
        let summary = "proof_bytes=\(o.proof.count)\npublic_inputs=\(o.publicInputs.count)\nexecute_ms=\(o.executeMs)\nprove_ms=\(o.proveMs)\ntotal_ms=\(o.totalMs)\npeak_footprint_bytes=\(o.peakFootprintBytes)\nverified_locally=\(o.verifiedLocally)\n"
        try? summary.write(to: dir.appendingPathComponent("prove-summary.txt"), atomically: true, encoding: .utf8)
    }

    /// `--autoprove` launch argument: load the test vector and prove, no taps.
    func autoproveIfRequested() {
        guard ProcessInfo.processInfo.arguments.contains("--autoprove"), step == .session else { return }
        run {
            let tv = try TestVector.load()
            self.isTestVector = true
            self.boundAddress = tv.boundAddressHex; self.issuerKeySec1Hex = tv.issuerKeySec1Hex
            self.challengeHex = tv.challengeHex; self.presentation = tv.presentation
            self.presentationBytes = tv.presentation.utf8.count
            self.step = .prove
            self.note("autoprove: test presentation loaded")
        }
        Task { @MainActor in
            while self.busy { try? await Task.sleep(for: .milliseconds(100)) }
            self.prove()
        }
    }

    // MARK: submit

    func submit() {
        run {
            guard let o = self.outcome, let bridge = URL(string: self.bridgeURL) else { throw Fail("no proof") }
            let client = BridgeClient(baseURL: bridge)
            var id = self.bridgeSessionID
            if id == nil {
                // Test vector path: a fresh bridge session cannot carry the
                // fixture's challenge (the bridge picks it), so the bridge
                // will reject the nonce. We still submit to exercise the
                // endpoint and show the bridge's answer.
                let s = try await client.createSession(boundAddress: self.boundAddress)
                id = s.session_id
                self.bridgeSessionID = id
                self.note("bridge session \(s.session_id.prefix(8)) (test vector: nonce will not match this session)")
            }
            let s = try await client.submitNoirProof(sessionID: id!, proof: o.proof, publicInputs: o.publicInputs)
            self.bridgeState = s.state; self.bridgeDetail = s.detail; self.txHash = s.tx_hash
            self.note("submitted: state \(s.state ?? "?") \(s.detail ?? "")")
            self.step = .submit
            self.pollBridge()
        }
    }

    func pollBridge() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            for _ in 0..<150 {
                if Task.isCancelled { return }
                guard let self, let id = self.bridgeSessionID, let b = URL(string: self.bridgeURL) else { return }
                if let s = try? await BridgeClient(baseURL: b).getSession(id: id) {
                    self.bridgeState = s.state; self.bridgeDetail = s.detail; self.txHash = s.tx_hash
                    if s.state == "attested" || s.state == "failed" || s.state == "rejected" { return }
                }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    func reset() {
        pollTask?.cancel()
        step = .session; error = nil; relay = nil; bridgeSessionID = nil; challengeHex = nil
        presentation = nil; presentationBytes = nil; derived = nil; outcome = nil
        bridgeState = nil; bridgeDetail = nil; txHash = nil; clientKey = nil; isTestVector = false
    }

    // MARK: helpers

    struct Fail: Error, LocalizedError { let m: String; init(_ m: String) { self.m = m }; var errorDescription: String? { m } }

    private func note(_ s: String) {
        let ts = DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .medium)
        log.append("\(ts)  \(s)")
    }

    private func run(_ body: @escaping () async throws -> Void) {
        guard !busy else { return }
        busy = true; error = nil
        Task {
            do { try await body() } catch { self.error = error.localizedDescription; self.note("error: \(error.localizedDescription)") }
            self.busy = false
        }
    }
}

/// prover-sp1/fixtures/input.json, bundled as test_input.json.
struct TestVector: Decodable {
    let presentation: String
    let issuer_key_sec1_hex: String
    let bound_address_hex: String
    let challenge_hex: String

    var issuerKeySec1Hex: String { issuer_key_sec1_hex }
    var boundAddressHex: String { bound_address_hex }
    var challengeHex: String { challenge_hex }

    static let issuerKeySec1Hex = (try? load().issuer_key_sec1_hex) ?? ""

    static func load() throws -> TestVector {
        guard let p = Bundle.main.url(forResource: "test_input", withExtension: "json") else { throw FlowModel.Fail("test_input.json not bundled") }
        return try JSONDecoder().decode(TestVector.self, from: Data(contentsOf: p))
    }
}
