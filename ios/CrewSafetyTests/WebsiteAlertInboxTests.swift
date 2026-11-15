import XCTest
@testable import CrewSafety

final class WebsiteAlertInboxTests: XCTestCase {
    private func alert(_ group: String, _ kind: WebsiteAlert.Kind, at: Double = 1_000_000) -> WebsiteAlert {
        WebsiteAlert(id: "\(group)-\(kind.rawValue)", person: "Person 1", kind: kind, reason: "No movement for 15 s.", at: at)
    }

    func testCheckInThenAlertShareOneNotification() {
        var inbox = WebsiteAlertInbox()
        let first = inbox.receive([alert("p1-5", .checkin)], serverNow: 1_002_000)
        let second = inbox.receive([alert("p1-5", .checkin), alert("p1-5", .alert)], serverNow: 1_005_000)
        guard case let .show(id1, title1, _)? = first.first, case let .show(id2, title2, _)? = second.first else { return XCTFail() }
        XCTAssertEqual(first.count, 1); XCTAssertEqual(second.count, 1, "an alert already seen is not shown again")
        XCTAssertEqual(id1, "website-p1-5"); XCTAssertEqual(id1, id2)
        XCTAssertTrue(title1.hasPrefix("Are you OK?")); XCTAssertTrue(title2.hasPrefix("No movement"))
    }

    func testResolvedClearsTheNotification() {
        var inbox = WebsiteAlertInbox()
        _ = inbox.receive([alert("p1-5", .checkin)], serverNow: 1_000_000)
        XCTAssertEqual(inbox.receive([alert("p1-5", .resolved)], serverNow: 1_001_000), [.clear(id: "website-p1-5")])
    }

    func testOldAlertsAreSkippedAndSeenIdsSurviveARestart() {
        var inbox = WebsiteAlertInbox()
        XCTAssertTrue(inbox.receive([alert("old", .alert, at: 0)], serverNow: 200_000).isEmpty)
        _ = inbox.receive([alert("p2-9", .alert)], serverNow: 1_000_000)
        var restarted = WebsiteAlertInbox(seen: inbox.seen)
        XCTAssertTrue(restarted.receive([alert("p2-9", .alert)], serverNow: 1_000_000).isEmpty)
    }
}
