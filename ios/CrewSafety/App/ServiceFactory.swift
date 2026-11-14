import Foundation

/// The single place where placeholder services are swapped for real ones.
/// Only Developer 1 edits this file. When a real type is merged, replace the matching line:
///   muse (live)  -> RemoteMuseService(baseURL:)      (Developer 4)
///   muse (demo)  -> DemoMuseService()                (Developer 4)
///   journal      -> OnDeviceJournalAnalyzer()        (Developer 4)
///   telemetry    -> SimulatedTelemetryProvider()     (Developer 5)
@MainActor
enum ServiceFactory {
    static func makeServices(settings: AppSettings) -> AppServices {
        AppServices(muse: makeMuse(settings: settings),
                    journalAnalyzer: PlaceholderJournalAnalyzer(),
                    telemetry: PlaceholderTelemetryProvider())
    }

    static func makeMuse(settings: AppSettings) -> any MuseService {
        switch settings.museMode {
        case .live: PlaceholderMuseService()
        case .demo: PlaceholderMuseService()
        }
    }
}
