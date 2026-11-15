import XCTest
@testable import CrewSafety

final class InactivityDetectorTests: XCTestCase {
    private func detections(_ frames: [PoseFrame], detector: inout InactivityDetector) -> [InactivityDetection] {
        frames.compactMap { detector.process($0) }
    }

    private func detections(_ frames: [PoseFrame]) -> [InactivityDetection] {
        var detector = InactivityDetector()
        return detections(frames, detector: &detector)
    }

    func testStoppingMovingGivesExactlyOneDetectionAfterTheStillDuration() throws {
        let result = detections(SyntheticPoses.stopsMoving())
        XCTAssertEqual(result.count, 1)
        let detection = try XCTUnwrap(result.first)
        // Limbs stop by 2.5 s (the last shift over the threshold can come a little earlier) and the wait is 15 s.
        XCTAssertGreaterThanOrEqual(detection.t, 15)
        XCTAssertLessThanOrEqual(detection.t, 17.6)
        XCTAssertEqual(detection.stillFor, 15, accuracy: 0.15)
        XCTAssertTrue(detection.explanation.contains("No body movement"))
    }

    func testDriftingAndTumblingWithLimpLimbsStillCountsAsNoMovement() {
        XCTAssertEqual(detections(SyntheticPoses.limpAndTumbling()).count, 1)
    }

    func testContinuousOrPeriodicMovementNeverAlerts() {
        XCTAssertTrue(detections(SyntheticPoses.working()).isEmpty)
        XCTAssertTrue(detections(SyntheticPoses.resting()).isEmpty)
    }

    func testLeavingTheViewRestartsTheTimer() {
        XCTAssertTrue(detections(SyntheticPoses.leavesView()).isEmpty)
    }

    func testShortPoseGapKeepsTheTimer() {
        var frames = SyntheticPoses.stopsMoving()
        // Drop one second of frames around 8 s; the gap is under the 2 s tolerance.
        frames = frames.map { $0.t > 8 && $0.t < 9 ? PoseFrame(t: $0.t, joints: [:]) : $0 }
        XCTAssertEqual(detections(frames).count, 1)
    }

    func testOnlyOneDetectionPerStillPeriodAndMovementRearms() {
        let first = SyntheticPoses.stopsMoving(duration: 40)
        let second = SyntheticPoses.stopsMoving(duration: 20).map { PoseFrame(t: $0.t + 40.1, joints: $0.joints) }
        XCTAssertEqual(detections(first).count, 1, "stays at one while still")
        XCTAssertEqual(detections(first + second).count, 2, "moving again re-arms")
    }

    func testRotationAndTranslationDoNotChangeTheShape() throws {
        let detector = InactivityDetector()
        let a = try XCTUnwrap(detector.shape(SyntheticPoses.frame(.init(), t: 0)))
        let b = try XCTUnwrap(detector.shape(SyntheticPoses.frame(.init(x: 0.3, y: 0.6, turn: 1.2), t: 0)))
        XCTAssertLessThan(InactivityDetector.change(from: a, to: b), 0.01)
        let reach = try XCTUnwrap(detector.shape(SyntheticPoses.frame(.init(arm: 1), t: 0)))
        XCTAssertGreaterThan(InactivityDetector.change(from: a, to: reach), 0.25)
    }

    func testEasyTestingConfigAlertsSooner() throws {
        var detector = InactivityDetector(config: .easyTesting)
        let detection = try XCTUnwrap(detections(SyntheticPoses.stopsMoving(), detector: &detector).first)
        XCTAssertEqual(detection.stillFor, 8, accuracy: 0.25)
    }

    func testResetAllowsTheSameSequenceAgain() {
        var detector = InactivityDetector()
        XCTAssertEqual(detections(SyntheticPoses.stopsMoving(), detector: &detector).count, 1)
        detector.reset()
        XCTAssertEqual(detections(SyntheticPoses.stopsMoving(), detector: &detector).count, 1)
    }

    func testSyntheticFixturesMatchTheirLabels() {
        for fixture in SyntheticPoses.fixtures {
            let count = detections(fixture.frames).count
            XCTAssertEqual(count, fixture.label == "unresponsive" ? 1 : 0, fixture.name)
        }
    }

    func testReadingMovesThroughStillToAlerted() {
        var detector = InactivityDetector()
        var phases: [InactivityDetector.Reading.Phase] = []
        for frame in SyntheticPoses.stopsMoving() {
            _ = detector.process(frame)
            if phases.last != detector.reading.phase { phases.append(detector.reading.phase) }
        }
        XCTAssertEqual(phases.first, .moving)
        XCTAssertTrue(phases.contains(.still))
        XCTAssertEqual(phases.last, .alerted)
        XCTAssertGreaterThanOrEqual(detector.reading.stillFor, 15)
    }

    func testNoTorsoMeansNoPerson() {
        var detector = InactivityDetector()
        _ = detector.process(PoseFrame(t: 0, joints: ["nose": PosePoint(x: 0.5, y: 0.5, c: 0.9)]))
        XCTAssertEqual(detector.reading.phase, .noPerson)
        XCTAssertNil(detector.reading.motion)
    }
}
