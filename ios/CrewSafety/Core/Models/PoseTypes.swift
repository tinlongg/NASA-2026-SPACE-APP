import Foundation

// MARK: - Inactivity detection contract (pure logic; no AVFoundation/Vision imports)
struct PosePoint: Codable, Hashable, Sendable {
    let x: Double   // 0...1, origin bottom-left, +y is up in the image
    let y: Double
    let c: Double   // joint confidence 0...1
}

/// Joint keys: nose, neck, root, leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist,
/// rightWrist, leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle. Missing joints are absent.
struct PoseFrame: Codable, Hashable, Sendable {
    let t: TimeInterval            // seconds since session/clip start, monotonic
    let joints: [String: PosePoint]
}

/// Thresholds for the possible-unresponsive heuristic. Starting values, not validated on people.
struct InactivityDetectorConfig: Codable, Sendable, Equatable {
    var minJointConfidence = 0.3
    /// Largest single-joint displacement, in torso lengths, that still counts as holding still.
    var moveThreshold = 0.25
    /// Seconds without movement, while in view, before an alert.
    var stillDuration: TimeInterval = 15
    /// A pose gap longer than this means the person left the view; the timer restarts.
    var poseLossTolerance: TimeInterval = 2
}

extension InactivityDetectorConfig {
    /// Shorter wait, for testing with the web camera: hold still for 8 seconds.
    /// Never used for the iPhone camera.
    static let easyTesting = InactivityDetectorConfig(stillDuration: 8)
}

struct InactivityDetection: Hashable, Sendable {
    let t: TimeInterval
    /// Seconds the crew member had held still when the alert fired.
    let stillFor: TimeInterval
    let explanation: String
}

protocol InactivityDetecting {
    var config: InactivityDetectorConfig { get set }
    /// Feed frames in time order. Returns at most one detection per still period.
    mutating func process(_ frame: PoseFrame) -> InactivityDetection?
    mutating func reset()
}
