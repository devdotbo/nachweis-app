import SwiftUI

struct ContentView: View {
    @EnvironmentObject var flow: FlowModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    StepBar(current: flow.step)
                    if let e = flow.error {
                        Text(e).font(.footnote).foregroundStyle(.red).textSelection(.enabled)
                    }
                    switch flow.step {
                    case .session: SessionView()
                    case .waiting: WaitingView()
                    case .pickup: PickupView()
                    case .prove: ProveView()
                    case .submit: SubmitView()
                    }
                    LogView()
                }
                .padding()
            }
            .navigationTitle("Nachweis Prover")
            .onAppear { flow.autoproveIfRequested() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Reset") { flow.reset() }.disabled(flow.busy)
                }
            }
            .overlay { if flow.busy { ProgressView().controlSize(.large).padding(24).background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12)) } }
        }
    }
}

struct StepBar: View {
    let current: FlowModel.Step
    var body: some View {
        HStack(spacing: 6) {
            ForEach(FlowModel.Step.allCases, id: \.rawValue) { s in
                Text(label(s))
                    .font(.caption2.weight(s == current ? .bold : .regular))
                    .padding(.vertical, 4).padding(.horizontal, 8)
                    .background(s == current ? Color.accentColor.opacity(0.2) : Color.secondary.opacity(0.1), in: Capsule())
            }
        }
    }
    func label(_ s: FlowModel.Step) -> String {
        switch s { case .session: "Session"; case .waiting: "Waiting"; case .pickup: "Pickup"; case .prove: "Prove"; case .submit: "Submit" }
    }
}

struct LogView: View {
    @EnvironmentObject var flow: FlowModel
    var body: some View {
        if !flow.log.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text("Log").font(.headline)
                ForEach(Array(flow.log.enumerated()), id: \.offset) { _, l in
                    Text(l).font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
                }
            }
        }
    }
}

struct SessionView: View {
    @EnvironmentObject var flow: FlowModel
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Session").font(.title2.bold())
            Group {
                LabeledField("Bridge URL", text: $flow.bridgeURL)
                LabeledField("Verifier (relay) URL", text: $flow.verifierURL)
                LabeledField("Bound address", text: $flow.boundAddress)
                LabeledField("Issuer key (SEC1 hex)", text: $flow.issuerKeySec1Hex)
                LabeledField("Redirect URI (same device)", text: $flow.redirectURI)
            }
            Toggle("bb low-memory mode", isOn: $flow.lowMemoryMode)
            Button { flow.request() } label: { Label("Request", systemImage: "qrcode") }
                .buttonStyle(.borderedProminent).disabled(flow.busy)
            Text("Creates a bridge session (it picks the challenge), generates a P-256 key (Secure Enclave when available) and posts the relay request with the public JWK. The verifier never sees the presentation.")
                .font(.footnote).foregroundStyle(.secondary)
            Divider()
            Button { flow.loadTestPresentation() } label: { Label("Load test presentation", systemImage: "doc.text") }
                .buttonStyle(.bordered).disabled(flow.busy)
            Text("Runs Prove and Submit on the bundled synthetic PID presentation (prover-sp1/fixtures/input.json) without a wallet.")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }
}

struct LabeledField: View {
    let label: String
    @Binding var text: String
    init(_ label: String, text: Binding<String>) { self.label = label; _text = text }
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            TextField(label, text: $text).textFieldStyle(.roundedBorder).font(.system(size: 13, design: .monospaced))
                .autocorrectionDisabled().textInputAutocapitalization(.never)
        }
    }
}

struct WaitingView: View {
    @EnvironmentObject var flow: FlowModel
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Waiting for the wallet").font(.title2.bold())
            if let r = flow.relay {
                if let img = QRCode.image(from: r.openid4vp_uri) {
                    Image(uiImage: img).interpolation(.none).resizable().scaledToFit().frame(maxWidth: 260).frame(maxWidth: .infinity)
                }
                Text("Scan with the wallet on a second phone, or open it here.").font(.footnote).foregroundStyle(.secondary)
                Button { flow.openInWallet() } label: { Label("Open in wallet (same device)", systemImage: "wallet.pass") }
                    .buttonStyle(.borderedProminent)
                Text("relay status: \(flow.relayStatus)").font(.system(.footnote, design: .monospaced))
                Text("session \(r.session_id)\nnonce \(r.nonce)\nkey \(flow.keyBacking)").font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
                Button("Check now / pick up") { flow.step = .pickup }.buttonStyle(.bordered)
            }
        }
    }
}

struct PickupView: View {
    @EnvironmentObject var flow: FlowModel
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Pickup").font(.title2.bold())
            Text("Fetches the JWE once with the pickup token and decrypts it with the client key (ECDH-ES, A128GCM). Only the byte count is shown; the presentation stays in memory.")
                .font(.footnote).foregroundStyle(.secondary)
            if let c = flow.returnedResponseCode { Text("response_code from wallet: \(c.prefix(12))…").font(.footnote) }
            Button { flow.pickup() } label: { Label("Pick up and decrypt", systemImage: "lock.open") }
                .buttonStyle(.borderedProminent).disabled(flow.busy)
        }
    }
}

struct ProveView: View {
    @EnvironmentObject var flow: FlowModel
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Prove").font(.title2.bold())
            if let n = flow.presentationBytes { Text("presentation received, \(n) bytes\(flow.isTestVector ? " (test vector)" : "")").font(.callout) }
            HStack {
                Button("Derive inputs") { flow.derive() }.buttonStyle(.bordered).disabled(flow.busy)
                Button { flow.prove() } label: { Label("Prove", systemImage: "cpu") }.buttonStyle(.borderedProminent).disabled(flow.busy)
            }
            if let d = flow.derived {
                Text("public outputs\n issuer_key_hash \(d.issuerKeyHash)\n over18 \(d.over18)  expiry \(d.expiry)\n nonce \(d.nonce)\n subject \(d.subject)")
                    .font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
            }
            if let o = flow.outcome {
                VStack(alignment: .leading, spacing: 4) {
                    Text("proof \(o.proof.count) bytes, \(o.publicInputs.count) public inputs").bold()
                    Text("witness \(o.executeMs) ms, bb prove \(o.proveMs) ms, total \(Double(o.totalMs) / 1000, specifier: "%.1f") s")
                    Text("peak memory footprint \(Double(o.peakFootprintBytes) / 1_000_000, specifier: "%.0f") MB")
                    Text("local verify: \(o.verifiedLocally ? "ok" : "FAILED")").foregroundStyle(o.verifiedLocally ? .green : .red)
                    Text("proof sha256 \(o.proof.sha256Hex.prefix(16))…").font(.system(size: 11, design: .monospaced))
                }.font(.callout)
                Button { flow.submit() } label: { Label("Submit to bridge", systemImage: "paperplane") }.buttonStyle(.borderedProminent).disabled(flow.busy)
                ShareLink(item: o.proof.hexString, subject: Text("proof_hex")) { Label("Share proof hex", systemImage: "square.and.arrow.up") }.buttonStyle(.bordered)
            }
        }
    }
}

struct SubmitView: View {
    @EnvironmentObject var flow: FlowModel
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Submit").font(.title2.bold())
            Text("bridge session \(flow.bridgeSessionID ?? "-")").font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
            Text("state: \(flow.bridgeState ?? "?")").font(.title3)
            if let d = flow.bridgeDetail { Text(d).font(.footnote) }
            if let tx = flow.txHash { Text("tx \(tx)").font(.system(size: 11, design: .monospaced)).textSelection(.enabled) }
            if flow.bridgeState == "attested" { Label("attested", systemImage: "checkmark.seal.fill").foregroundStyle(.green) }
            Button("Refresh") { flow.pollBridge() }.buttonStyle(.bordered)
        }
    }
}

import CoreImage.CIFilterBuiltins
import CryptoKit

enum QRCode {
    static func image(from s: String) -> UIImage? {
        let f = CIFilter.qrCodeGenerator()
        f.message = Data(s.utf8)
        f.correctionLevel = "M"
        guard let out = f.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)),
              let cg = CIContext().createCGImage(out, from: out.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

extension Data {
    var sha256Hex: String { Data(SHA256.hash(data: self)).hexString }
}
