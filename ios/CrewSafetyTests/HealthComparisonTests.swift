import XCTest
@testable import CrewSafety

final class HealthComparisonTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "GMT")!
        return calendar
    }

    private func day(_ back: Int, from now: Date) -> Date {
        calendar.date(byAdding: .day, value: -back, to: calendar.startOfDay(for: now))!
    }

    private var now: Date { calendar.date(from: DateComponents(year: 2026, month: 11, day: 15, hour: 14))! }

    /// `history` oldest first, ending yesterday; `latest` is today's value.
    private func series(history: [Double], latest: Double) -> [DailyValue] {
        history.enumerated().map { DailyValue(day: day(history.count - $0.offset, from: now), value: $0.element) }
            + [DailyValue(day: day(0, from: now), value: latest)]
    }

    func testPercentileInterpolatesBetweenValues() {
        XCTAssertEqual(HealthComparison.percentile([10, 20, 30, 40, 50], 0.5), 30)
        XCTAssertEqual(HealthComparison.percentile([10, 20], 0.25), 12.5)
        XCTAssertEqual(HealthComparison.percentile([7], 0.9), 7)
    }

    func testUsualRangeNeedsSevenEarlierDays() {
        XCTAssertNil(HealthComparison.usualRange(from: [60, 61, 62, 63, 64, 65]))
        let range = HealthComparison.usualRange(from: Array(stride(from: 60.0, through: 70.0, by: 1)))
        XCTAssertEqual(range, UsualRange(low: 61, high: 69, days: 11))
    }

    func testLatestValueIsComparedWithEarlierDaysOnly() {
        // Ten steady days around 60, then a much higher day: today must not widen its own range.
        let comparison = HealthComparison.compare(metric: .bloodOxygen,
                                                  daily: series(history: [96, 97, 98, 97, 96, 97, 98, 97, 96, 97], latest: 99),
                                                  now: now, calendar: calendar)
        XCTAssertEqual(comparison.value, 99)
        XCTAssertEqual(comparison.historyDays, 10)
        XCTAssertEqual(comparison.baselineStanding, .above)
        XCTAssertEqual(comparison.baselineSentence, "Above your usual range (96–98%, last 10 days with readings).")
        XCTAssertNil(comparison.reference)
        XCTAssertEqual(comparison.referenceSentence, "No astronaut figure has been verified for this measurement.")
        XCTAssertEqual(comparison.everydayStanding, .above) // 99% against 95–97%
    }

    func testStandingAgainstTheAstronautRange() {
        // Published range for heart rate: 74.6 ± 8.2, shown as 66–83 bpm.
        func standing(_ bpm: Double) -> Standing? {
            HealthComparison.compare(metric: .heartRate, daily: series(history: [], latest: bpm), now: now, calendar: calendar).referenceStanding
        }
        XCTAssertEqual(standing(58), .below)
        XCTAssertEqual(standing(66), .within)
        XCTAssertEqual(standing(83), .within)
        XCTAssertEqual(standing(84), .above)
        let sentence = HealthComparison.compare(metric: .heartRate, daily: series(history: [], latest: 58), now: now, calendar: calendar).referenceSentence
        XCTAssertEqual(sentence, "Below the range reported for 7 astronauts on the ISS (66–83 bpm, mean ± 1 SD).")
    }

    func testNasaFiguresAreWorkedOutFromTheArchivedTables() {
        // Spacelab "In flight" rows: 66, 52, 58, 57, 54, 59 bpm.
        let rates = HealthComparison.spacelabInflightRestingHeartRates
        XCTAssertEqual(rates.count, 6)
        XCTAssertEqual(HealthComparison.mean(rates), 57.667, accuracy: 0.001)
        XCTAssertEqual(HealthComparison.standardDeviation(rates), 4.844, accuracy: 0.001)

        let resting = HealthComparison.compare(metric: .restingHeartRate, daily: series(history: [], latest: 64), now: now, calendar: calendar)
        XCTAssertEqual(resting.referenceSentence, "Above the range reported for 6 astronauts on Spacelab shuttle flights (53–63 bpm, mean ± 1 SD).")
        XCTAssertEqual(resting.reference?.source.id, "nasa-lsda-178066")

        // ISS breathing frequency 11.9 ± 0.4 SE over 62 measurements: SD = 0.4 × √62 ≈ 3.15.
        let breathing = HealthComparison.compare(metric: .respiratoryRate, daily: series(history: [], latest: 14.2), now: now, calendar: calendar)
        XCTAssertEqual(breathing.reference?.sd ?? 0, 3.150, accuracy: 0.001)
        XCTAssertEqual(breathing.referenceSentence, "Within the range reported for 10 ISS crew members (8.8–15.0 breaths/min, mean ± 1 SD, SD worked out from the standard error).")
        XCTAssertEqual(breathing.reference?.source.url.host, "nlsp.nasa.gov")
        XCTAssertNil(HealthComparison.reference(for: .bloodOxygen))
    }

    func testFiguresForAdultsOnEarth() {
        // Swedish 24-hour ECG study: men 73 ± 9 (1,825), women 76 ± 8 (2,117), combined here.
        let swedish = HealthComparison.combined(HealthComparison.swedishHeartRateGroups)
        XCTAssertEqual(swedish.count, 3942)
        XCTAssertEqual(swedish.mean, 74.611, accuracy: 0.001)
        XCTAssertEqual(swedish.sd, 8.609, accuracy: 0.001)

        func sentence(_ metric: HealthMetric, _ latest: Double) -> String {
            HealthComparison.compare(metric: metric, daily: series(history: [], latest: latest), now: now, calendar: calendar).everydaySentence
        }
        XCTAssertEqual(sentence(.heartRate, 90), "Above the range reported for 3,942 adults aged 50 to 65 in Sweden (66–83 bpm, mean ± 1 SD, men's and women's figures combined).")
        XCTAssertEqual(sentence(.restingHeartRate, 59), "Within the range reported for 92,457 adults wearing Fitbit trackers (58–73 bpm, mean ± 1 SD).")
        XCTAssertEqual(sentence(.heartRateVariability, 30), "Below the range reported for adults in 27 studies of short recordings (34–66 ms, mean ± 1 SD).")
        XCTAssertEqual(sentence(.respiratoryRate, 14.3), "Within the range reported for 10,000 Fitbit wearers aged 20 to 69 (13.1–17.8 breaths/min, mean ± 1 SD).")
        XCTAssertEqual(sentence(.bloodOxygen, 94), "Below the range reported for 33,080 Apple Watch wearers (95–97%, mean ± 1 SD).")

        // Every measurement has a figure for adults on Earth, each from its own source.
        XCTAssertEqual(HealthComparison.everydayReferences.map(\.metric), HealthMetric.allCases)
        XCTAssertEqual(Set(HealthComparison.everydayReferences.map(\.source.id)).count, HealthMetric.allCases.count)
    }

    func testSentenceAgreesWithTheRoundedNumbersOnScreen() {
        // 69.6 and a high bound of 70.4 both print as 70, so the sentence must say "within".
        let standing = HealthComparison.standing(of: 70.4, low: 60, high: 69.6, metric: .heartRate)
        XCTAssertEqual(standing, .within)
        XCTAssertEqual(HealthComparison.standing(of: 14.26, low: 13, high: 14.2, metric: .respiratoryRate), .above)
    }

    func testTooLittleHistorySaysSoInsteadOfGuessing() {
        let comparison = HealthComparison.compare(metric: .heartRateVariability, daily: series(history: [40, 45, 50], latest: 48), now: now, calendar: calendar)
        XCTAssertNil(comparison.usual)
        XCTAssertNil(comparison.baselineStanding)
        XCTAssertEqual(comparison.baselineSentence, "Your usual range needs 7 earlier days of readings; 3 found.")
        XCTAssertEqual(comparison.referenceStanding, .within) // 48 ms inside 40–86 ms
    }

    func testOldOrMissingReadingsAreNotTreatedAsCurrent() {
        let stale = [DailyValue(day: day(6, from: now), value: 62)]
        let comparison = HealthComparison.compare(metric: .heartRate, daily: stale, now: now, calendar: calendar)
        XCTAssertNil(comparison.value)
        XCTAssertNil(comparison.referenceStanding)
        XCTAssertNil(comparison.everydayStanding)
        XCTAssertEqual(comparison.everydaySentence, "Reported for 3,942 adults aged 50 to 65 in Sweden: 66–83 bpm, mean ± 1 SD, men's and women's figures combined.")
        XCTAssertEqual(comparison.baselineSentence, "No recent reading in Health.")
        XCTAssertNil(HealthComparison.compare(metric: .bloodOxygen, daily: [], now: now, calendar: calendar).value)
    }

    func testHistoryOlderThanTheWindowIsIgnored() {
        var daily = (1...10).map { DailyValue(day: day($0, from: now), value: 60) }
        daily += (40...60).map { DailyValue(day: day($0, from: now), value: 90) }
        daily.append(DailyValue(day: day(0, from: now), value: 61))
        let comparison = HealthComparison.compare(metric: .heartRate, daily: daily, now: now, calendar: calendar)
        XCTAssertEqual(comparison.historyDays, 10)
        XCTAssertEqual(comparison.usual, UsualRange(low: 60, high: 60, days: 10))
        XCTAssertEqual(comparison.baselineStanding, .above)
    }

    func testEveryPublishedFigureHasASourceAndASensibleRange() {
        XCTAssertFalse(HealthComparison.spaceflightReferences.isEmpty)
        XCTAssertEqual(Set(HealthComparison.spaceflightReferences.map(\.metric)).count, HealthComparison.spaceflightReferences.count)
        for reference in HealthComparison.spaceflightReferences + HealthComparison.everydayReferences {
            XCTAssertGreaterThan(reference.sd, 0)
            XCTAssertGreaterThan(reference.low, 0)
            if let participants = reference.participants { XCTAssertGreaterThan(participants, 0) }
            XCTAssertFalse(reference.setting.isEmpty)
            XCTAssertFalse(reference.caveat.isEmpty)
            XCTAssertEqual(reference.source.url.scheme, "https")
            XCTAssertFalse(reference.source.citation.isEmpty)
        }
    }

    func testWordingDescribesNumbersAndNeverJudgesHealth() {
        let banned = ["normal", "healthy", "risk", "danger", "diagnos", "safe", "should", "concern"]
        var sentences: [String] = []
        for metric in HealthMetric.allCases {
            for latest in [1.0, 60, 500] {
                let full = HealthComparison.compare(metric: metric, daily: series(history: Array(repeating: 60, count: 10), latest: latest), now: now, calendar: calendar)
                let short = HealthComparison.compare(metric: metric, daily: series(history: [], latest: latest), now: now, calendar: calendar)
                sentences += [full.baselineSentence, full.referenceSentence, full.everydaySentence,
                              short.baselineSentence, short.referenceSentence, short.everydaySentence]
            }
            sentences += [metric.title, metric.note]
        }
        sentences += (HealthComparison.spaceflightReferences + HealthComparison.everydayReferences).flatMap { [$0.caveat, $0.setting, $0.group, $0.rangeLabel] }
        for sentence in sentences {
            for word in banned { XCTAssertFalse(sentence.lowercased().contains(word), "\"\(sentence)\" contains \"\(word)\"") }
        }
    }

    func testSimulatedReadingsAreLabelledRepeatableAndComplete() async {
        let provider = SimulatedHealthReadingsProvider()
        let first = await provider.load(now: now), second = await provider.load(now: now)
        XCTAssertTrue(first.simulated)
        XCTAssertNil(first.ecg)
        for metric in HealthMetric.allCases {
            XCTAssertEqual(first.readings[metric], second.readings[metric])
            XCTAssertEqual(first.readings[metric]?.count, HealthComparison.historyWindowDays + 1)
        }
        let comparisons = HealthComparison.compareAll(first.readings, now: now)
        XCTAssertEqual(comparisons.map(\.metric), HealthMetric.allCases)
        XCTAssertTrue(comparisons.allSatisfy { $0.value != nil && $0.usual != nil })
    }

    func testDayLabel() {
        XCTAssertEqual(HealthComparison.dayLabel(day(0, from: now), now: now, calendar: calendar), "today")
        XCTAssertEqual(HealthComparison.dayLabel(day(1, from: now), now: now, calendar: calendar), "yesterday")
        XCTAssertEqual(HealthComparison.dayLabel(day(3, from: now), now: now, calendar: calendar), "3 days ago")
    }
}
