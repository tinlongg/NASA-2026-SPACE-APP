import Foundation

/// The small slice of the Watch comparison that the wearer can choose to share with the website:
/// five daily averages, their own usual range and the published astronaut range. No ECG, no raw
/// samples, no sentences. Sent only when "Share Watch health summary" is on in Settings.
struct HealthSummary: Encodable, Equatable {
    struct Metric: Encodable, Equatable {
        let key: String
        let value: Double?
        let usualLow: Double?
        let usualHigh: Double?
        let standing: String?
        let astronautLow: Double?
        let astronautHigh: Double?
        let astronautStanding: String?
    }

    /// Unix milliseconds.
    let updatedAt: Double
    let simulated: Bool
    let metrics: [Metric]

    /// Values are rounded the way the card shows them, so the website agrees with the phone.
    static func make(from comparisons: [MetricComparison], simulated: Bool, at date: Date) -> HealthSummary {
        HealthSummary(
            updatedAt: (date.timeIntervalSince1970 * 1000).rounded(),
            simulated: simulated,
            metrics: comparisons.map { item in
                let metric = item.metric
                return Metric(
                    key: metric.rawValue,
                    value: item.value.map(metric.rounded),
                    usualLow: item.usual.map { metric.rounded($0.low) },
                    usualHigh: item.usual.map { metric.rounded($0.high) },
                    standing: item.baselineStanding.map(Self.word),
                    astronautLow: item.reference.map { metric.rounded($0.low) },
                    astronautHigh: item.reference.map { metric.rounded($0.high) },
                    astronautStanding: item.referenceStanding.map(Self.word))
            })
    }

    private static func word(_ standing: Standing) -> String { standing.word.lowercased() }
}
