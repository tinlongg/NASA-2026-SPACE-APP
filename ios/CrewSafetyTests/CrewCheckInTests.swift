import XCTest
@testable import CrewSafety

final class CrewCheckInTests: XCTestCase {
    private let start = Date(timeIntervalSinceReferenceDate: 1_000)

    @MainActor
    func testCheckInPromptHasABundledClip() {
        let url = CheckInVoice.clipURL(for: "No movement detected. Are you OK? Say I'm okay, or say help.")
        XCTAssertEqual(url?.pathExtension, "mp3")
    }

    @MainActor
    func testUnknownPhraseAndEmptyBundleFallBackToSystemVoice() {
        XCTAssertNil(CheckInVoice.clipURL(for: "A phrase nobody recorded"))
        XCTAssertNil(CheckInVoice.clipURL(for: "No movement detected. Are you OK? Say I'm okay, or say help.", in: Bundle(for: XCTestCase.self)))
    }

    @MainActor
    func testVoiceCleanupWithoutListeningIsSafeAndRepeatable() {
        // Reproduces answering a check-in with voice unavailable. Stopping must not
        // initialize audio input, which can abort the app on a simulator without audio I/O.
        let voice = CheckInVoice()
        voice.stop()
        voice.stop()
    }

    private func started(duration: TimeInterval = 60) -> CrewCheckIn {
        var checkIn = CrewCheckIn(duration: duration)
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
        var checkIn = CrewCheckIn(duration: 60)
        XCTAssertNil(checkIn.respond(.ok, at: start))
        XCTAssertNil(checkIn.tick(now: start.addingTimeInterval(100)))
        XCTAssertEqual(checkIn.remaining(at: start), 0)
    }

    func testTranscriptClassifier() {
        XCTAssertEqual(CrewCheckIn.classify(transcript: "I'm okay"), .ok)
        XCTAssertEqual(CrewCheckIn.classify(transcript: "yeah I'm fine"), .ok)
        XCTAssertEqual(CrewCheckIn.classify(transcript: "OK"), .ok)
        XCTAssertEqual(CrewCheckIn.classify(transcript: "I’m all right"), .ok)
        XCTAssertEqual(CrewCheckIn.classify(transcript: "help me"), .help)
        XCTAssertEqual(CrewCheckIn.classify(transcript: "I'm not okay"), .help)
        XCTAssertEqual(CrewCheckIn.classify(transcript: "not good"), .help)
        XCTAssertEqual(CrewCheckIn.classify(transcript: "I can't get up"), .help)
        XCTAssertNil(CrewCheckIn.classify(transcript: "what time is it"))
        XCTAssertNil(CrewCheckIn.classify(transcript: ""))
    }
}
