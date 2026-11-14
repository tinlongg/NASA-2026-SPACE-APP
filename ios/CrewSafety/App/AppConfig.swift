import Foundation

enum AppConfig {
    /// Default MUSE backend URL, read from the `MUSE_BASE_URL` key in ios/CrewSafety-Info.plist.
    static var museBaseURL: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "MUSE_BASE_URL") as? String else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : URL(string: trimmed)
    }
}
