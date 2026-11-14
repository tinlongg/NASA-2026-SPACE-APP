import Foundation

/// Transparent possible-fall heuristic. Pure logic: no camera or Vision dependency.
///
/// upright -> rapid drop (hips fall fast and torso goes horizontal) -> stays low -> emit -> cooldown.
/// It flags a *possible* fall. It cannot tell a fall from a deliberate dive onto a mat,
/// and it is unreliable when the person falls straight toward or away from the camera.
struct HeuristicFallDetector: FallDetecting {
    var config: FallDetectorConfig
    /// Width divided by height of the frames the poses came from. Needed because pose
    /// coordinates are normalised per axis, which would otherwise distort angles.
    var frameAspectRatio: Double

    /// How long the pose may disappear during the low-posture hold before the hold is abandoned.
    static let poseLossTolerance: TimeInterval = 1.0

    private struct Sample {
        let t: TimeInterval
        let hipY: Double
    }

    private struct Hold {
        let start: TimeInterval
        let referenceHipY: Double
        let drop: Double
        let dropDuration: TimeInterval
        var maxAngle: Double
        var lostSince: TimeInterval?
    }

    struct Measurement: Equatable {
        let hipY: Double
        /// Degrees between the torso (hips to neck) and vertical. 0 = upright, 90 = horizontal.
        let torsoAngleDeg: Double
    }

    private var uprightHistory: [Sample] = []
    private var hold: Hold?
    private var lastDetectionTime: TimeInterval?
    private var lastFrameTime: TimeInterval?

    init(config: FallDetectorConfig = FallDetectorConfig(), frameAspectRatio: Double = 9.0 / 16.0) {
        self.config = config
        self.frameAspectRatio = frameAspectRatio
    }

    mutating func reset() {
        uprightHistory.removeAll()
        hold = nil
        lastDetectionTime = nil
        lastFrameTime = nil
    }

    mutating func process(_ frame: PoseFrame) -> FallDetection? {
        if let last = lastFrameTime, frame.t < last { reset() }
        lastFrameTime = frame.t
        uprightHistory.removeAll { frame.t - $0.t > config.maxDropDuration }

        guard let m = measure(frame) else {
            // Pose lost. Tolerate a short gap during a hold, then give up.
            if var h = hold {
                if let lost = h.lostSince {
                    if frame.t - lost > Self.poseLossTolerance { hold = nil }
                } else {
                    h.lostSince = frame.t
                    hold = h
                }
            }
            return nil
        }

        if var h = hold {
            h.lostSince = nil
            let stillLow = m.torsoAngleDeg >= config.fallenMinTorsoAngleDeg
                || m.hipY <= h.referenceHipY - h.drop / 2
            guard stillLow else {
                hold = nil
                if m.torsoAngleDeg <= config.uprightMaxTorsoAngleDeg {
                    uprightHistory.append(Sample(t: frame.t, hipY: m.hipY))
                }
                return nil
            }
            h.maxAngle = max(h.maxAngle, m.torsoAngleDeg)
            hold = h
            let held = frame.t - h.start
            guard held >= config.lowPostureHold else { return nil }
            hold = nil
            uprightHistory.removeAll()
            lastDetectionTime = frame.t
            return FallDetection(t: frame.t, score: score(for: h), explanation: explanation(for: h, held: held))
        }

        if m.torsoAngleDeg <= config.uprightMaxTorsoAngleDeg {
            uprightHistory.append(Sample(t: frame.t, hipY: m.hipY))
            return nil
        }
        guard m.torsoAngleDeg >= config.fallenMinTorsoAngleDeg else { return nil }
        if let last = lastDetectionTime, frame.t - last < config.cooldown { return nil }

        // The highest recent upright hip position is the reference the drop is measured from.
        guard let reference = uprightHistory.max(by: { $0.hipY < $1.hipY }) else { return nil }
        let drop = reference.hipY - m.hipY
        guard drop >= config.minHipDropFraction else { return nil }
        hold = Hold(start: frame.t, referenceHipY: reference.hipY, drop: drop,
                    dropDuration: frame.t - reference.t, maxAngle: m.torsoAngleDeg, lostSince: nil)
        return nil
    }

    // MARK: Measurement

    func measure(_ frame: PoseFrame) -> Measurement? {
        guard let top = point("neck", in: frame) ?? midpoint("leftShoulder", "rightShoulder", in: frame),
              let bottom = point("root", in: frame) ?? midpoint("leftHip", "rightHip", in: frame) else { return nil }
        let dx = (top.x - bottom.x) * frameAspectRatio
        let dy = top.y - bottom.y
        guard (dx * dx + dy * dy).squareRoot() > 0.02 else { return nil }
        let angle = atan2(abs(dx), dy) * 180 / .pi
        return Measurement(hipY: bottom.y, torsoAngleDeg: angle)
    }

    private func point(_ key: String, in frame: PoseFrame) -> (x: Double, y: Double)? {
        guard let p = frame.joints[key], p.c >= config.minJointConfidence else { return nil }
        return (p.x, p.y)
    }

    private func midpoint(_ a: String, _ b: String, in frame: PoseFrame) -> (x: Double, y: Double)? {
        guard let p = point(a, in: frame), let q = point(b, in: frame) else { return nil }
        return ((p.x + q.x) / 2, (p.y + q.y) / 2)
    }

    // MARK: Output

    private func score(for h: Hold) -> Double {
        let dropPart = min(1, (h.drop - config.minHipDropFraction) / max(config.minHipDropFraction, 0.01))
        let anglePart = min(1, max(0, (h.maxAngle - config.fallenMinTorsoAngleDeg)
                                      / max(90 - config.fallenMinTorsoAngleDeg, 1)))
        return min(1, 0.5 + 0.25 * dropPart + 0.25 * anglePart)
    }

    private func explanation(for h: Hold, held: TimeInterval) -> String {
        let drop = Int((h.drop * 100).rounded())
        let angle = Int(h.maxAngle.rounded())
        return String(format: "Hip height dropped %d%% of the frame in %.1f s; torso reached %d° from vertical; stayed low for %.1f s.",
                      drop, h.dropDuration, angle, held)
    }
}
