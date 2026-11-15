import CoreVideo
import Vision

/// Runs Apple Vision body-pose estimation on one frame and converts it to the neutral joint dictionary.
/// Not thread-safe; use from one queue.
final class PoseEstimator {
    private let request = VNDetectHumanBodyPoseRequest()

    private static let jointKeys: [VNHumanBodyPoseObservation.JointName: String] = [
        .nose: "nose", .neck: "neck", .root: "root",
        .leftShoulder: "leftShoulder", .rightShoulder: "rightShoulder",
        .leftElbow: "leftElbow", .rightElbow: "rightElbow", .leftWrist: "leftWrist", .rightWrist: "rightWrist",
        .leftHip: "leftHip", .rightHip: "rightHip",
        .leftKnee: "leftKnee", .rightKnee: "rightKnee",
        .leftAnkle: "leftAnkle", .rightAnkle: "rightAnkle",
    ]

    /// Returns an empty dictionary when no person is found. The buffer must already be upright.
    func joints(in pixelBuffer: CVPixelBuffer) -> [String: PosePoint] {
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return [:]
        }
        guard let observations = request.results, !observations.isEmpty else { return [:] }

        // With several people in frame, keep the one covering the largest area.
        var best: [String: PosePoint] = [:]
        var bestArea = -1.0
        for observation in observations {
            guard let points = try? observation.recognizedPoints(.all) else { continue }
            var joints: [String: PosePoint] = [:]
            var minX = 1.0, maxX = 0.0, minY = 1.0, maxY = 0.0
            for (name, key) in Self.jointKeys {
                guard let p = points[name], p.confidence > 0.05 else { continue }
                let x = Double(p.location.x), y = Double(p.location.y)
                joints[key] = PosePoint(x: x, y: y, c: Double(p.confidence))
                minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
            }
            let area = max(0, maxX - minX) * max(0, maxY - minY)
            if !joints.isEmpty, area > bestArea {
                bestArea = area
                best = joints
            }
        }
        return best
    }
}
