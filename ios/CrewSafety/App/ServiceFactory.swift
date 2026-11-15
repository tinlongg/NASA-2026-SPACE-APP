import Foundation
import HealthKit

/// The single place where services are chosen. Only Developer 1 edits this file.
@MainActor
enum ServiceFactory {
    static func makeServices(settings: AppSettings) -> AppServices {
        // Real heart rate from the Apple Watch and HealthKit where available; simulated otherwise.
        guard HKHealthStore.isHealthDataAvailable() else {
            return AppServices(journalAnalyzer: OnDeviceJournalAnalyzer(), telemetry: SimulatedTelemetryProvider())
        }
        let telemetry = HealthKitTelemetryProvider()
        WatchLink.shared.onHeartRate = { bpm, at, activity in telemetry.record(bpm: bpm, at: at, activity: activity) }
        return AppServices(journalAnalyzer: OnDeviceJournalAnalyzer(), telemetry: telemetry)
    }

}
