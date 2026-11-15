import Foundation
import HealthKit

/// Real heart rate: live samples from the CrewSafety Watch app, plus the last 30 minutes from HealthKit
/// when the Watch is not streaming. Labelled `.healthKit`. With no real samples at all it returns the
/// simulated provider's samples, which stay labelled `.simulated`.
final class HealthKitTelemetryProvider: TelemetryProviding, @unchecked Sendable {
    private struct Point { let at: Date; let bpm: Double; let activity: Double? }

    /// The website accepts at most 200 samples, so samples are thinned to one per bucket.
    static let bucket: TimeInterval = 10

    private let store = HKHealthStore()
    private let lock = NSLock()
    private var live: [Point] = []
    private var stored: [Point] = []
    private var lastQuery = Date.distantPast
    private let fallback = SimulatedTelemetryProvider()

    /// Called by WatchLink for each live heart-rate sample.
    func record(bpm: Double, at: Date, activity: Double?) {
        lock.lock(); defer { lock.unlock() }
        live.append(Point(at: at, bpm: bpm, activity: activity))
        live.removeAll { at.timeIntervalSince($0.at) > 3600 }
    }

    func samples(for crewMemberID: UUID, last interval: TimeInterval, now: Date) -> [TelemetrySample] {
        refreshIfNeeded(now: now)
        lock.lock()
        let from = now.addingTimeInterval(-interval)
        let points = (stored + live).filter { $0.at >= from && $0.at <= now }
        lock.unlock()
        guard !points.isEmpty else { return fallback.samples(for: crewMemberID, last: interval, now: now) }
        return Self.thin(points.map { ($0.at, $0.bpm, $0.activity) }).map {
            TelemetrySample(id: UUID(), crewMemberID: crewMemberID, timestamp: $0.at, heartRateBPM: $0.bpm, activityLevel: $0.activity, source: .healthKit)
        }
    }

    /// Keeps the newest sample in each 10-second bucket, oldest first.
    static func thin(_ points: [(at: Date, bpm: Double, activity: Double?)]) -> [(at: Date, bpm: Double, activity: Double?)] {
        var byBucket: [Int: (at: Date, bpm: Double, activity: Double?)] = [:]
        for point in points {
            let key = Int((point.at.timeIntervalSince1970 / bucket).rounded(.down))
            if let existing = byBucket[key], existing.at >= point.at { continue }
            byBucket[key] = point
        }
        return byBucket.values.sorted { $0.at < $1.at }
    }

    /// Reads the last 30 minutes of heart rate from HealthKit at most every 30 seconds.
    private func refreshIfNeeded(now: Date) {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        lock.lock()
        let due = now.timeIntervalSince(lastQuery) > 30
        if due { lastQuery = now }
        lock.unlock()
        guard due else { return }
        let type = HKQuantityType(.heartRate)
        let predicate = HKQuery.predicateForSamples(withStart: now.addingTimeInterval(-1800), end: now)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 500,
                                  sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { [weak self] _, samples, _ in
            let unit = HKUnit.count().unitDivided(by: .minute())
            let points = (samples as? [HKQuantitySample] ?? []).map { Point(at: $0.startDate, bpm: $0.quantity.doubleValue(for: unit), activity: nil) }
            guard let self else { return }
            self.lock.lock(); self.stored = points; self.lock.unlock()
        }
        store.execute(query)
    }
}
