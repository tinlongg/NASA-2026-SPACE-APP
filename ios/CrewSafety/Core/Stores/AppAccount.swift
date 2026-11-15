import Foundation
import Observation
import WebKit

/// App-wide identity verified by the same server session used in Mission.
@Observable @MainActor
final class AppAccount: NSObject, WKHTTPCookieStoreObserver {
    var username: String?
    var isAdmin = false
    private var baseURL = ""
    private var observing = false
    private var revision = 0

    func track(baseURL: String) async {
        self.baseURL = baseURL
        if !observing {
            WKWebsiteDataStore.default().httpCookieStore.add(self)
            observing = true
        }
        await refresh()
    }

    nonisolated func cookiesDidChange(in cookieStore: WKHTTPCookieStore) {
        Task { @MainActor [weak self] in await self?.refresh() }
    }

    private func refresh() async {
        revision += 1
        let current = revision
        username = nil
        isAdmin = false
        guard var parts = URLComponents(string: baseURL), parts.scheme == "https", let host = parts.host else { return }
        parts.path = "/api/auth/me"; parts.query = nil; parts.fragment = nil
        guard let url = parts.url else { return }
        let cookies: [HTTPCookie] = await withCheckedContinuation { continuation in
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { continuation.resume(returning: $0) }
        }
        let session = cookies.filter { $0.name == "cs_session" && $0.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")) == host && ($0.expiresDate ?? .distantFuture) > Date() }
        guard !session.isEmpty else { return }
        var request = URLRequest(url: url)
        request.allHTTPHeaderFields = HTTPCookie.requestHeaderFields(with: session)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 15
        let client = URLSession(configuration: .ephemeral)
        defer { client.finishTasksAndInvalidate() }
        do {
            let (data, response) = try await client.data(for: request)
            guard current == revision, (response as? HTTPURLResponse)?.statusCode == 200 else { return }
            struct Identity: Decodable { struct User: Decodable { let username: String; let role: String? }; let user: User? }
            let identity = try JSONDecoder().decode(Identity.self, from: data)
            username = identity.user?.username
            isAdmin = identity.user?.role == "admin"
        } catch { /* Failed verification never grants an admin role. */ }
    }
}
