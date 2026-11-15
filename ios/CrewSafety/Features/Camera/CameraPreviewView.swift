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

/// Draws a stick figure for a pose. Used for replay, where there is no video to show.
struct PoseCanvas: View {
    let frame: PoseFrame?
    var aspectRatio: Double = 9.0 / 16.0

    private static let bones: [(String, String)] = [
        ("nose", "neck"), ("neck", "root"),
        ("leftShoulder", "rightShoulder"), ("leftHip", "rightHip"),
        ("leftHip", "leftKnee"), ("leftKnee", "leftAnkle"), ("leftHip", "leftAnkle"),
        ("rightHip", "rightKnee"), ("rightKnee", "rightAnkle"), ("rightHip", "rightAnkle"),
    ]

    var body: some View {
        Canvas { context, size in
            guard let frame else { return }
            func location(_ key: String) -> CGPoint? {
                guard let p = frame.joints[key] else { return nil }
                return CGPoint(x: p.x * size.width, y: (1 - p.y) * size.height)
            }
            let hasKnees = frame.joints["leftKnee"] != nil || frame.joints["rightKnee"] != nil
            for (a, b) in Self.bones {
                // Draw hip-to-ankle directly only when knees are missing.
                if hasKnees, a.hasSuffix("Hip"), b.hasSuffix("Ankle") { continue }
                guard let p = location(a), let q = location(b) else { continue }
                var path = Path()
                path.move(to: p)
                path.addLine(to: q)
                context.stroke(path, with: .color(Theme.Palette.neonYellow), lineWidth: 4)
            }
            for key in frame.joints.keys {
                guard let p = location(key) else { continue }
                context.fill(Path(ellipseIn: CGRect(x: p.x - 4, y: p.y - 4, width: 8, height: 8)), with: .color(.white))
            }
        }
        .aspectRatio(aspectRatio, contentMode: .fit)
        .accessibilityLabel("Stick figure of the replayed pose")
    }
}
