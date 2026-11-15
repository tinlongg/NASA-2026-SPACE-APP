import Foundation

enum AppConfig {
    /// Default MUSE backend URL, read from the `MUSE_BASE_URL` key in ios/CrewSafety-Info.plist.
    static var museBaseURL: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "MUSE_BASE_URL") as? String else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : URL(string: trimmed)
    }

    /// Relay the browser web camera connects through (`node webcam/server.js`). The Simulator reaches the
    /// Mac at localhost; a physical iPhone needs the Mac's LAN address in the `WEBCAM_URL` Info.plist key.
    static var webCameraURL: URL {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "WEBCAM_URL") as? String,
           let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)), url.scheme != nil {
            return url
        }
        return URL(string: "ws://localhost:8765/ws/app")!
    }
}
