import AVFoundation
import SwiftUI
import UIKit

struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewUIView {
        let view = PreviewUIView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewUIView, context: Context) {
        if let connection = uiView.previewLayer.connection, connection.isVideoRotationAngleSupported(90) {
            connection.videoRotationAngle = 90
        }
    }

    final class PreviewUIView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
}

/// Draws a stick figure for a pose, with a bounding box around the person.
/// Used on its own for replay and the web camera, and over the video for the live iPhone camera.
struct PoseCanvas: View {
    let frame: PoseFrame?
    var aspectRatio: Double = 9.0 / 16.0
    /// Colour of the bounding box; nil hides it.
    var boxColor: Color? = nil
    /// Mirror horizontally, to match a mirrored front-camera preview.
    var mirrored = false
    /// Draw only the box, not the skeleton (over live video the person is already visible).
    var boxOnly = false

    private static let bones: [(String, String)] = [
        ("nose", "neck"), ("neck", "root"),
        ("leftShoulder", "rightShoulder"), ("leftHip", "rightHip"),
        ("leftHip", "leftKnee"), ("leftKnee", "leftAnkle"), ("leftHip", "leftAnkle"),
        ("rightHip", "rightKnee"), ("rightKnee", "rightAnkle"), ("rightHip", "rightAnkle"),
    ]

    var body: some View {
        Canvas { context, size in
            guard let frame, !frame.joints.isEmpty else { return }
            func location(_ p: PosePoint) -> CGPoint {
                let x = mirrored ? 1 - p.x : p.x
                return CGPoint(x: x * size.width, y: (1 - p.y) * size.height)
            }
            func location(_ key: String) -> CGPoint? { frame.joints[key].map(location) }

            if !boxOnly {
                let hasKnees = frame.joints["leftKnee"] != nil || frame.joints["rightKnee"] != nil
                for (a, b) in Self.bones {
                    // Draw hip-to-ankle directly only when knees are missing.
                    if hasKnees, a.hasSuffix("Hip"), b.hasSuffix("Ankle") { continue }
                    guard let p = location(a), let q = location(b) else { continue }
                    var path = Path()
                    path.move(to: p)
                    path.addLine(to: q)
                    context.stroke(path, with: .color(Theme.Palette.neonYellow), lineWidth: 3)
                }
                for point in frame.joints.values {
                    let p = location(point)
                    context.fill(Path(ellipseIn: CGRect(x: p.x - 3.5, y: p.y - 3.5, width: 7, height: 7)), with: .color(.white))
                }
            }

            guard let boxColor, let box = Self.boundingBox(frame, size: size, location: location) else { return }
            context.stroke(Path(roundedRect: box, cornerRadius: 6), with: .color(boxColor), lineWidth: 2)
            let confidence = frame.joints.values.map(\.c).reduce(0, +) / Double(frame.joints.count)
            let label = Text("Person \(Int((confidence * 100).rounded()))%")
                .font(.caption2.weight(.semibold).monospacedDigit())
                .foregroundColor(.white)
            let resolved = context.resolve(label)
            let textSize = resolved.measure(in: size)
            let tag = CGRect(x: box.minX, y: max(0, box.minY - textSize.height - 6),
                             width: textSize.width + 10, height: textSize.height + 4)
            context.fill(Path(roundedRect: tag, cornerRadius: 4), with: .color(boxColor))
            context.draw(resolved, at: CGPoint(x: tag.midX, y: tag.midY))
        }
        .aspectRatio(aspectRatio, contentMode: .fit)
        .accessibilityLabel(frame?.joints.isEmpty == false ? "Pose with bounding box" : "No person in view")
    }

    /// The box around all joints, padded a little and kept inside the canvas.
    static func boundingBox(_ frame: PoseFrame, size: CGSize, location: (PosePoint) -> CGPoint) -> CGRect? {
        let points = frame.joints.values.map(location)
        guard let minX = points.map(\.x).min(), let maxX = points.map(\.x).max(),
              let minY = points.map(\.y).min(), let maxY = points.map(\.y).max() else { return nil }
        let pad = max(8, 0.06 * max(maxX - minX, maxY - minY))
        let rect = CGRect(x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad)
        return rect.intersection(CGRect(origin: .zero, size: size))
    }
}

/// Places a pose canvas over an aspect-fill camera preview so the box lines up with the video.
struct AspectFillPoseOverlay: View {
    let frame: PoseFrame?
    let aspectRatio: Double
    let boxColor: Color?
    var mirrored = false

    var body: some View {
        GeometryReader { geo in
            let container = geo.size
            let fitsWide = container.width / max(container.height, 1) > aspectRatio
            let content = fitsWide
                ? CGSize(width: container.width, height: container.width / aspectRatio)
                : CGSize(width: container.height * aspectRatio, height: container.height)
            PoseCanvas(frame: frame, aspectRatio: aspectRatio, boxColor: boxColor, mirrored: mirrored, boxOnly: true)
                .frame(width: content.width, height: content.height)
                .position(x: container.width / 2, y: container.height / 2)
        }
        .allowsHitTesting(false)
    }
}
