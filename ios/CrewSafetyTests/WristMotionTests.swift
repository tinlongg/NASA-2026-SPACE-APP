import XCTest
@testable import CrewSafety

final class WristMotionTests: XCTestCase {
    /// Feeds `seconds` of 50 Hz samples and returns every closed window.
    private func run(_ motion: inout WristMotion, seconds: Double, start: Double = 0,
                     acceleration: (Double) -> SIMD3<Double>, rotation: (Double) -> SIMD3<Double> = { _ in .zero }) -> [WristMotion.Window] {
        var windows: [WristMotion.Window] = []
        for index in 0..<Int(seconds * 50) {
            let time = start + Double(index) / 50
            if let window = motion.add(time: time, acceleration: acceleration(time), rotation: rotation(time)) { windows.append(window) }
        }
        return windows
    }

    func testStillWristWithSensorNoiseDoesNotMove() {
        var motion = WristMotion()
        let windows = run(&motion, seconds: 5, acceleration: { t in SIMD3(0.004 * sin(t * 90), 0.003, 0) }, rotation: { _ in SIMD3(0.02, 0, 0) })
        XCTAssertFalse(windows.isEmpty)
        XCTAssertFalse(windows.contains { $0.moved })
    }

    func testHandMovementCountsAfterTwoActiveWindows() {
        var motion = WristMotion()
        _ = run(&motion, seconds: 2, acceleration: { _ in .zero })
        let windows = run(&motion, seconds: 1.5, start: 2, acceleration: { t in SIMD3(0.15 * sin(t * 20), 0.08, 0) })
        XCTAssertTrue(windows.last?.moved ?? false)
        XCTAssertGreaterThan(windows.last?.activityLevel ?? 0, 0.2)
    }

    func testTurningTheWristCountsThroughRotation() {
        var motion = WristMotion()
        let windows = run(&motion, seconds: 1.5, acceleration: { _ in .zero }, rotation: { _ in SIMD3(0, 0.8, 0) })
        XCTAssertTrue(windows.last?.moved ?? false)
    }

    func testSingleBumpDoesNotCount() {
        var motion = WristMotion()
        let windows = run(&motion, seconds: 3, acceleration: { t in t >= 1 && t < 1.1 ? SIMD3(0.5, 0, 0) : .zero })
        XCTAssertFalse(windows.contains { $0.moved })
    }

    func testTelemetryKeepsOneSamplePerTenSeconds() {
        let base = Date(timeIntervalSince1970: 1_800_000_000)
        let points = (0..<60).map { (at: base.addingTimeInterval(Double($0)), bpm: 60 + Double($0), activity: Optional<Double>.none) }
        let thinned = HealthKitTelemetryProvider.thin(points)
        XCTAssertEqual(thinned.count, 6)
        XCTAssertEqual(thinned.first?.bpm, 69, "the newest sample in each bucket is kept")
        XCTAssertEqual(thinned.map(\.at), thinned.map(\.at).sorted())
    }
}
