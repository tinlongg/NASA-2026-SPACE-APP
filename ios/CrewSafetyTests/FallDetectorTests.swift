import XCTest
@testable import CrewSafety

final class FallDetectorTests: XCTestCase {
    private func detections(_ frames: [PoseFrame], detector: inout HeuristicFallDetector) -> [FallDetection] {
        frames.compactMap { detector.process($0) }
    }

    private func detections(_ frames: [PoseFrame]) -> [FallDetection] {
        var detector = HeuristicFallDetector()
        return detections(frames, detector: &detector)
    }

    func testFastFallThenStillnessGivesExactlyOneDetection() throws {
        let result = detections(SyntheticPoses.fall())
        XCTAssertEqual(result.count, 1)
        let detection = try XCTUnwrap(result.first)
        XCTAssertGreaterThanOrEqual(detection.score, 0.5)
        XCTAssertLessThanOrEqual(detection.score, 1.0)
        XCTAssertTrue(detection.explanation.contains("Hip height dropped"))
        // Fall starts at 2.0 s, takes 0.5 s, and must be held for 2.0 s.
        XCTAssertGreaterThanOrEqual(detection.t, 4.0)
        XCTAssertLessThan(detection.t, 5.5)
    }

    func testSittingDownGivesNoDetection() {
        XCTAssertTrue(detections(SyntheticPoses.sitDown()).isEmpty)
    }

    func testLyingDownSlowlyGivesNoDetection() {
        XCTAssertTrue(detections(SyntheticPoses.lieDownSlowly()).isEmpty)
    }

    func testWalkingAndStandingGiveNoDetection() {
        XCTAssertTrue(detections(SyntheticPoses.walk()).isEmpty)
        XCTAssertTrue(detections(SyntheticPoses.stand()).isEmpty)
    }

    func testGettingUpBeforeTheHoldEndsGivesNoDetection() {
        XCTAssertTrue(detections(SyntheticPoses.fallThenGetUp()).isEmpty)
    }

    func testSecondFallInsideCooldownIsSuppressed() {
        // First detection lands near 4.5 s; second fall begins at 8 s, inside the 15 s cooldown.
        let frames = SyntheticPoses.fall(stayDownFor: 3) + SyntheticPoses.fall(startTime: 6, stayDownFor: 4)
        XCTAssertEqual(detections(frames).count, 1)
    }

    func testSecondFallAfterCooldownIsDetected() {
        let frames = SyntheticPoses.fall(stayDownFor: 3) + SyntheticPoses.fall(startTime: 22, stayDownFor: 4)
        XCTAssertEqual(detections(frames).count, 2)
    }

    func testPoseLossLongerThanToleranceAbandonsTheHold() {
        var frames = SyntheticPoses.fall(standFor: 2, stayDownFor: 0.5)   // ends 3.0 s, hold started ~2.4 s
        let end = frames.last!.t
        for i in 1...20 { frames.append(PoseFrame(t: end + Double(i) * 0.1, joints: [:])) }  // 2 s with no pose
        XCTAssertTrue(detections(frames).isEmpty)
    }

    func testShortPoseLossDuringHoldStillDetects() {
        var frames = SyntheticPoses.fall(standFor: 2, stayDownFor: 4)
        // Blank out 0.5 s in the middle of the hold.
        frames = frames.map { (3.0...3.5).contains($0.t) ? PoseFrame(t: $0.t, joints: [:]) : $0 }
        XCTAssertEqual(detections(frames).count, 1)
    }

    func testLowConfidenceJointsAreIgnored() {
        let frames = SyntheticPoses.fall().map { frame in
            PoseFrame(t: frame.t, joints: frame.joints.mapValues { PosePoint(x: $0.x, y: $0.y, c: 0.1) })
        }
        XCTAssertTrue(detections(frames).isEmpty)
    }

    func testTimeGoingBackwardsResetsTheDetector() {
        var detector = HeuristicFallDetector()
        XCTAssertEqual(detections(SyntheticPoses.fall(), detector: &detector).count, 1)
        // A new clip starting at t = 0 must not be blocked by the previous clip's cooldown.
        XCTAssertEqual(detections(SyntheticPoses.fall(), detector: &detector).count, 1)
    }

    func testMeasurementUsesAspectRatio() throws {
        let detector = HeuristicFallDetector(frameAspectRatio: 1)
        let frame = PoseFrame(t: 0, joints: ["root": PosePoint(x: 0.5, y: 0.5, c: 1),
                                             "neck": PosePoint(x: 0.7, y: 0.7, c: 1)])
        let m = try XCTUnwrap(detector.measure(frame))
        XCTAssertEqual(m.torsoAngleDeg, 45, accuracy: 0.01)
        XCTAssertEqual(m.hipY, 0.5)
    }

    func testSyntheticFixturesMatchTheirLabels() {
        for fixture in SyntheticPoses.fixtures {
            let count = detections(fixture.frames).count
            XCTAssertEqual(count, fixture.label == "fall" ? 1 : 0, fixture.name)
        }
    }

    // MARK: Easy test detection (web camera only)

    func testSideLeanIsIgnoredByStandardThresholds() {
        var detector = HeuristicFallDetector(frameAspectRatio: 16.0 / 9.0)
        XCTAssertTrue(detections(SyntheticPoses.leanToSide(), detector: &detector).isEmpty)
    }

    func testSideLeanTriggersEasyTestDetection() {
        var detector = HeuristicFallDetector(config: .easyTesting, frameAspectRatio: 16.0 / 9.0)
        XCTAssertEqual(detections(SyntheticPoses.leanToSide(), detector: &detector).count, 1)
    }

    func testEasyTestDetectionStillIgnoresSittingDown() {
        var detector = HeuristicFallDetector(config: .easyTesting, frameAspectRatio: 16.0 / 9.0)
        XCTAssertTrue(detections(SyntheticPoses.sitDown(), detector: &detector).isEmpty)
    }

    // MARK: Live reading

    func testReadingTracksAFallThroughHoldingToCooldown() {
        var detector = HeuristicFallDetector()
        var phases: [HeuristicFallDetector.Reading.Phase] = []
        var maxHeld: TimeInterval = 0
        var detected = false
        for frame in SyntheticPoses.fall() {
            if detector.process(frame) != nil { detected = true }
            phases.append(detector.reading.phase)
            maxHeld = max(maxHeld, detector.reading.held)
        }
        XCTAssertTrue(detected)
        XCTAssertEqual(phases.first, .upright)
        XCTAssertTrue(phases.contains(.holding))
        XCTAssertEqual(phases.last, .cooldown)
        XCTAssertGreaterThan(maxHeld, 1.5)
    }

    func testReadingReportsConfidenceAngleAndDrop() throws {
        var detector = HeuristicFallDetector()
        let frames = SyntheticPoses.fall()
        _ = detector.process(frames[0])
        XCTAssertEqual(try XCTUnwrap(detector.reading.poseConfidence), 0.9, accuracy: 0.001)
        XCTAssertEqual(try XCTUnwrap(detector.reading.torsoAngleDeg), 0, accuracy: 0.5)
        XCTAssertEqual(try XCTUnwrap(detector.reading.hipDrop), 0, accuracy: 0.001)
        for frame in frames.prefix(30).dropFirst() { _ = detector.process(frame) }
        // After the drop the hips are well below the upright reference.
        XCTAssertGreaterThan(try XCTUnwrap(detector.reading.hipDrop), 0.2)
    }

    func testReadingIsEmptyWithoutAPerson() {
        var detector = HeuristicFallDetector()
        _ = detector.process(PoseFrame(t: 0, joints: [:]))
        XCTAssertEqual(detector.reading.phase, .noPerson)
        XCTAssertNil(detector.reading.poseConfidence)
        XCTAssertNil(detector.reading.torsoAngleDeg)
    }
}
