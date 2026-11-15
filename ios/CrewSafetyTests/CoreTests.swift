import XCTest
@testable import CrewSafety

@MainActor
final class CoreTests: XCTestCase {
    private let memberID = UUID()

    private func event(_ severity: EventSeverity, at offset: TimeInterval = 0) -> SafetyEvent {
        SafetyEvent(crewMemberID: memberID, type: .possibleUnresponsive,
                    timestamp: Date(timeIntervalSince1970: 1_000_000 + offset),
                    severity: severity, source: .simulated, details: "test")
    }

    func testEventStoreSortsInitialEventsNewestFirst() {
        let store = EventStore(events: [event(.info, at: 0), event(.info, at: 20), event(.info, at: 10)])
        XCTAssertEqual(store.events.map(\.timestamp), store.events.map(\.timestamp).sorted(by: >))
    }

    func testRecordInsertsAtFront() {
        let store = EventStore(events: [event(.info)])
        let new = event(.critical, at: 5)
        store.record(new)
        XCTAssertEqual(store.events.first?.id, new.id)
        XCTAssertEqual(store.activeAlerts.count, 2)
        XCTAssertEqual(store.highestActiveSeverity, .critical)
    }

    func testAcknowledgeSetsBothFieldsAndIsIdempotent() {
        let store = EventStore()
        let e = event(.critical)
        store.record(e)
        let first = Date(timeIntervalSince1970: 2_000_000)
        store.acknowledge(e.id, at: first)
        store.acknowledge(e.id, at: first.addingTimeInterval(60))
        XCTAssertEqual(store.events.first?.acknowledged, true)
        XCTAssertEqual(store.events.first?.acknowledgedAt, first)
        XCTAssertTrue(store.activeAlerts.isEmpty)
        XCTAssertNil(store.highestActiveSeverity)
    }

    func testCrewStatusIsDerivedFromUnacknowledgedEvents() {
        let member = CrewMember(id: memberID, displayName: "A", role: "r", status: .nominal, lastUpdated: .now)
        let other = CrewMember(id: UUID(), displayName: "B", role: "r", status: .nominal, lastUpdated: .now)
        let crew = CrewStore(crew: [member, other], monitoredCrewMemberID: memberID)
        let store = EventStore()
        XCTAssertEqual(crew.status(for: member, events: store), .nominal)

        let warning = event(.warning)
        store.record(warning)
        XCTAssertEqual(crew.status(for: member, events: store), .attention)

        let critical = event(.critical, at: 1)
        store.record(critical)
        XCTAssertEqual(crew.status(for: member, events: store), .alert)
        XCTAssertEqual(crew.status(for: other, events: store), .nominal)

        store.acknowledge(critical.id)
        XCTAssertEqual(crew.status(for: member, events: store), .attention)
        store.acknowledge(warning.id)
        XCTAssertEqual(crew.status(for: member, events: store), .nominal)
    }

    func testSampleDataIsLabelledSimulated() {
        XCTAssertTrue(SampleData.events.allSatisfy { $0.source == .simulated })
        XCTAssertTrue(SampleData.crew.contains { $0.id == SampleData.monitoredID })
    }

    func testSampleDataStartsWithNoActiveAlertBanner() {
        let store = EventStore(events: SampleData.events)
        XCTAssertTrue(store.activeAlerts.isEmpty, "The demo must open on a clean, nominal dashboard")
        XCTAssertNil(store.highestActiveSeverity)
    }
}
