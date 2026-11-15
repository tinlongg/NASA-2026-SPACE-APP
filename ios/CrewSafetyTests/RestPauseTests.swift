import XCTest
@testable import CrewSafety

final class RestPauseTests: XCTestCase {
    private let start = Date(timeIntervalSinceReferenceDate: 5_000)

    func testNotPausedByDefault() {
        XCTAssertFalse(RestPause().isPaused(at: start))
    }

    func testPausedUntilTheEndTimeThenResumesItself() {
        var rest = RestPause()
        rest.start(minutes: 15, now: start)
        XCTAssertTrue(rest.isPaused(at: start.addingTimeInterval(14 * 60)))
        XCTAssertFalse(rest.isPaused(at: start.addingTimeInterval(15 * 60)))
        XCTAssertEqual(rest.until, start.addingTimeInterval(15 * 60))
    }

    func testClearEndsThePauseImmediately() {
        var rest = RestPause()
        rest.start(minutes: 60, now: start)
        rest.clear()
        XCTAssertFalse(rest.isPaused(at: start.addingTimeInterval(1)))
    }

    @MainActor
    func testRestingShowsStatusAndCanBeEnded() async {
        let model = CameraMonitorViewModel()
        model.attach(eventStore: EventStore(events: []), crewStore: CrewStore(crew: SampleData.crew, monitoredCrewMemberID: SampleData.monitoredID))
        model.startRest(minutes: 15)
        XCTAssertTrue(model.isResting)
        XCTAssertTrue(model.statusText.hasPrefix("Rest period until"))
        model.endRest()
        XCTAssertFalse(model.isResting)
    }
}
