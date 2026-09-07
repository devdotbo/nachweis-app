import Foundation

/// Thin Swift side of prover-mobile-core (uniffi bindings in
/// MoproiOSBindings/mopro.swift): resource paths, timing, memory sampling.
enum ProverEngine {
    struct Outcome {
        let proof: Data
        let publicInputs: [Data]
        let executeMs: UInt64
        let proveMs: UInt64
        let totalMs: UInt64
        let peakFootprintBytes: UInt64
        let verifiedLocally: Bool
    }

    struct Inputs {
        let witness: [String]
        let proverToml: String
        let issuerKeyHash: String
        let over18: UInt8
        let expiry: UInt64
        let nonce: String
        let subject: String
        let issuerKeySec1Hex: String
        let publicInputsHex: [String]
    }

    enum Error: Swift.Error, LocalizedError {
        case missingResource(String)
        var errorDescription: String? { if case .missingResource(let r) = self { return "bundle is missing \(r)" }; return nil }
    }

    static func resource(_ name: String, _ ext: String) throws -> String {
        guard let p = Bundle.main.path(forResource: name, ofType: ext) else { throw Error.missingResource("\(name).\(ext)") }
        return p
    }

    static var circuitPath: String { get throws { try resource("pid_sdjwt", "json") } }
    static var srsPath: String { get throws { try resource("bn254_g1", "dat") } }
    static var vkPath: String { get throws { try resource("vk_keccak", "bin") } }

    /// Same derivation as circuits/tools/gen-prover.ts, done in the Rust core.
    /// Bounds and witness order come from the bundled artifact's ABI, so a
    /// revised circuit is a resource swap (pid_sdjwt.json + vk_keccak.bin).
    /// Empty issuer key: from the x5c leaf. Empty aud: the circuit default.
    static func deriveInputs(presentation: String, issuerKeySec1Hex: String, boundAddressHex: String, challengeHex: String, expectedAud: String = "") throws -> Inputs {
        let d = try NachweisProver.deriveInputs(circuitJsonPath: try circuitPath, presentation: presentation, issuerKeySec1Hex: issuerKeySec1Hex, boundAddressHex: boundAddressHex, challengeHex: challengeHex, expectedAud: expectedAud)
        return Inputs(witness: d.witness, proverToml: d.proverToml, issuerKeyHash: d.issuerKeyHashHex, over18: d.over18, expiry: d.expiry, nonce: d.nonceHex, subject: d.subjectHex, issuerKeySec1Hex: d.issuerKeySec1Hex, publicInputsHex: d.publicInputsHex)
    }

    /// Runs on the calling (background) thread; samples phys_footprint every
    /// 100 ms for the peak. `lowMemory` sets BB_SLOW_LOW_MEMORY in bb.
    static func prove(inputs: Inputs, lowMemory: Bool) throws -> Outcome {
        let circuit = try circuitPath, srs = try srsPath
        let vk = try Data(contentsOf: URL(fileURLWithPath: try vkPath))
        let sampler = MemorySampler(); sampler.start()
        defer { sampler.stop() }
        let t0 = DispatchTime.now()
        let r = try NachweisProver.prove(circuitJsonPath: circuit, srsPath: srs, vk: vk, witness: inputs.witness, onChain: true, lowMemory: lowMemory)
        let total = (DispatchTime.now().uptimeNanoseconds - t0.uptimeNanoseconds) / 1_000_000
        let ok = (try? NachweisProver.verify(proof: r.proof, publicInputs: r.publicInputs, vk: vk, onChain: true)) ?? false
        sampler.stop()
        return Outcome(proof: r.proof, publicInputs: r.publicInputs, executeMs: r.executeMs, proveMs: r.proveMs, totalMs: total,
                       peakFootprintBytes: max(sampler.peak, r.peakRssBytes), verifiedLocally: ok)
    }
}

/// Peak `phys_footprint` of the process, sampled on a timer.
final class MemorySampler {
    private(set) var peak: UInt64 = 0
    private var timer: DispatchSourceTimer?

    static func footprint() -> UInt64 {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let kr = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
        }
        return kr == KERN_SUCCESS ? UInt64(info.phys_footprint) : 0
    }

    func start() {
        peak = Self.footprint()
        let t = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
        t.schedule(deadline: .now(), repeating: .milliseconds(100))
        t.setEventHandler { [weak self] in
            guard let self else { return }
            self.peak = max(self.peak, Self.footprint())
        }
        t.resume()
        timer = t
    }

    func stop() {
        timer?.cancel(); timer = nil
        peak = max(peak, Self.footprint())
    }
}
