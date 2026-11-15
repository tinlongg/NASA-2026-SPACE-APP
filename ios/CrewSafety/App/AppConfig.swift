import Foundation

enum AppConfig {
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
