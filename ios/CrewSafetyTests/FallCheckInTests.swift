import XCTest
@testable import CrewSafety

final class FallCheckInTests: XCTestCase {
    private let start = Date(timeIntervalSinceReferenceDate: 1_000)

    private func started(duration: TimeInterval = 60) -> FallCheckIn {
        var checkIn = FallCheckIn(duration: duration)
        checkIn.start(at: start)
        return checkIn
    }

    func testNoResponseAtDeadline() {
        var checkIn = started()
        XCTAssertNil(checkIn.tick(now: start.addingTimeInterval(59.9)))
        XCTAssertEqual(checkIn.remaining(at: start.addingTimeInterval(30)), 30, accuracy: 0.001)
        XCTAssertEqual(checkIn.tick(now: start.addingTimeInterval(60)), .noResponse(after: 60))
        // Resolves only once.
        XCTAssertNil(checkIn.tick(now: start.addingTimeInterval(61)))
    }

    func testOKBeforeDeadlineResolves() {
        var checkIn = started()
        XCTAssertEqual(checkIn.respond(.ok, at: start.addingTimeInterval(7)), .respondedOK(after: 7))
        XCTAssertNil(checkIn.tick(now: start.addingTimeInterval(120)))
        XCTAssertFalse(checkIn.isAwaiting)
    }

    func testHelpEscalates() {
        var checkIn = started()
        XCTAssertEqual(checkIn.respond(.help, at: start.addingTimeInterval(3)), .requestedHelp(after: 3))
    }

    func testAnswerAfterResolutionIsIgnored() {
        var checkIn = started()
        _ = checkIn.respond(.help, at: start.addingTimeInterval(3))
        XCTAssertNil(checkIn.respond(.ok, at: start.addingTimeInterval(4)))
        XCTAssertEqual(checkIn.state, .resolved(.requestedHelp(after: 3)))
    }

    func testLateAnswerCountsAsNoResponse() {
        var checkIn = started()
        XCTAssertEqual(checkIn.respond(.ok, at: start.addingTimeInterval(65)), .noResponse(after: 60))
    }

    func testIdleIgnoresEverything() {
        var checkIn = FallCheckIn(duration: 60)
        XCTAssertNil(checkIn.respond(.ok, at: start))
        XCTAssertNil(checkIn.tick(now: start.addingTimeInterval(100)))
        XCTAssertEqual(checkIn.remaining(at: start), 0)
    }

    func testTranscriptClassifier() {
        XCTAssertEqual(FallCheckIn.classify(transcript: "I'm okay"), .ok)
        XCTAssertEqual(FallCheckIn.classify(transcript: "yeah I'm fine"), .ok)
        XCTAssertEqual(FallCheckIn.classify(transcript: "OK"), .ok)
        XCTAssertEqual(FallCheckIn.classify(transcript: "I’m all right"), .ok)
        XCTAssertEqual(FallCheckIn.classify(transcript: "help me"), .help)
        XCTAssertEqual(FallCheckIn.classify(transcript: "I'm not okay"), .help)
        XCTAssertEqual(FallCheckIn.classify(transcript: "not good"), .help)
        XCTAssertEqual(FallCheckIn.classify(transcript: "I can't get up"), .help)
        XCTAssertNil(FallCheckIn.classify(transcript: "what time is it"))
        XCTAssertNil(FallCheckIn.classify(transcript: ""))
    }
}
