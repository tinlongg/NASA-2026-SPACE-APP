import XCTest
@testable import CrewSafety

@MainActor
final class AlertsTests: XCTestCase {
    func testNewestUnacknowledgedEventIsTheBannerEvent() {
        let store = EventStore()
        let id = UUID()
        store.record(SafetyEvent(crewMemberID: id, type: .manualTest, severity: .warning, source: .simulated, details: "a"))
        let newest = SafetyEvent(crewMemberID: id, type: .possibleFall, severity: .critical, source: .replay, details: "b")
        store.record(newest)
        XCTAssertEqual(store.activeAlerts.first?.id, newest.id)
        store.acknowledge(newest.id)
        XCTAssertEqual(store.activeAlerts.count, 1)
        XCTAssertNotEqual(store.activeAlerts.first?.id, newest.id)
    }
}

final class TelemetryTests: XCTestCase {
    private let provider = SimulatedTelemetryProvider()
    private let id = UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
    private let now = Date(timeIntervalSince1970: 1_800_000_005)

    func testSampleCountAndOrdering() {
        let samples = provider.samples(for: id, last: 1800, now: now)
        XCTAssertEqual(samples.count, 180)
        XCTAssertEqual(samples.map(\.timestamp), samples.map(\.timestamp).sorted())
        XCTAssertLessThanOrEqual(samples.last!.timestamp, now)
    }

    func testEverySampleIsLabelledSimulated() {
        XCTAssertTrue(provider.samples(for: id, last: 600, now: now).allSatisfy { $0.source == .simulated })
    }

    func testSameInputsGiveSameValues() {
        let a = provider.samples(for: id, last: 600, now: now).map(\.heartRateBPM)
        let b = provider.samples(for: id, last: 600, now: now).map(\.heartRateBPM)
        XCTAssertEqual(a, b)
        let other = provider.samples(for: UUID(uuidString: "00000000-0000-4000-8000-000000000002")!, last: 600, now: now)
        XCTAssertNotEqual(a, other.map(\.heartRateBPM))
    }

    func testValuesStayInsideTheBand() {
        for sample in provider.samples(for: id, last: 6 * 3600, now: now) {
            XCTAssertTrue(SimulatedTelemetryProvider.heartRateBand.contains(sample.heartRateBPM ?? 0))
            XCTAssertTrue((0...1).contains(sample.activityLevel ?? -1))
        }
    }
}
