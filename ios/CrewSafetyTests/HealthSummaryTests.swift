import XCTest
@testable import CrewSafety

final class HealthSummaryTests: XCTestCase {
    private let calendar: Calendar = { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "UTC")!; return c }()

    func testSummaryHasOnlyRoundedValuesRangesAndLowercaseStandings() throws {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let today = calendar.startOfDay(for: now)
        var readings: [HealthMetric: [DailyValue]] = [:]
        for back in 0..<14 {
            let day = calendar.date(byAdding: .day, value: -back, to: today)!
            readings[.heartRate, default: []].append(DailyValue(day: day, value: 70 + Double(back % 3)))
        }
        let comparisons = HealthComparison.compareAll(readings, now: now, calendar: calendar)
        let summary = HealthSummary.make(from: comparisons, simulated: true, at: now)
        XCTAssertEqual(summary.metrics.count, 5)
        XCTAssertTrue(summary.simulated)
        XCTAssertEqual(summary.updatedAt, 1_800_000_000_000)
        let heart = try XCTUnwrap(summary.metrics.first { $0.key == "heartRate" })
        XCTAssertNotNil(heart.value); XCTAssertNotNil(heart.usualLow); XCTAssertNotNil(heart.usualHigh)
        XCTAssertTrue(["below", "within", "above"].contains(heart.standing ?? ""))
        // Measurements with no readings carry no numbers rather than invented ones.
        let oxygen = try XCTUnwrap(summary.metrics.first { $0.key == "bloodOxygen" })
        XCTAssertNil(oxygen.value); XCTAssertNil(oxygen.usualLow); XCTAssertNil(oxygen.standing)
    }

    func testEncodedSummaryContainsNoEcgOrFreeText() throws {
        let summary = HealthSummary.make(from: HealthComparison.compareAll([:], now: .now), simulated: false, at: .now)
        let json = String(decoding: try JSONEncoder().encode(summary), as: UTF8.self)
        XCTAssertFalse(json.lowercased().contains("ecg"))
        XCTAssertFalse(json.contains("sentence"))
        XCTAssertEqual(Set(summary.metrics.map(\.key)), ["heartRate", "restingHeartRate", "heartRateVariability", "respiratoryRate", "bloodOxygen"])
    }
}
