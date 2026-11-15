import Foundation

/// Transparent possible-unresponsive heuristic for crew in microgravity. Pure logic: no camera or Vision.
///
/// A floating crew member cannot fall, so the signal is the absence of movement while they are in view.
/// Each joint is measured relative to the torso centre, rotated so the torso points up and scaled by
/// torso length. Drifting across the frame or tumbling slowly with limp limbs is therefore *not* movement.
/// When no joint moves more than `moveThreshold` from the last moving pose for `stillDuration`, one
/// detection fires; the person must move again before another can. Sleep, reading or holding still on
/// purpose will trigger it, and a person facing straight at the camera shows less limb movement.
/// The web companion uses the same rules (web/dist/detector.js).
struct InactivityDetector: InactivityDetecting {
    var config: InactivityDetectorConfig
    /// Width divided by height of the source frames. Pose coordinates are normalised per axis,
    /// so x is scaled by this before measuring distances.
    var frameAspectRatio: Double

    typealias Shape = [String: (x: Double, y: Double)]

    /// What the detector sees right now, for the live readout. Updated on every frame.
    struct Reading: Equatable {
        enum Phase: Equatable {
            case noPerson
            /// Moved recently.
            case moving
            /// In view and holding still; `stillFor` counts toward `stillDuration`.
            case still
            /// Detection fired; waiting for movement before re-arming.
            case alerted
        }
        var phase: Phase = .noPerson
        /// Mean joint confidence from the pose estimator, 0...1. This one is a real model confidence.
        var poseConfidence: Double?
        /// Largest joint displacement since the last movement, in torso lengths.
        var motion: Double?
        var stillFor: TimeInterval = 0
    }

    private(set) var reading = Reading()
    private var anchor: Shape?
    private var stillSince: TimeInterval?
    private var lostSince: TimeInterval?
    private var alerted = false
    private var lastFrameTime: TimeInterval?

    init(config: InactivityDetectorConfig = InactivityDetectorConfig(), frameAspectRatio: Double = 9.0 / 16.0) {
        self.config = config
        self.frameAspectRatio = frameAspectRatio
    }

    mutating func reset() {
        anchor = nil
        stillSince = nil
        lostSince = nil
        alerted = false
        lastFrameTime = nil
        reading = Reading()
    }

    mutating func process(_ frame: PoseFrame) -> InactivityDetection? {
        if let last = lastFrameTime, frame.t < last { reset() }
        lastFrameTime = frame.t
        let confidences = frame.joints.values.map(\.c)
        reading.poseConfidence = confidences.isEmpty ? nil : confidences.reduce(0, +) / Double(confidences.count)

        guard let current = shape(frame) else {
            // Out of view is not unresponsive. Keep the timer through a short gap, then restart it.
            let lost = lostSince ?? frame.t
            lostSince = lost
            if frame.t - lost > config.poseLossTolerance {
                anchor = nil
                stillSince = nil
                alerted = false
            }
            reading.phase = .noPerson
            reading.motion = nil
            reading.stillFor = 0
            return nil
        }
        lostSince = nil

        guard let reference = anchor, let since = stillSince else {
            anchor = current
            stillSince = frame.t
            reading.phase = .moving
            reading.motion = 0
            reading.stillFor = 0
            return nil
        }

        let motion = Self.change(from: reference, to: current)
        reading.motion = motion
        if motion > config.moveThreshold {
            anchor = current
            stillSince = frame.t
            alerted = false
            reading.phase = .moving
            reading.stillFor = 0
            return nil
        }

        let still = frame.t - since
        reading.stillFor = still
        if alerted {
            reading.phase = .alerted
            return nil
        }
        reading.phase = .still
        guard still >= config.stillDuration else { return nil }
        alerted = true
        reading.phase = .alerted
        return InactivityDetection(t: frame.t, stillFor: still, explanation: Self.explanation(still: still, threshold: config.moveThreshold))
    }

    // MARK: Measurement

    /// Joints relative to the torso centre, torso rotated to point up, in torso lengths. Nil without a torso.
    func shape(_ frame: PoseFrame) -> Shape? {
        guard let top = point("neck", in: frame) ?? midpoint("leftShoulder", "rightShoulder", in: frame),
              let bottom = point("root", in: frame) ?? midpoint("leftHip", "rightHip", in: frame) else { return nil }
        let dx = top.x - bottom.x, dy = top.y - bottom.y
        let length = (dx * dx + dy * dy).squareRoot()
        guard length > 0.02 else { return nil }
        // Rotate by the torso's angle from +y so the torso always points straight up.
        let angle = atan2(dx, dy)
        let c = cos(angle), s = sin(angle)
        let centre = ((top.x + bottom.x) / 2, (top.y + bottom.y) / 2)
        var result: Shape = [:]
        for key in frame.joints.keys {
            guard let p = point(key, in: frame) else { continue }
            let x = (p.x - centre.0) / length, y = (p.y - centre.1) / length
            result[key] = (x * c - y * s, x * s + y * c)
        }
        return result
    }

    /// Largest displacement of any joint present in both shapes.
    static func change(from a: Shape, to b: Shape) -> Double {
        var largest = 0.0
        for (key, p) in a {
            guard let q = b[key] else { continue }
            largest = max(largest, ((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y)).squareRoot())
        }
        return largest
    }

    private func point(_ key: String, in frame: PoseFrame) -> (x: Double, y: Double)? {
        guard let p = frame.joints[key], p.c >= config.minJointConfidence else { return nil }
        return (p.x * frameAspectRatio, p.y)
    }

    private func midpoint(_ a: String, _ b: String, in frame: PoseFrame) -> (x: Double, y: Double)? {
        guard let p = point(a, in: frame), let q = point(b, in: frame) else { return nil }
        return ((p.x + q.x) / 2, (p.y + q.y) / 2)
    }

    private static func explanation(still: TimeInterval, threshold: Double) -> String {
        String(format: "No body movement for %.0f s while in view (no joint moved more than %.2f torso lengths).", still, threshold)
    }
}
