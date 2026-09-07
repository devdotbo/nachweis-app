import SwiftUI

@main
struct NachweisProverApp: App {
    @StateObject private var flow = FlowModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(flow)
                // Same-device flow: the wallet opens redirect_uri
                // nachweis://return?response_code=... after posting the JWE.
                .onOpenURL { url in flow.handleReturn(url: url) }
        }
    }
}
