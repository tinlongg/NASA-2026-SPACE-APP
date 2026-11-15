import SwiftUI
import WebKit

/// Reuses the website's mission and account so rewards have one source of truth.
struct MissionView: View {
    @Environment(AppSettings.self) private var settings
    @State private var failure: String?
    @State private var loading = true
    @State private var attempt = UUID()

    private var missionURL: URL? {
        guard var parts = URLComponents(string: settings.dashboardBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme == "https", parts.host != nil else { return nil }
        parts.path = "/"
        parts.queryItems = [URLQueryItem(name: "mission", value: "1")]
        parts.fragment = nil
        return parts.url
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let url = missionURL {
                    ZStack {
                        MissionBrowser(url: url, loading: $loading, failure: $failure)
                            .id(attempt)
                        if loading { ProgressView("Opening your mission…").padding().background(.regularMaterial) }
                        if let failure {
                            VStack(spacing: 12) {
                                Text(failure)
                                Button("Try again") { self.failure = nil; loading = true; attempt = UUID() }
                            }.padding().background(.regularMaterial)
                        }
                    }
                } else {
                    ContentUnavailableView("Dashboard URL needed", systemImage: "network", description: Text("Set an HTTPS dashboard address in Settings."))
                }
            }.navigationTitle("Pip’s mission").navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct MissionBrowser: UIViewRepresentable {
    let url: URL
    @Binding var loading: Bool
    @Binding var failure: String?

    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.accessibilityLabel = "Astronaut wellness mission"
        view.load(URLRequest(url: url))
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) { context.coordinator.parent = self }
    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.stopLoading()
        view.navigationDelegate = nil
    }
    final class Coordinator: NSObject, WKNavigationDelegate {
        var parent: MissionBrowser
        init(_ parent: MissionBrowser) { self.parent = parent }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { parent.loading = false; parent.failure = nil }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
        private func failed(_ error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            parent.loading = false
            parent.failure = "Could not open the mission. Check your connection and dashboard address."
        }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            if url.host == parent.url.host && url.scheme == "https" {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
                if action.navigationType == .linkActivated && url.scheme == "https" { UIApplication.shared.open(url) }
            }
        }
    }
}
