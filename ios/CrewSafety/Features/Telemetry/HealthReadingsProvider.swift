import Foundation
import HealthKit

/// What the comparison card needs: one value per day for each measurement, and the newest ECG recording.
struct HealthSnapshot: Sendable {
    var readings: [HealthMetric: [DailyValue]] = [:]
    var ecg: ECGSummary?
    /// True when the numbers are generated because Health had none. Must be shown with a Simulated badge.
    var simulated = false
    var loadedAt = Date()

    var isEmpty: Bool { ecg == nil && readings.values.allSatisfy(\.isEmpty) }
}

protocol HealthReadingsProviding: Sendable {
    /// Asks for Health access if needed, then reads the last month. Never throws: a refusal reads as "no data".
    func load(now: Date) async -> HealthSnapshot
}

/// Reads daily averages that the Apple Watch saved to Health on this iPhone. The snapshot takes no part in alerts and
/// is not synced; only an opt-in summary (see `HealthSummary`) can go to the website.
///
/// Health never reveals whether read access was refused, so "refused" and "nothing recorded" look the
/// same. When there is nothing at all, the simulated provider's numbers are returned, labelled simulated.
struct HealthKitReadingsProvider: HealthReadingsProviding {
    private let store = HKHealthStore()
    private let fallback = SimulatedHealthReadingsProvider()

    private static let quantities: [(HealthMetric, HKQuantityTypeIdentifier, HKUnit, Double)] = [
        (.heartRate, .heartRate, HKUnit.count().unitDivided(by: .minute()), 1),
        (.restingHeartRate, .restingHeartRate, HKUnit.count().unitDivided(by: .minute()), 1),
        (.heartRateVariability, .heartRateVariabilitySDNN, HKUnit.secondUnit(with: .milli), 1),
        (.respiratoryRate, .respiratoryRate, HKUnit.count().unitDivided(by: .minute()), 1),
        (.bloodOxygen, .oxygenSaturation, HKUnit.percent(), 100),
    ]

    static var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.electrocardiogramType()]
        for (_, identifier, _, _) in quantities { types.insert(HKQuantityType(identifier)) }
        return types
    }

    func load(now: Date) async -> HealthSnapshot {
        guard HKHealthStore.isHealthDataAvailable() else { return await fallback.load(now: now) }
        do { try await store.requestAuthorization(toShare: [], read: Self.readTypes) } catch { return await fallback.load(now: now) }

        var snapshot = HealthSnapshot(loadedAt: now)
        for (metric, identifier, unit, scale) in Self.quantities {
            snapshot.readings[metric] = await dailyAverages(HKQuantityType(identifier), unit: unit, scale: scale, now: now)
        }
        snapshot.ecg = await latestECG()
        return snapshot.isEmpty ? await fallback.load(now: now) : snapshot
    }

    /// One average per calendar day for the history window plus the days that can count as current.
    private func dailyAverages(_ type: HKQuantityType, unit: HKUnit, scale: Double, now: Date) async -> [DailyValue] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: now)
        let days = HealthComparison.historyWindowDays + HealthComparison.latestMaxAgeDays
        guard let start = calendar.date(byAdding: .day, value: -days, to: today) else { return [] }
        let descriptor = HKStatisticsCollectionQueryDescriptor(
            predicate: .quantitySample(type: type, predicate: HKQuery.predicateForSamples(withStart: start, end: now)),
            options: .discreteAverage, anchorDate: today, intervalComponents: DateComponents(day: 1))
        guard let collection = try? await descriptor.result(for: store) else { return [] }
        var values: [DailyValue] = []
        collection.enumerateStatistics(from: start, to: now) { statistics, _ in
            guard let average = statistics.averageQuantity() else { return }
            values.append(DailyValue(day: statistics.startDate, value: average.doubleValue(for: unit) * scale))
        }
        return values
    }

    /// The newest 30-second recording the wearer took in Apple's ECG app, with Apple's own label.
    private func latestECG() async -> ECGSummary? {
        let descriptor = HKSampleQueryDescriptor(predicates: [.electrocardiogram()],
                                                 sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)], limit: 1)
        guard let recording = try? await descriptor.result(for: store).first else { return nil }
        let bpm = recording.averageHeartRate?.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        return ECGSummary(label: Self.label(for: recording.classification), averageHeartRate: bpm, recordedAt: recording.startDate)
    }

    static func label(for classification: HKElectrocardiogram.Classification) -> String {
        switch classification {
        case .sinusRhythm: "Sinus rhythm"
        case .atrialFibrillation: "Atrial fibrillation"
        case .inconclusiveLowHeartRate: "Inconclusive, low heart rate"
        case .inconclusiveHighHeartRate: "Inconclusive, high heart rate"
        case .inconclusivePoorReading: "Inconclusive, poor recording"
        case .inconclusiveOther: "Inconclusive"
        case .unrecognized: "Unrecognised"
        case .notSet: "No label"
        @unknown default: "No label"
        }
    }
}

/// Generated numbers for the Simulator and for iPhones with no Watch readings. Repeatable: the same
/// day always gives the same value. No ECG, because a recording cannot be invented.
struct SimulatedHealthReadingsProvider: HealthReadingsProviding {
    private static let shapes: [(HealthMetric, base: Double, swing: Double)] = [
        (.heartRate, 71, 5), (.restingHeartRate, 58, 3), (.heartRateVariability, 46, 9),
        (.respiratoryRate, 14.2, 0.8), (.bloodOxygen, 97, 1),
    ]

    func load(now: Date) async -> HealthSnapshot {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: now)
        var snapshot = HealthSnapshot(simulated: true, loadedAt: now)
        for (index, shape) in Self.shapes.enumerated() {
            snapshot.readings[shape.0] = (0...HealthComparison.historyWindowDays).reversed().compactMap { back in
                guard let day = calendar.date(byAdding: .day, value: -back, to: today) else { return nil }
                let ordinal = Double(calendar.ordinality(of: .day, in: .era, for: day) ?? 0)
                let wave = sin(ordinal * 0.9 + Double(index)) * 0.6 + sin(ordinal * 0.37 + Double(index) * 2) * 0.4
                return DailyValue(day: day, value: shape.base + shape.swing * wave)
            }
        }
        return snapshot
    }
}
