import Foundation

/// The single place where services are chosen. Only Developer 1 edits this file.
@MainActor
enum ServiceFactory {
    static func makeServices(settings: AppSettings) -> AppServices {
        AppServices(muse: makeMuse(settings: settings),
                    journalAnalyzer: OnDeviceJournalAnalyzer(),
                    telemetry: SimulatedTelemetryProvider())
    }

    static func makeMuse(settings: AppSettings) -> any MuseService {
        switch settings.museMode {
        case .demo:
            return DemoMuseService()
        case .live:
            // Without an address there is nothing to call; the placeholder reports "unavailable".
            guard let url = settings.museBaseURL else { return PlaceholderMuseService() }
            return RemoteMuseService(baseURL: url)
        }
    }
}
