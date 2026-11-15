import Foundation

/// Turns Apple Watch device-motion samples into "the wrist moved" readings. Pure: no sensors, no timers.
///
/// Samples (about 50 a second) are grouped into half-second windows. A window is active when the
/// root-mean-square of user acceleration (gravity removed, in g) or of rotation rate (rad/s) passes
/// its threshold and at least `minActiveSeconds` of its samples did too. The wrist counts as moved when
/// 2 of the last 3 windows were active, so a single bump or glitch does not count, even one that falls
/// across the boundary between two windows. In microgravity a limp, drifting arm reads close to zero.
struct WristMotion {
    struct Window: Equatable {
        let acceleration: Double
        let rotation: Double
        let moved: Bool
        /// 0...1 relative activity, for telemetry.
        let activityLevel: Double
    }

    var windowSeconds: TimeInterval = 0.5
    var accelerationThreshold = 0.03
    var rotationThreshold = 0.35
    var minActiveSeconds = 0.12

    private var windowStart: TimeInterval?
    private var accelerationSquares = 0.0
    private var rotationSquares = 0.0
    private var count = 0
    private var activeSamples = 0
    private var lastTime: TimeInterval?
    private var activeTime = 0.0
    private var recent: [Bool] = []

    /// Adds one sample. Returns a reading each time a half-second window closes, otherwise nil.
    mutating func add(time: TimeInterval, acceleration: SIMD3<Double>, rotation: SIMD3<Double>) -> Window? {
        if windowStart == nil { windowStart = time }
        let a2 = (acceleration * acceleration).sum(), r2 = (rotation * rotation).sum()
        accelerationSquares += a2
        rotationSquares += r2
        count += 1
        let step = min(0.1, max(0, time - (lastTime ?? time)))
        lastTime = time
        if a2.squareRoot() > accelerationThreshold || r2.squareRoot() > rotationThreshold { activeSamples += 1; activeTime += step > 0 ? step : 0.02 }
        guard let start = windowStart, time - start >= windowSeconds, count > 0 else { return nil }

        let accelerationRMS = (accelerationSquares / Double(count)).squareRoot()
        let rotationRMS = (rotationSquares / Double(count)).squareRoot()
        windowStart = time
        accelerationSquares = 0
        rotationSquares = 0
        count = 0
        let sustained = activeTime >= minActiveSeconds - 1e-9
        activeSamples = 0
        activeTime = 0

        recent.append(sustained && (accelerationRMS > accelerationThreshold || rotationRMS > rotationThreshold))
        if recent.count > 3 { recent.removeFirst() }
        let moved = recent.filter { $0 }.count >= 2
        let level = min(1, max(accelerationRMS / 0.3, rotationRMS / 3))
        return Window(acceleration: accelerationRMS, rotation: rotationRMS, moved: moved, activityLevel: level)
    }

    mutating func reset() {
        windowStart = nil; accelerationSquares = 0; rotationSquares = 0; count = 0; recent = []
        activeSamples = 0; activeTime = 0; lastTime = nil
    }
}

/// Keys of the small dictionaries the Watch and iPhone exchange over WatchConnectivity.
enum WatchMessage {
    static let type = "type"
    // Watch -> iPhone
    static let reading = "reading"   // monitoring, sentAt, hr?, hrAt?, movedAt?, level?
    static let answer = "answer"     // id, kind ("ok" | "help"), at
    // iPhone -> Watch
    static let checkIn = "checkIn"   // id, deadline
    static let cancelCheckIn = "cancelCheckIn" // id
}
