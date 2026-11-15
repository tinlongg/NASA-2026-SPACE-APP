import Foundation

// MARK: - Fall detection contract (pure logic; no AVFoundation/Vision imports)
struct PosePoint: Codable, Hashable, Sendable {
    let x: Double   // 0...1, origin bottom-left, +y is up in the upright scene
    let y: Double
    let c: Double   // Vision joint confidence 0...1
}

/// Joint keys: nose, neck, root, leftShoulder, rightShoulder, leftHip, rightHip,
/// leftKnee, rightKnee, leftAnkle, rightAnkle. Missing joints are simply absent.
struct PoseFrame: Codable, Hashable, Sendable {
    let t: TimeInterval            // seconds since session/clip start, monotonic
    let joints: [String: PosePoint]
}

struct FallDetectorConfig: Codable, Sendable {
    var minJointConfidence = 0.3
    var uprightMaxTorsoAngleDeg = 35.0      // torso (root->neck) angle from vertical while "upright"
    var fallenMinTorsoAngleDeg = 60.0       // angle from vertical counted as "horizontal"
    var minHipDropFraction = 0.20           // hip-centre drop, as a fraction of frame height
    var maxDropDuration: TimeInterval = 1.0 // drop must happen at least this fast
    var lowPostureHold: TimeInterval = 2.0  // must remain low/horizontal this long before alerting
    var cooldown: TimeInterval = 15.0       // minimum gap between two detections
}

extension FallDetectorConfig {
    /// Much easier to trigger, for testing with the web camera without really falling:
    /// bend your knees a little, lean far to one side and hold it for a second.
    /// Never used for the iPhone camera.
    static let easyTesting = FallDetectorConfig(
        fallenMinTorsoAngleDeg: 45,
        minHipDropFraction: 0.05,
        maxDropDuration: 1.5,
        lowPostureHold: 1.0,
        cooldown: 10)
}

struct FallDetection: Hashable, Sendable {
    let t: TimeInterval
    let score: Double          // 0...1 heuristic score
    let explanation: String    // e.g. "Hip height dropped 31% in 0.6 s; torso 78° from vertical for 2.1 s"
}

protocol FallDetecting {
    var config: FallDetectorConfig { get set }
    /// Feed frames in time order. Returns a detection at most once per cooldown window.
    mutating func process(_ frame: PoseFrame) -> FallDetection?
    mutating func reset()
}
