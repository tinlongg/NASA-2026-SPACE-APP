import Foundation

// MARK: - Service protocols
protocol JournalAnalyzing: Sendable {
    /// Must run fully on-device. Must not produce sentiment scores, risk levels, or diagnoses.
    func summarize(_ body: String) async -> JournalSummary
}

protocol TelemetryProviding: Sendable {
    /// Returns samples ordered oldest -> newest. Simulated providers must set `source = .simulated`.
    func samples(for crewMemberID: UUID, last interval: TimeInterval, now: Date) -> [TelemetrySample]
}

