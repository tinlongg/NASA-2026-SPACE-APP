import Foundation

/// The single place where services are chosen. Only Developer 1 edits this file.
@MainActor
enum ServiceFactory {
    static func makeServices(settings: AppSettings) -> AppServices {
        AppServices(journalAnalyzer: OnDeviceJournalAnalyzer(),
                    telemetry: SimulatedTelemetryProvider())
    }

}
