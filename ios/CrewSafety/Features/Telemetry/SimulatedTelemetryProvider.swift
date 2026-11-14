import Foundation

/// Generates plausible-looking but entirely made-up heart-rate and activity values.
/// Deterministic: the same crew member and time always give the same value.
struct SimulatedTelemetryProvider: TelemetryProviding {
    static let step: TimeInterval = 10
    static let heartRateBand: ClosedRange<Double> = 55...95

    func samples(for crewMemberID: UUID, last interval: TimeInterval, now: Date) -> [TelemetrySample] {
        let seed = Self.seed(crewMemberID)
        let end = (now.timeIntervalSince1970 / Self.step).rounded(.down) * Self.step
        let count = max(0, Int(interval / Self.step))
        return (0..<count).map { i in
            let t = end - Double(count - 1 - i) * Self.step
            return TelemetrySample(id: UUID(), crewMemberID: crewMemberID,
                                   timestamp: Date(timeIntervalSince1970: t),
                                   heartRateBPM: Self.heartRate(at: t, seed: seed),
                                   activityLevel: Self.activity(at: t, seed: seed),
                                   source: .simulated)
        }
    }

    static func seed(_ id: UUID) -> Double {
        let u = id.uuid
        let bytes = [u.0, u.1, u.2, u.3, u.4, u.5, u.6, u.7, u.8, u.9, u.10, u.11, u.12, u.13, u.14, u.15]
        return Double(bytes.reduce(0) { ($0 &* 31 &+ Int($1)) % 10_007 })
    }

    static func heartRate(at t: TimeInterval, seed: Double) -> Double {
        let base = 66 + seed.truncatingRemainder(dividingBy: 9)
        let slow = 6 * sin(t / 600 + seed)
        let fast = 3 * sin(t / 97 + seed * 2)
        let jitter = 2 * sin(t * 12.9898 + seed * 78.233)
        let value = base + slow + fast + jitter
        return min(heartRateBand.upperBound, max(heartRateBand.lowerBound, (value * 10).rounded() / 10))
    }

    static func activity(at t: TimeInterval, seed: Double) -> Double {
        min(1, max(0, 0.3 + 0.2 * sin(t / 420 + seed * 3)))
    }
}
