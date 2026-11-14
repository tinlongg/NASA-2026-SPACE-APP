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

/// Generated stick-figure motion used for unit tests and for the "Synthetic" replay entries.
/// These are NOT recordings of a person. They exist so the detector path can be exercised
/// before real fixtures are recorded on a device.
enum SyntheticPoses {
    static let fps = 10.0

    private struct Pose {
        var hip: (x: Double, y: Double)
        var neck: (x: Double, y: Double)
    }

    private static let standing = Pose(hip: (0.5, 0.50), neck: (0.5, 0.72))
    private static let sitting = Pose(hip: (0.5, 0.30), neck: (0.5, 0.52))
    private static let lying = Pose(hip: (0.45, 0.14), neck: (0.72, 0.16))

    private static func frame(_ p: Pose, t: TimeInterval) -> PoseFrame {
        func pt(_ x: Double, _ y: Double) -> PosePoint { PosePoint(x: x, y: y, c: 0.9) }
        // Derive the remaining joints from hip and neck so the stick figure can be drawn.
        let ux = p.neck.x - p.hip.x, uy = p.neck.y - p.hip.y            // torso direction
        let px = -uy * 0.35, py = ux * 0.35                              // perpendicular, for width
        let legX = p.hip.x - ux * 0.2, legY = max(0.03, p.hip.y - max(abs(uy), 0.05) * 1.6)
        return PoseFrame(t: t, joints: [
            "root": pt(p.hip.x, p.hip.y),
            "neck": pt(p.neck.x, p.neck.y),
            "nose": pt(p.neck.x + ux * 0.3, p.neck.y + uy * 0.3),
            "leftShoulder": pt(p.neck.x + px, p.neck.y + py),
            "rightShoulder": pt(p.neck.x - px, p.neck.y - py),
            "leftHip": pt(p.hip.x + px * 0.6, p.hip.y + py * 0.6),
            "rightHip": pt(p.hip.x - px * 0.6, p.hip.y - py * 0.6),
            "leftAnkle": pt(legX + px * 0.6, legY),
            "rightAnkle": pt(legX - px * 0.6, legY),
        ])
    }

    private static func lerp(_ a: Pose, _ b: Pose, _ s: Double) -> Pose {
        Pose(hip: (a.hip.x + (b.hip.x - a.hip.x) * s, a.hip.y + (b.hip.y - a.hip.y) * s),
             neck: (a.neck.x + (b.neck.x - a.neck.x) * s, a.neck.y + (b.neck.y - a.neck.y) * s))
    }

    /// Segments are (target pose, seconds to reach it). A hold is a segment whose target equals the current pose.
    private static func sequence(start: Pose, startTime: TimeInterval = 0,
                                 _ segments: [(Pose, TimeInterval)]) -> [PoseFrame] {
        var frames: [PoseFrame] = []
        var current = start
        var t = startTime
        for (target, duration) in segments {
            let steps = max(1, Int((duration * fps).rounded()))
            for i in 1...steps {
                t += 1 / fps
                frames.append(frame(lerp(current, target, Double(i) / Double(steps)), t: t))
            }
            current = target
        }
        return frames
    }

    static func fall(startTime: TimeInterval = 0, standFor: TimeInterval = 2, stayDownFor: TimeInterval = 4) -> [PoseFrame] {
        sequence(start: standing, startTime: startTime,
                 [(standing, standFor), (lying, 0.5), (lying, stayDownFor)])
    }

    static func fallThenGetUp(startTime: TimeInterval = 0) -> [PoseFrame] {
        sequence(start: standing, startTime: startTime,
                 [(standing, 1), (lying, 0.5), (lying, 0.8), (standing, 0.6), (standing, 3)])
    }

    static func sitDown() -> [PoseFrame] {
        sequence(start: standing, [(standing, 2), (sitting, 0.6), (sitting, 4)])
    }

    static func lieDownSlowly() -> [PoseFrame] {
        sequence(start: standing, [(standing, 2), (lying, 3), (lying, 4)])
    }

    static func walk() -> [PoseFrame] {
        var segments: [(Pose, TimeInterval)] = []
        for i in 0..<8 {
            let x = i % 2 == 0 ? 0.3 : 0.7
            segments.append((Pose(hip: (x, 0.5), neck: (x + 0.02, 0.72)), 1))
        }
        return sequence(start: standing, segments)
    }

    static func stand() -> [PoseFrame] {
        sequence(start: standing, [(standing, 6)])
    }

    static var fixtures: [PoseFixture] {
        [
            PoseFixture(name: "synthetic_fall", label: "fall", fps: fps, frames: fall()),
            PoseFixture(name: "synthetic_sit_down", label: "sit", fps: fps, frames: sitDown()),
            PoseFixture(name: "synthetic_lie_down_slowly", label: "lie_down_slow", fps: fps, frames: lieDownSlowly()),
        ]
    }
}
