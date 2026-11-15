import Foundation

/// A recorded or generated pose sequence that can be replayed through the detector.
/// JSON format is defined in docs/EXECUTION_PLAN.md section 5.5.
struct PoseFixture: Codable, Identifiable, Hashable {
    var id: String { name }
    let name: String
    let label: String
    let fps: Double
    let frames: [PoseFrame]

    /// Width/height of the frames the poses were captured from. Optional in the file; defaults to portrait 9:16.
    var aspectRatio: Double?

    var displayName: String {
        name.replacingOccurrences(of: "_", with: " ").capitalized
    }

    /// Every bundled JSON file that decodes as a fixture. Other JSON resources are skipped.
    static func bundled(in bundle: Bundle = .main) -> [PoseFixture] {
        let urls = bundle.urls(forResourcesWithExtension: "json", subdirectory: nil) ?? []
        let decoder = JSONDecoder()
        return urls.compactMap { url in
            guard let data = try? Data(contentsOf: url) else { return nil }
            return try? decoder.decode(PoseFixture.self, from: data)
        }
        .filter { !$0.frames.isEmpty }
        .sorted { $0.name < $1.name }
    }
}

/// Generated floating stick figures used for unit tests and for the "Synthetic" replay entries.
/// These are NOT recordings of a person. They exist so the detector path can be exercised
/// before real fixtures are recorded on a device. Mirrors web/dist/fixtures.js.
enum SyntheticPoses {
    static let fps = 10.0

    /// One body in torso lengths around the torso centre, +y up.
    private static let body: [String: (Double, Double)] = [
        "nose": (0, 1.05), "neck": (0, 0.5), "root": (0, -0.5),
        "leftShoulder": (-0.32, 0.5), "rightShoulder": (0.32, 0.5),
        "leftElbow": (-0.55, 0.1), "rightElbow": (0.55, 0.1),
        "leftWrist": (-0.62, -0.32), "rightWrist": (0.62, -0.32),
        "leftHip": (-0.2, -0.5), "rightHip": (0.2, -0.5),
        "leftKnee": (-0.28, -1.05), "rightKnee": (0.28, -1.05),
        "leftAnkle": (-0.3, -1.6), "rightAnkle": (0.3, -1.6),
    ]

    /// `arm` raises the left arm and swings the right one; `leg` swings the left leg (0...1).
    struct Pose {
        var x = 0.5, y = 0.5, turn = 0.0, size = 0.12, arm = 0.0, leg = 0.0
    }

    static func frame(_ pose: Pose, t: TimeInterval) -> PoseFrame {
        let c = cos(pose.turn), s = sin(pose.turn)
        var joints: [String: PosePoint] = [:]
        for (key, base) in body {
            var (bx, by) = base
            switch key {
            case "leftElbow": by += pose.arm * 0.45
            case "leftWrist": by += pose.arm * 0.9
            case "rightElbow": bx += pose.arm * 0.25
            case "rightWrist": bx += pose.arm * 0.5
            case "leftKnee": bx -= pose.leg * 0.25
            case "leftAnkle": bx -= pose.leg * 0.5
            default: break
            }
            // Positions are in a portrait 9:16 frame, so x is divided by the aspect ratio.
            let x = pose.x + (bx * c - by * s) * pose.size / (9.0 / 16.0)
            let y = pose.y + (bx * s + by * c) * pose.size
            joints[key] = PosePoint(x: x, y: y, c: 0.9)
        }
        return PoseFrame(t: t, joints: joints)
    }

    private static func moving(_ t: TimeInterval) -> Pose {
        Pose(arm: (sin(t * 2.4) + 1) / 2, leg: (sin(t * 1.7) + 1) / 3)
    }

    private static func frames(duration: TimeInterval, _ pose: (TimeInterval) -> Pose?) -> [PoseFrame] {
        stride(from: 0.0, through: duration, by: 1 / fps).map { t in
            pose(t).map { frame($0, t: t) } ?? PoseFrame(t: t, joints: [:])
        }
    }

    /// Moves continuously while drifting a little.
    static func working(duration: TimeInterval = 20) -> [PoseFrame] {
        frames(duration: duration) { t in
            var pose = moving(t)
            pose.x = 0.5 + sin(t * 0.3) * 0.05
            return pose
        }
    }

    /// Mostly still, with a short reach every 6 s.
    static func resting(duration: TimeInterval = 20) -> [PoseFrame] {
        frames(duration: duration) { t in
            let phase = t.truncatingRemainder(dividingBy: 6)
            return Pose(turn: 0.1, arm: phase < 1 ? sin(phase * .pi) : 0)
        }
    }

    /// Moves for `moveFor` seconds, then holds completely still.
    static func stopsMoving(moveFor: TimeInterval = 2.5, duration: TimeInterval = 20) -> [PoseFrame] {
        frames(duration: duration) { t in moving(min(t, moveFor)) }
    }

    /// Limbs stop at 2.5 s; the body keeps drifting and slowly rotating, as it would in microgravity.
    static func limpAndTumbling(duration: TimeInterval = 20) -> [PoseFrame] {
        frames(duration: duration) { t in
            var pose = moving(min(t, 2.5))
            let drift = max(0, t - 2.5)
            pose.x = 0.5 - drift * 0.01
            pose.y = 0.5 + drift * 0.004
            pose.turn = drift * 0.09
            return pose
        }
    }

    /// Holds still, leaves the view for 4 s at 9 s, then comes back still.
    static func leavesView(duration: TimeInterval = 20) -> [PoseFrame] {
        frames(duration: duration) { t in t >= 9 && t < 13 ? nil : moving(min(t, 2.5)) }
    }

    static var fixtures: [PoseFixture] {
        [
            PoseFixture(name: "synthetic_working", label: "moving", fps: fps, frames: working()),
            PoseFixture(name: "synthetic_resting", label: "moving", fps: fps, frames: resting()),
            PoseFixture(name: "synthetic_stops_moving", label: "unresponsive", fps: fps, frames: stopsMoving()),
            PoseFixture(name: "synthetic_limp_and_tumbling", label: "unresponsive", fps: fps, frames: limpAndTumbling()),
            PoseFixture(name: "synthetic_leaves_view", label: "out_of_view", fps: fps, frames: leavesView()),
        ]
    }
}
